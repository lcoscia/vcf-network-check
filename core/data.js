// Static reference constants: CIDR sizing table, gateway/spare IP overhead, and default project/domain templates.

export const CIDR_TABLE = [
  {prefix:29,usable:6},{prefix:28,usable:14},{prefix:27,usable:30},
  {prefix:26,usable:62},{prefix:25,usable:126},{prefix:24,usable:254},
  {prefix:23,usable:510},{prefix:22,usable:1022},{prefix:21,usable:2046},
  {prefix:20,usable:4094},
];
export const GATEWAY_SPARE = 2;

export const DEFAULT_PROJECT={projectName:'',customerName:'',scenario:'vcf-standard',deploymentType:'greenfield',workloadDomainCount:1,subnetBufferEnabled:true,subnetBufferPercent:20,fqdnSuffix:'',fqdnPrefix:'',vcfVersion:'9.1.1'};

// 9.1.1 is a maintenance BoM release (supportability fixes) on the same VCF Management
// Services architecture as 9.1 — every 9.1-branch IP/FQDN rule in this engine applies to it too.
export function isVcf91Plus(vcfVersion){ return vcfVersion === '9.1' || vcfVersion === '9.1.1'; }

// Both stretched topologies split hosts across AZ1/AZ2; only 'vsan-stretched' has a vSAN Witness —
// a vMSC ('stretched', non-vSAN FC/NFS/iSCSI array) relies on the storage vendor's tiebreaker instead.
export function isStretchedTopology(topologyMode){ return topologyMode === 'vsan-stretched' || topologyMode === 'stretched'; }
export function hasVsanWitness(topologyMode){ return topologyMode === 'vsan-stretched'; }
// vMSC networking: "Stretch all Layer-2 Networks" is the only layout VCF Installer / SDDC Manager support for the
// initial Management Domain cluster (KB 417356) — every network uses the same VLAN ID and subnet on AZ1 and AZ2.
export function isStretchAllL2(topologyMode){ return topologyMode === 'stretched'; }

// Networks whose AZ layout is a design choice in a vSAN stretched cluster. Broadcom's 9.1 "vSAN Stretched Cluster
// Network Requirements" table has them per AZ (own VLAN/subnet on AZ1 and AZ2) — the default here; each can also be
// a single L2 network stretched across both AZs. VM Management is always stretched and has no choice.
export const AZ_NETWORK_KEYS = ['hostMgmt','vmotion','vsan','hostTep'];
export function defaultAzNetworks(){ return {hostMgmt:'per-az',vmotion:'per-az',vsan:'per-az',hostTep:'per-az'}; }

// 'per-az' | 'stretched' for a stretched domain, null when single-site. vMSC is always 'stretched' (KB 417356).
export function azNetworkMode(d, key){
  if(!isStretchedTopology(d.topologyMode)) return null;
  if(isStretchAllL2(d.topologyMode)) return 'stretched';
  return d.azNetworks?.[key] === 'stretched' ? 'stretched' : 'per-az';
}

// Recommended MTU per VLAN type (Broadcom 9.1 stretched network table + P&P workbook); '' when not documented.
export const RECOMMENDED_MTU = {management:1500,'vm-network':1500,fleet:1500,vmotion:9000,vsan:9000,nfs:9000,'nsx-tep':9000,'vsan-witness':1500};

// Single source of truth for a domain's host count. In stretched modes hostCount is only a stored
// convenience copy that may be stale (e.g. AZ fields left at their defaults), so derive AZ1+AZ2 instead.
// Number() guards against x-model.number yielding '' for a cleared field ('' + 4 === '4').
export function effectiveHostCount(d){
  if(isStretchedTopology(d.topologyMode)) return (Number(d.az1HostCount)||0)+(Number(d.az2HostCount)||0);
  return Number(d.hostCount)||0;
}
export const DEFAULT_MGMT={hostCount:4,nsxManagerMode:'clustered',fleetMode:'standalone',fleetPlacement:'shared-mgmt-vlan',svcRuntimeReserve30:false,svcRuntimeRangeStart:'',svcRuntimeRangeEnd:'',vcfaRangeStart:'',vcfaRangeEnd:'',logMgmtExtraReplicas:0,realtimeMetricsEnabled:false,nsxEdgeDeployed:false,nsxEdgeNodeCount:2,aviDeployed:false,vksEnabled:false,vksLBType:'nsx-lb',sspEnabled:false,tepInterfacesPerHost:2,edgeUplinksDedicated:true,additionalServices:[],topologyMode:'single-site',az1HostCount:4,az2HostCount:4,witnessDedicatedVsanVmk:false,azNetworks:{hostMgmt:'per-az',vmotion:'per-az',vsan:'per-az',hostTep:'per-az'},storageType:'vsan-esa',vcfOperations:{enabled:true,mode:'enterprise',remoteCollectorCount:2,requiresDedicatedVLAN:false,cloudProxyEnabled:true,licenseServerEnabled:true},vcfOperationsForLogs:{enabled:true,mode:'clustered',workerCount:2,integratedLBVIP:true,requiresDedicatedVLAN:false},vcfOperationsForNetworks:{enabled:true,platformNodeCount:1,collectorCount:1,requiresDedicatedVLAN:false},vcfAutomation:{enabled:true,mode:'clustered',orchestratorMode:'embedded',orchestratorNodeCount:1,requiresDedicatedVLAN:false},vcfIdentityBroker:{enabled:true,mode:'appliance',haEnabled:false,requiresDedicatedVLAN:false},vksVPCs:[]};
