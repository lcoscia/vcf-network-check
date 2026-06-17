// Domain/ID helpers, default workload-domain factory, and the static VCF-component IP/FQDN reference table.

export function newId(){return 'id-'+Math.random().toString(36).slice(2);}

export function defaultWorkloadDomain(index){
  return {id:newId(),domainName:`WLD-${String(index).padStart(2,'0')}`,hostCount:3,nsxEnabled:true,nsxManagerMode:'standalone',edgeRequired:false,edgeNodeCount:2,vksEnabled:false,aviEnabled:false,domainRole:'standard-vi',tepInterfacesPerHost:2,dedicatedVLANs:true,sharedEdgeUplinks:false,serviceNetworksRequired:false,additionalServices:[],vksVPCs:[],storageType:'vsan-esa',notes:''};
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
  { id:'nsx-edge',          label:'NSX Edge Nodes',                scope:'per-edge-cluster', ipsPerUnit:2,  fqdnsPerUnit:2, notes:'Mgmt IPs per edge node; + TEPs + 2x /31 uplink transit subnets' },
  { id:'esxi-host',         label:'ESXi Hosts',                    scope:'per-host',         ipsPerUnit:1,  fqdnsPerUnit:1, notes:'Management VMK only' },
  { id:'vcf-operations',    label:'VCF Operations',                scope:'mgmt-domain',      ipsPerUnit:4,  fqdnsPerUnit:4, notes:'3-node cluster + VIP (enterprise mode)' },
  { id:'ops-collector',     label:'Operations Collector',          scope:'per-site',         ipsPerUnit:1,  fqdnsPerUnit:1, notes:'Per remote site / remote data collector' },
  { id:'vcf-automation',    label:'VCF Automation',                scope:'mgmt-domain',      ipsPerUnit:7,  fqdnsPerUnit:2, notes:'Runtime + VIP FQDNs' },
  { id:'avi-controller',    label:'Avi LB Controller Cluster',     scope:'mgmt-domain',      ipsPerUnit:4,  fqdnsPerUnit:4, notes:'3 controllers + 1 cluster VIP' },
  { id:'avi-se',            label:'Avi Service Engines',           scope:'per-domain',       ipsPerUnit:16, fqdnsPerUnit:0, notes:'One /28 SE pool (~14 usable) per workload domain with Avi enabled, no FQDNs' },
  { id:'vks-supervisor',    label:'vSphere Supervisor / VKS',      scope:'per-domain',       ipsPerUnit:5,  fqdnsPerUnit:1, notes:'Control plane IPs + 1 API endpoint FQDN' },
];
