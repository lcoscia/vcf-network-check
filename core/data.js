// Static reference constants: CIDR sizing table, gateway/spare IP overhead, and default project/domain templates.

export const CIDR_TABLE = [
  {prefix:29,usable:6},{prefix:28,usable:14},{prefix:27,usable:30},
  {prefix:26,usable:62},{prefix:25,usable:126},{prefix:24,usable:254},
  {prefix:23,usable:510},{prefix:22,usable:1022},{prefix:21,usable:2046},
  {prefix:20,usable:4094},
];
export const GATEWAY_SPARE = 2;

// JSON export envelope (v1.31.0) — read by the sibling "VCF Planning & Preparation" importer (core/np-import.js there).
export const EXPORT_SCHEMA=1;
export function exportMeta(version){ return {tool:'VCF Network Planner',version,schema:EXPORT_SCHEMA}; }

export const DEFAULT_PROJECT={projectName:'',customerName:'',scenario:'vcf-standard',deploymentType:'greenfield',workloadDomainCount:1,subnetBufferEnabled:true,subnetBufferPercent:20,fqdnSuffix:'',fqdnPrefix:'',siteCode:'',instanceName:'',parentDomain:'',dnsServers:[],ntpServers:[],vcfVersion:'9.1.1'};

// 9.1.1 is a maintenance BoM release (supportability fixes) on the same VCF Management
// Services architecture as 9.1 — every 9.1-branch IP/FQDN rule in this engine applies to it too.
export function isVcf91Plus(vcfVersion){ return vcfVersion === '9.1' || vcfVersion === '9.1.1'; }

// VCF 9.1+ renames "VCF Operations for Logs" to "Log Management" (a VCF services runtime service, no appliance).
// Field feedback (v1.30.0): every component label must follow the selected version. short = compact 9.0 form.
export function logsLabel(vcfVersion, short=false){
  return isVcf91Plus(vcfVersion) ? 'Log Management' : (short ? 'VCF Ops for Logs' : 'VCF Operations for Logs');
}

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
export const RECOMMENDED_MTU = {'vpc-external':1500,management:1500,'vm-network':1500,fleet:1500,vmotion:9000,vsan:9000,nfs:9000,'nsx-tep':9000,'vsan-witness':1500};

// Single source of truth for a domain's host count. In stretched modes hostCount is only a stored
// convenience copy that may be stale (e.g. AZ fields left at their defaults), so derive AZ1+AZ2 instead.
// Number() guards against x-model.number yielding '' for a cleared field ('' + 4 === '4').
export function effectiveHostCount(d){
  if(isStretchedTopology(d.topologyMode)) return (Number(d.az1HostCount)||0)+(Number(d.az2HostCount)||0);
  return Number(d.hostCount)||0;
}
export const DEFAULT_MGMT={hostCount:4,nsxManagerMode:'clustered',fleetMode:'standalone',fleetPlacement:'shared-mgmt-vlan',svcRuntimeReserve30:false,svcRuntimeRangeStart:'',svcRuntimeRangeEnd:'',vcfaRangeStart:'',vcfaRangeEnd:'',logMgmtExtraReplicas:0,realtimeMetricsEnabled:false,vpcConnectivity:'centralized',vpcExternalIPs:16,nsxEdgeDeployed:false,nsxEdgeNodeCount:2,aviDeployed:false,vksEnabled:false,vksLBType:'nsx-lb',sspEnabled:false,tepInterfacesPerHost:2,edgeUplinksDedicated:true,additionalServices:[],topologyMode:'single-site',az1HostCount:4,az2HostCount:4,witnessDedicatedVsanVmk:false,azNetworks:{hostMgmt:'per-az',vmotion:'per-az',vsan:'per-az',hostTep:'per-az'},storageType:'vsan-esa',vcfOperations:{enabled:true,mode:'enterprise',remoteCollectorCount:2,requiresDedicatedVLAN:false,cloudProxyEnabled:true,licenseServerEnabled:true},vcfOperationsForLogs:{enabled:true,mode:'clustered',workerCount:2,integratedLBVIP:true,requiresDedicatedVLAN:false},vcfOperationsForNetworks:{enabled:true,platformNodeCount:1,collectorCount:1,requiresDedicatedVLAN:false},vcfAutomation:{enabled:true,mode:'clustered',orchestratorMode:'embedded',orchestratorNodeCount:1,requiresDedicatedVLAN:false},vcfIdentityBroker:{enabled:true,mode:'appliance',haEnabled:false,requiresDedicatedVLAN:false},vksVPCs:[]};

// ── IMPORTED WORKLOAD DOMAIN (v1.32.0) ───────────────────────────
// VCF Operations › Add Workload Domain › Import a vCenter (TechDocs 9.1 "Import an Existing vCenter to Create a Workload
// Domain"; P&P workbook "Deploy Workload Domain" B10 = "Import Workload Domain", rows B23-B50). The vCenter, hosts, VDS and
// VMkernel networks already exist and are only documented (rows flagged existing:true); the import deploys nothing but
// NSX Manager (importNsx 'new'), unless the vCenter is already registered with one ('existing') or joins one ('shared').
export function isImportWld(d){ return d?.deployMode === 'import'; }
// NSX Manager rows exist for this WLD (new or already-deployed ones); 'shared' = no NSX Manager of its own.
export function wldHasOwnNsxManager(d){
  if(!d.nsxEnabled||d.nsxManagerMode==='shared') return false;
  return !isImportWld(d) || d.importNsx !== 'shared';
}
export function wldNsxManagerExisting(d){ return isImportWld(d) && d.importNsx === 'existing'; }
// Host TEP VMkernels: always for a deployed WLD with NSX; for an import only with dedicated TEPs — 9.1.1 imports as a
// VLAN-backed VPC with no TEP ('no-tep'), 9.0/9.1.0 can run the overlay on the ESX management vmk ('mgmt-vmk').
export function wldHasHostTep(d){ return !!d.nsxEnabled && (!isImportWld(d) || d.importOverlay === 'dedicated-tep'); }
// Network the WLD vCenter / NSX Managers sit on: the Management VM Network, or — for an imported vCenter that runs on its
// own cluster — the WLD's (existing) ESXi Management network.
export function wldInfraVlan(d){
  if(isImportWld(d) && d.importVcLocation === 'self') return azNetworkMode(d,'hostMgmt')==='per-az' ? 'ESXi Management — AZ1' : 'ESXi Management';
  return 'Management VM Network';
}

// Broadcom prerequisites of the import (TechDocs 9.1 import page + KBs). Unchecked item → validation message.
export const IMPORT_CHECKLIST = [
  {key:'versions',        sev:'error',   src:'TechDocs 9.1'},
  {key:'vlcmImages',      sev:'error',   src:'TechDocs 9.1'},
  {key:'drsFull',         sev:'error',   src:'TechDocs 9.1'},
  {key:'vds8',            sev:'error',   src:'TechDocs 9.1 / KB 408239'},
  {key:'noVss',           sev:'warning', src:'KB 427706'},
  {key:'noElm',           sev:'error',   src:'TechDocs 9.1'},
  {key:'noVcha',          sev:'error',   src:'TechDocs 9.1'},
  {key:'notSddcManaged',  sev:'error',   src:'TechDocs 9.1'},
  {key:'staticVmk',       sev:'error',   src:'TechDocs 9.1'},
  {key:'singleVmkPerType',sev:'error',   src:'TechDocs 9.1'},
  {key:'allClusters',     sev:'warning', src:'TechDocs 9.1'},
  {key:'dnsFwdRev',       sev:'error',   src:'TechDocs 9.1 / KB 425102'},
];
export const MAX_VI_WLDS = 24;
