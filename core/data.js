// Static reference constants: CIDR sizing table, gateway/spare IP overhead, and default project/domain templates.

export const CIDR_TABLE = [
  {prefix:29,usable:6},{prefix:28,usable:14},{prefix:27,usable:30},
  {prefix:26,usable:62},{prefix:25,usable:126},{prefix:24,usable:254},
  {prefix:23,usable:510},{prefix:22,usable:1022},{prefix:21,usable:2046},
  {prefix:20,usable:4094},
];
export const GATEWAY_SPARE = 2;

export const DEFAULT_PROJECT={projectName:'',customerName:'',scenario:'vcf-standard',deploymentType:'greenfield',workloadDomainCount:1,subnetBufferEnabled:true,subnetBufferPercent:20,fqdnSuffix:'',fqdnPrefix:'',vcfVersion:'9.1'};
export const DEFAULT_MGMT={hostCount:4,nsxManagerMode:'clustered',fleetMode:'standalone',fleetPlacement:'shared-mgmt-vlan',nsxEdgeDeployed:false,nsxEdgeNodeCount:2,aviDeployed:false,vksEnabled:false,sspEnabled:false,tepInterfacesPerHost:2,edgeUplinksDedicated:true,additionalServices:[],topologyMode:'single-site',layer2AdjacencyConfirmed:false,az1HostCount:4,az2HostCount:4,witnessDedicatedVsanVmk:false,storageType:'vsan-esa',vcfOperations:{enabled:true,mode:'enterprise',remoteCollectorCount:2,requiresDedicatedVLAN:false,cloudProxyEnabled:true,licenseServerEnabled:true},vcfOperationsForLogs:{enabled:true,mode:'clustered',workerCount:2,integratedLBVIP:true,requiresDedicatedVLAN:false},vcfOperationsForNetworks:{enabled:true,platformNodeCount:1,collectorCount:1,requiresDedicatedVLAN:false},vcfAutomation:{enabled:true,mode:'clustered',orchestratorMode:'embedded',orchestratorNodeCount:1,requiresDedicatedVLAN:false},vcfIdentityBroker:{enabled:true,mode:'appliance',haEnabled:false,requiresDedicatedVLAN:false},vksVPCs:[]};
