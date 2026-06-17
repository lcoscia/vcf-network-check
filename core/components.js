// Pure calculation: derives per-component IP/FQDN totals for the current project configuration
// from the static COMPONENT_REFERENCE table.

import { COMPONENT_REFERENCE } from './reference.js';

function ref(id) { return COMPONENT_REFERENCE.find(c => c.id === id); }

// Each rule returns { units, totalIps, totalFqdns } derived from project/mgmt/workloadDomains.
const RULES = {
  'vcf-mgmt-services'(mgmt) {
    const r = ref('vcf-mgmt-services');
    return { units: 1, totalIps: r.ipsPerUnit, totalFqdns: r.fqdnsPerUnit };
  },
  'sddc-manager'(mgmt) {
    const r = ref('sddc-manager');
    return { units: 1, totalIps: r.ipsPerUnit, totalFqdns: r.fqdnsPerUnit };
  },
  'license-server'(mgmt) {
    const r = ref('license-server');
    const units = (mgmt.vcfOperations?.enabled && mgmt.vcfOperations?.licenseServerEnabled) ? 1 : 0;
    return { units, totalIps: units * r.ipsPerUnit, totalFqdns: units * r.fqdnsPerUnit };
  },
  'vcenter'(mgmt, workloadDomains) {
    const r = ref('vcenter');
    const units = 1 + workloadDomains.length;
    return { units, totalIps: units * r.ipsPerUnit, totalFqdns: units * r.fqdnsPerUnit };
  },
  'nsx-manager'(mgmt, workloadDomains) {
    const mgmtNodes = (mgmt.nsxManagerMode === 'clustered' ? 3 : 1) + 1;
    const wlds = workloadDomains.filter(w => w.nsxEnabled && w.nsxManagerMode !== 'shared');
    const wldNodes = wlds.reduce((s, w) => s + (w.nsxManagerMode === 'clustered' ? 3 : 1) + 1, 0);
    const units = 1 + wlds.length;
    const totalIps = mgmtNodes + wldNodes;
    return { units, totalIps, totalFqdns: totalIps };
  },
  'nsx-edge'(mgmt, workloadDomains) {
    const mgmtUnits = mgmt.nsxEdgeDeployed ? 1 : 0;
    const mgmtIps = mgmt.nsxEdgeDeployed ? mgmt.nsxEdgeNodeCount : 0;
    const wlds = workloadDomains.filter(w => w.edgeRequired);
    const wldIps = wlds.reduce((s, w) => s + w.edgeNodeCount, 0);
    const units = mgmtUnits + wlds.length;
    const totalIps = mgmtIps + wldIps;
    return { units, totalIps, totalFqdns: totalIps };
  },
  'esxi-host'(mgmt, workloadDomains) {
    const units = mgmt.hostCount + workloadDomains.reduce((s, w) => s + w.hostCount, 0);
    return { units, totalIps: units, totalFqdns: units };
  },
  'vcf-operations'(mgmt) {
    const enabled = !!mgmt.vcfOperations?.enabled;
    const ips = mgmt.vcfOperations?.mode === 'enterprise' ? 4 : 1;
    const units = enabled ? 1 : 0;
    return { units, totalIps: enabled ? ips : 0, totalFqdns: enabled ? ips : 0 };
  },
  'ops-collector'(mgmt) {
    const units = mgmt.vcfOperations?.enabled ? (mgmt.vcfOperations.remoteCollectorCount || 0) : 0;
    return { units, totalIps: units, totalFqdns: units };
  },
  'vcf-automation'(mgmt) {
    const enabled = !!mgmt.vcfAutomation?.enabled;
    const ips = mgmt.vcfAutomation?.mode === 'clustered' ? 7 : 2;
    const units = enabled ? 1 : 0;
    return { units, totalIps: enabled ? ips : 0, totalFqdns: enabled ? 2 : 0 };
  },
  'avi-controller'(mgmt) {
    const r = ref('avi-controller');
    const units = mgmt.aviDeployed ? 1 : 0;
    return { units, totalIps: units * r.ipsPerUnit, totalFqdns: units * r.fqdnsPerUnit };
  },
  'avi-se'(mgmt) {
    // Single shared SE pool per Avi deployment (not per-WLD) — matches the pptx reference design,
    // which models Service Engines as one shared infrastructure pool, not one per workload domain.
    const r = ref('avi-se');
    const units = mgmt.aviDeployed ? 1 : 0;
    return { units, totalIps: units * r.ipsPerUnit, totalFqdns: 0 };
  },
  'vks-supervisor'(mgmt, workloadDomains) {
    const r = ref('vks-supervisor');
    const units = (mgmt.vksEnabled ? 1 : 0) + workloadDomains.filter(w => w.vksEnabled).length;
    return { units, totalIps: units * r.ipsPerUnit, totalFqdns: units * r.fqdnsPerUnit };
  },
};

/**
 * @param {object} project - global project settings.
 * @param {object} mgmt - managementDomain state.
 * @param {object[]} workloadDomains - array of workload domain objects.
 * @returns {{components: Array<{id:string,label:string,scope:string,ipsPerUnit:number,fqdnsPerUnit:number,units:number,totalIps:number,totalFqdns:number,present:boolean,notes:string}>, totalIps:number, totalFqdns:number}}
 */
export function computeComponentRequirements(project, mgmt, workloadDomains) {
  const components = COMPONENT_REFERENCE.map(r => {
    const rule = RULES[r.id];
    const { units, totalIps, totalFqdns } = rule(mgmt, workloadDomains, project);
    return {
      id: r.id, label: r.label, scope: r.scope,
      ipsPerUnit: r.ipsPerUnit, fqdnsPerUnit: r.fqdnsPerUnit,
      units, totalIps, totalFqdns,
      present: units > 0,
      notes: r.notes,
    };
  });
  return {
    components,
    totalIps: components.reduce((s, c) => s + c.totalIps, 0),
    totalFqdns: components.reduce((s, c) => s + c.totalFqdns, 0),
  };
}
