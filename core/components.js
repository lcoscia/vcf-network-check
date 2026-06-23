// Pure calculation: derives per-component IP/FQDN totals for the current project configuration
// from the static COMPONENT_REFERENCE table.

import { COMPONENT_REFERENCE } from './reference.js?v=1.10.0';

const MGMT_DOMAIN_LABEL = 'Management Domain';

function ref(id) { return COMPONENT_REFERENCE.find(c => c.id === id); }

function sumPerDomain(perDomain) {
  return {
    units: perDomain.reduce((s, d) => s + d.units, 0),
    totalIps: perDomain.reduce((s, d) => s + d.totalIps, 0),
    totalFqdns: perDomain.reduce((s, d) => s + d.totalFqdns, 0),
  };
}

// Each rule returns { units, totalIps, totalFqdns, perDomain? } derived from project/mgmt/workloadDomains.
// perDomain (when present) is [{ domain, units, totalIps, totalFqdns }] — one entry per domain that
// actually carries this component, since each domain (Management + each Workload Domain) is its own
// VLAN/network pool in VCF and IP requirements should not be conflated across domains.
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
    const perDomain = [
      { domain: MGMT_DOMAIN_LABEL, units: 1, totalIps: r.ipsPerUnit, totalFqdns: r.fqdnsPerUnit },
      ...workloadDomains.map(w => ({ domain: w.domainName, units: 1, totalIps: r.ipsPerUnit, totalFqdns: r.fqdnsPerUnit })),
    ];
    return { ...sumPerDomain(perDomain), perDomain };
  },
  'nsx-manager'(mgmt, workloadDomains) {
    const mgmtNodes = (mgmt.nsxManagerMode === 'clustered' ? 3 : 1) + 1;
    const wlds = workloadDomains.filter(w => w.nsxEnabled && w.nsxManagerMode !== 'shared');
    const perDomain = [
      { domain: MGMT_DOMAIN_LABEL, units: 1, totalIps: mgmtNodes, totalFqdns: mgmtNodes },
      ...wlds.map(w => {
        const nodes = (w.nsxManagerMode === 'clustered' ? 3 : 1) + 1;
        return { domain: w.domainName, units: 1, totalIps: nodes, totalFqdns: nodes };
      }),
    ];
    return { ...sumPerDomain(perDomain), perDomain };
  },
  'nsx-edge'(mgmt, workloadDomains) {
    const wlds = workloadDomains.filter(w => w.edgeRequired);
    const perDomain = [
      ...(mgmt.nsxEdgeDeployed ? [{ domain: MGMT_DOMAIN_LABEL, units: 1, totalIps: mgmt.nsxEdgeNodeCount, totalFqdns: mgmt.nsxEdgeNodeCount }] : []),
      ...wlds.map(w => ({ domain: w.domainName, units: 1, totalIps: w.edgeNodeCount, totalFqdns: w.edgeNodeCount })),
    ];
    return { ...sumPerDomain(perDomain), perDomain };
  },
  'esxi-host'(mgmt, workloadDomains) {
    // Each domain is its own VLAN/network pool (see core/vlan.js, wld.dedicatedVLANs) —
    // ESXi management VMK IPs for a workload domain are not drawn from the management domain's pool.
    const perDomain = [
      { domain: MGMT_DOMAIN_LABEL, units: mgmt.hostCount, totalIps: mgmt.hostCount, totalFqdns: mgmt.hostCount },
      ...workloadDomains.map(w => ({ domain: w.domainName, units: w.hostCount, totalIps: w.hostCount, totalFqdns: w.hostCount })),
    ];
    return { ...sumPerDomain(perDomain), perDomain };
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
  'avi-se'(mgmt, workloadDomains) {
    // Avi Service Engines are deployed per workload domain (own dedicated VIP network/VLAN —
    // see core/vlan.js 'AVI VIP Network' and the avi-se-* appliances in core/appliances.js).
    // Only the Controller cluster is centralized in the Management Domain (see 'avi-controller').
    const r = ref('avi-se');
    const wlds = workloadDomains.filter(w => w.aviEnabled);
    const perDomain = wlds.map(w => ({ domain: w.domainName, units: 1, totalIps: r.ipsPerUnit, totalFqdns: 0 }));
    return { ...sumPerDomain(perDomain), perDomain };
  },
  'vks-supervisor'(mgmt, workloadDomains, project) {
    const r = ref('vks-supervisor');
    const wlds = workloadDomains.filter(w => w.vksEnabled);
    const mgmtVks = mgmt.vksEnabled || project?.scenario === 'vcf-automation-vks';
    const perDomain = [
      ...(mgmtVks ? [{ domain: MGMT_DOMAIN_LABEL, units: 1, totalIps: r.ipsPerUnit, totalFqdns: r.fqdnsPerUnit }] : []),
      ...wlds.map(w => ({ domain: w.domainName, units: 1, totalIps: r.ipsPerUnit, totalFqdns: r.fqdnsPerUnit })),
    ];
    return { ...sumPerDomain(perDomain), perDomain };
  },
  'ssp'(mgmt, workloadDomains) {
    // 1:1:1 with an NSX Manager cluster — mirrors RULES['nsx-manager']'s shared-cluster
    // exclusion so domains on a shared NSX Manager (reusing another domain's SSP instance)
    // are not double-counted.
    const r = ref('ssp');
    const wlds = workloadDomains.filter(w => w.sspEnabled && w.nsxEnabled && w.nsxManagerMode !== 'shared');
    const mgmtSsp = mgmt.sspEnabled ? 1 : 0;
    const perDomain = [
      { domain: MGMT_DOMAIN_LABEL, units: mgmtSsp, totalIps: mgmtSsp * r.ipsPerUnit, totalFqdns: mgmtSsp * r.fqdnsPerUnit },
      ...wlds.map(w => ({ domain: w.domainName, units: 1, totalIps: r.ipsPerUnit, totalFqdns: r.fqdnsPerUnit })),
    ];
    return { ...sumPerDomain(perDomain), perDomain };
  },
  'license-hub'(mgmt, workloadDomains) {
    const r = ref('license-hub');
    const anySsp = !!mgmt.sspEnabled || workloadDomains.some(w => w.sspEnabled);
    const anyAvi = !!mgmt.aviDeployed || workloadDomains.some(w => w.aviEnabled);
    const units = (anySsp || anyAvi) ? 1 : 0;
    return { units, totalIps: units * r.ipsPerUnit, totalFqdns: units * r.fqdnsPerUnit };
  },
};

/**
 * @param {object} project - global project settings.
 * @param {object} mgmt - managementDomain state.
 * @param {object[]} workloadDomains - array of workload domain objects.
 * @returns {{components: Array<{id:string,label:string,scope:string,ipsPerUnit:number,fqdnsPerUnit:number,units:number,totalIps:number,totalFqdns:number,present:boolean,notes:string,perDomain?:Array}>, totalIps:number, totalFqdns:number}}
 */
export function computeComponentRequirements(project, mgmt, workloadDomains) {
  const components = COMPONENT_REFERENCE.map(r => {
    const rule = RULES[r.id];
    const { units, totalIps, totalFqdns, perDomain } = rule(mgmt, workloadDomains, project);
    return {
      id: r.id, label: r.label, scope: r.scope,
      ipsPerUnit: r.ipsPerUnit, fqdnsPerUnit: r.fqdnsPerUnit,
      units, totalIps, totalFqdns,
      present: units > 0,
      notes: r.notes,
      ...(perDomain ? { perDomain } : {}),
    };
  });
  return {
    components,
    totalIps: components.reduce((s, c) => s + c.totalIps, 0),
    totalFqdns: components.reduce((s, c) => s + c.totalFqdns, 0),
  };
}
