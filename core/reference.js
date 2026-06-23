// Domain/ID helpers, default workload-domain factory, and the static VCF-component IP/FQDN reference table.

export function newId(){return 'id-'+Math.random().toString(36).slice(2);}

export function defaultWorkloadDomain(index){
  return {id:newId(),domainName:`WLD-${String(index).padStart(2,'0')}`,hostCount:3,nsxEnabled:true,nsxManagerMode:'standalone',edgeRequired:false,edgeNodeCount:2,vksEnabled:false,aviEnabled:false,domainRole:'standard-vi',tepInterfacesPerHost:2,dedicatedVLANs:true,sharedEdgeUplinks:false,serviceNetworksRequired:false,additionalServices:[],vksVPCs:[],storageType:'vsan-esa',sspEnabled:false,notes:''};
}

// Baseline per-component IP/FQDN figures sourced from VCF91-PrequisIP-FQDN.pptx (reference design:
// 1 Mgmt Domain + 2 Workload Domains, 4 ESXi hosts each, VKS + Avi enabled). Consumed by
// computeComponentRequirements() in components.js, which derives actual unit counts per project config.
export const COMPONENT_REFERENCE = [
  { id:'vcf-mgmt-services', label:'VCF Management Services',      scope:'mgmt-domain',      ipsPerUnit:12, fqdnsPerUnit:4, notes:'Runtime / Instance / Fleet / vIDB FQDNs' },
  { id:'sddc-manager',      label:'SDDC Manager',                 scope:'mgmt-domain',      ipsPerUnit:1,  fqdnsPerUnit:1, notes:'Mgmt Domain only, reachable from all WLDs' },
  { id:'license-server',    label:'License Server',               scope:'mgmt-domain',      ipsPerUnit:1,  fqdnsPerUnit:1, notes:'Centralized license keys for the whole VCF Fleet' },
  { id:'vcenter',           label:'vCenter Server',                scope:'per-domain',       ipsPerUnit:1,  fqdnsPerUnit:1, notes:'One per domain (Mgmt + each WLD)' },
  { id:'nsx-manager',       label:'NSX Manager Cluster',           scope:'per-domain',       ipsPerUnit:4,  fqdnsPerUnit:4, notes:'3 nodes + VIP per domain (clustered mode)' },
  { id:'nsx-edge',          label:'NSX Edge Nodes',                scope:'per-edge-cluster', ipsPerUnit:1,  fqdnsPerUnit:1, notes:'Mgmt IP per edge node; TEP + 2x /31 uplink transit subnets allocated separately via per-domain VLAN pools (see core/vlan.js)' },
  { id:'esxi-host',         label:'ESXi Hosts',                    scope:'per-host',         ipsPerUnit:1,  fqdnsPerUnit:1, notes:'Management VMK only' },
  { id:'vcf-operations',    label:'VCF Operations',                scope:'mgmt-domain',      ipsPerUnit:4,  fqdnsPerUnit:4, notes:'3-node cluster + VIP (enterprise mode)' },
  { id:'ops-collector',     label:'Operations Collector',          scope:'per-site',         ipsPerUnit:1,  fqdnsPerUnit:1, notes:'Per remote site / remote data collector' },
  { id:'vcf-automation',    label:'VCF Automation',                scope:'mgmt-domain',      ipsPerUnit:7,  fqdnsPerUnit:2, notes:'Runtime + VIP FQDNs' },
  { id:'avi-controller',    label:'Avi LB Controller Cluster',     scope:'mgmt-domain',      ipsPerUnit:4,  fqdnsPerUnit:4, notes:'3 controllers + 1 cluster VIP' },
  { id:'avi-se',            label:'Avi Service Engines',           scope:'per-domain',       ipsPerUnit:16, fqdnsPerUnit:0, notes:'One /28 SE pool (~14 usable) per workload domain with Avi enabled, no FQDNs' },
  { id:'vks-supervisor',    label:'vSphere Supervisor / VKS',      scope:'per-domain',       ipsPerUnit:5,  fqdnsPerUnit:1, notes:'Control plane IPs + 1 API endpoint FQDN' },
  { id:'ssp',               label:'Security Services Platform (SSP)', scope:'per-domain',    ipsPerUnit:21, fqdnsPerUnit:3, notes:'1 SSPI installer (1 IP) + SSP instance: 3 controllers + minimum 4 workers (Node IP Pool 13 IPs, per Broadcom\'s documented 4-worker minimum) + contiguous Service IP Pool 7 IPs = 21 IPs. 1:1:1 with an NSX Manager cluster — shown per-domain as a simplification; domains on shared NSX (nsxManagerMode=shared) reuse another domain\'s SSP and are not double-counted. 3 FQDNs: SSP Installer, SSP Instance (NSX metrics ingestion), SSP Messaging (flow data). Note: enabling vDefend Advanced Threat Prevention adds a 5th worker node and additional IPs, not reflected in this baseline figure.' },
  { id:'license-hub',       label:'License Hub (vDefend + Avi)',   scope:'mgmt-domain',      ipsPerUnit:9,  fqdnsPerUnit:1, notes:'Deployed once per VCF Fleet, in the first instance\'s management domain. 1 Controller + 1 Worker (Node Pool 4 + Service Pool 4) + 1 Installer = 9 IPs (confirmed via Broadcom License Hub design-blueprint page, re-checked Jun 2026). FQDN requirement is NOT documented by Broadcom on the License Hub page or its parent page (no DNS/FQDN section, no sibling Networking sub-page) — assumed 1 (installer) as a planning placeholder. Do not confuse with SSP\'s separate Instance/Messaging FQDN pair, documented on the SSP Networking page.' },
];
