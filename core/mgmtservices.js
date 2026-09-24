// Pure VCF 9.1+ Management Services IP planning: services runtime node pool sizing, endpoint FQDN/IPs that must
// sit outside that pool, and the VCF Automation node range. Single source of truth for core/vlan.js,
// core/components.js, core/validation.js and the UI banner.
//
// Broadcom TechDocs VCF 9.1 — "First VCF Instance FQDNs and IP addresses":
//   • Services runtime nodes: minimum 12 IPs, 30 recommended for scaling.
//   • Fleet components, Instance components, VCF services runtime and Identity Broker: 1 FQDN each.
//   • Log Management (Day-N): 1 FQDN + 6 IPs, +2 IPs per replica. Real-time Metrics: 6 IPs, allocated from the
//     runtime nodes. (The Log Management design page says +1 IP per small/medium replica — the planning table's
//     +2 is kept here as the conservative figure.)
//   • VCF Automation: 1 FQDN + 1 dedicated services runtime FQDN + 5 node IPs (3 active + 2 buffer).
//   • "Each FQDN must resolve to a unique, currently unassigned IP address, and those IP addresses must not
//     overlap with any IP ranges already reserved for VCF services runtime nodes or VCF Automation nodes."

import { isVcf91Plus } from './data.js?v=1.28.0';
import { rangeSize } from './iprange.js?v=1.28.0';

export const SVC_RUNTIME_MIN_IPS = 12;
export const SVC_RUNTIME_RECOMMENDED_IPS = 30;
export const LOG_MGMT_BASE_IPS = 6;
export const LOG_MGMT_IPS_PER_REPLICA = 2;
export const REALTIME_METRICS_IPS = 6;
export const VCFA_NODE_IPS = 5;

// Returns null for VCF 9.0 (no VCF Management Services). Otherwise:
//   pool: {consumers:[{key,ips}], required, size, start, end, rangeSize}
//     required = 12 (Day-0 runtime nodes + upgrade/scale buffer) + Log Management + Real-time Metrics
//     size     = max(required, 30 if "reserve 30" is ticked, else 12) — what the VLAN is sized for
//   endpoints: [{key}] — FQDNs with their own IP on the Management Services network, outside the pool
//   vcfa: {enabled, required:5, start, end, rangeSize}
export function buildMgmtServicesPlan(mgmt, project){
  if(!isVcf91Plus(project.vcfVersion)) return null;
  const logs = !!mgmt.vcfOperationsForLogs?.enabled;
  const replicas = Math.max(0, Math.floor(Number(mgmt.logMgmtExtraReplicas) || 0));
  const rtm = !!mgmt.realtimeMetricsEnabled;
  const consumers = [
    {key:'runtime', ips:SVC_RUNTIME_MIN_IPS},
    ...(logs ? [{key:'logs', ips:LOG_MGMT_BASE_IPS + LOG_MGMT_IPS_PER_REPLICA*replicas, replicas}] : []),
    ...(rtm ? [{key:'rtm', ips:REALTIME_METRICS_IPS}] : []),
  ];
  const required = consumers.reduce((s,c)=>s+c.ips, 0);
  const size = Math.max(required, mgmt.svcRuntimeReserve30 ? SVC_RUNTIME_RECOMMENDED_IPS : SVC_RUNTIME_MIN_IPS);
  const ib = mgmt.vcfIdentityBroker;
  const endpoints = [
    {key:'fleet'}, {key:'instance'}, {key:'runtime'},
    // Legacy JSON may still carry requiresDedicatedVLAN: that Identity Broker IP then lives on its own VLAN row.
    ...(ib?.enabled && ib.mode === 'appliance' && !ib.requiresDedicatedVLAN ? [{key:'idb'}] : []),
    ...(logs ? [{key:'logs-vip'}] : []),
  ];
  const auto = mgmt.vcfAutomation;
  return {
    pool:{consumers, required, size, start:mgmt.svcRuntimeRangeStart||'', end:mgmt.svcRuntimeRangeEnd||'', rangeSize:rangeSize(mgmt.svcRuntimeRangeStart, mgmt.svcRuntimeRangeEnd)},
    endpoints,
    vcfa:{enabled:!!auto?.enabled, required:VCFA_NODE_IPS, start:mgmt.vcfaRangeStart||'', end:mgmt.vcfaRangeEnd||'', rangeSize:rangeSize(mgmt.vcfaRangeStart, mgmt.vcfaRangeEnd)},
  };
}
