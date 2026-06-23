// Pure VLAN domain logic: builds management/workload VLAN lists and derives helper lookups.

import { recommendCIDR } from './sizing.js?v=1.10.0';

// ── VLAN ENGINE ─────────────────────────────────────────────────
let _vlanId=0;
export function resetVlanCounter(){_vlanId=0;}
export function makeVLAN(domain,vlanName,vlanType,description,purpose,mandatory,scope,requiredIPs,notes,bufferEnabled,bufferPercent){
  const rec=recommendCIDR(requiredIPs,bufferEnabled,bufferPercent);
  return {id:`vlan-${domain.toLowerCase().replace(/\s/g,'-')}-${++_vlanId}`,domain,vlanName,vlanType,description,purpose,mandatory,scope,requiredIPs,recommendedCIDR:rec.recommendedCIDR,minimumCIDR:rec.recommendedCIDR,notes,vlanId:'',cidr:''};
}

export function buildManagementVLANs(mgmt, project, workloadDomains=[], t=k=>k) {
  resetVlanCounter();
  const vlans=[];
  const buf=project.subnetBufferEnabled, bufPct=project.subnetBufferPercent;
  const domain='Management Domain';
  const is91=project.vcfVersion==='9.1';
  const fleetDedicated=['dedicated-fleet-vlan','nsx-vlan-segment','nsx-overlay-segment'].includes(mgmt.fleetPlacement);
  const fleetVLANName=mgmt.fleetPlacement==='nsx-overlay-segment'?'Fleet NSX Overlay Segment':mgmt.fleetPlacement==='nsx-vlan-segment'?'Fleet NSX VLAN Segment':(is91?'VCF Management Services Runtime':'Fleet Network');
  const fleetVLANType=mgmt.fleetPlacement==='nsx-overlay-segment'?'overlay':mgmt.fleetPlacement==='nsx-vlan-segment'?'service':'fleet';
  const isStretched=mgmt.topologyMode==='vsan-stretched'||mgmt.topologyMode==='stretched';

  if(isStretched){
    vlans.push(makeVLAN(domain,'ESXi Management — AZ1','management','ESXi vmk0 only','VMkernel vmk0 — Availability Zone 1','mandatory','dedicated',mgmt.az1HostCount,`${mgmt.az1HostCount} vmk0 IPs (AZ1)`,buf,bufPct));
    vlans.push(makeVLAN(domain,'ESXi Management — AZ2','management','ESXi vmk0 only','VMkernel vmk0 — Availability Zone 2','mandatory','dedicated',mgmt.az2HostCount,`${mgmt.az2HostCount} vmk0 IPs (AZ2)`,buf,bufPct));
  } else {
    vlans.push(makeVLAN(domain,'ESXi Management','management','ESXi vmk0 only','VMkernel vmk0 for out-of-band ESXi management','mandatory','dedicated',mgmt.hostCount,`${mgmt.hostCount} vmk0 IPs (1 per host)`,buf,bufPct));
  }

  const nsxManagerCount=mgmt.nsxManagerMode==='clustered'?3:1;
  // C14: VIP NSX Manager réservée dans tous les modes (Simple + HA) pour permettre un futur scale-out HA sans ré-IP — bonne pratique VCF IP Allocation Workbook (Broadcom TechDocs VCF 9.1)
  const nsxVIPCount=1;
  const nsxEdgeMgmtIPs=mgmt.nsxEdgeDeployed?mgmt.nsxEdgeNodeCount:0;
  const fleetCountInMgmtVM=fleetDedicated?0:(is91?14:1);
  const additionalSvcIPs=mgmt.additionalServices.filter(s=>!s.requiresDedicatedVLAN).reduce((a,s)=>a+s.applianceCount,0);
  const aviControllerIPs=mgmt.aviDeployed?3+1:0;
  const wldNSXManagerIPs=workloadDomains.reduce((sum,wld)=>{
    if(!wld.nsxEnabled||wld.nsxManagerMode==='shared')return sum;
    return sum+(wld.nsxManagerMode==='clustered'?3:1)+1;
  },0);
  const opsCollectors=mgmt.vcfOperations.enabled?mgmt.vcfOperations.remoteCollectorCount:0;
  const netsCollectors=mgmt.vcfOperationsForNetworks.enabled?mgmt.vcfOperationsForNetworks.collectorCount:0;
  const opsNodesInMgmtVM=(mgmt.vcfOperations.enabled&&!mgmt.vcfOperations.requiresDedicatedVLAN&&!fleetDedicated)?(mgmt.vcfOperations.mode==='enterprise'?3+1:1):0;
  // 9.1: Log Management IPs (6 base + 2/replica, Day-N) are allocated from the VCF Services Runtime block — not an additional Mgmt VM Network IP ; 9.0 = master+workers architecture
  const logsInMgmtVM=(mgmt.vcfOperationsForLogs.enabled&&!mgmt.vcfOperationsForLogs.requiresDedicatedVLAN&&!fleetDedicated)?(is91?0:(mgmt.vcfOperationsForLogs.mode==='clustered'?1+mgmt.vcfOperationsForLogs.workerCount+(mgmt.vcfOperationsForLogs.integratedLBVIP?2:1):1)):0;
  const netsNodesInMgmtVM=(mgmt.vcfOperationsForNetworks.enabled&&!mgmt.vcfOperationsForNetworks.requiresDedicatedVLAN&&!fleetDedicated)?mgmt.vcfOperationsForNetworks.platformNodeCount:0;
  // 9.1: VCF Automation /29 (5 IPs: 3 node IPs + 2 buffer for redeploy/rolling updates) is a separate block from Services Runtime — default placement is the Management VM Network regardless of the Fleet/Runtime placement ; 9.0 = VA nodes
  const autoInMgmtVM=(mgmt.vcfAutomation.enabled&&!mgmt.vcfAutomation.requiresDedicatedVLAN&&(is91||!fleetDedicated))?(is91?5:((mgmt.vcfAutomation.mode==='clustered'?4+1:1)+(mgmt.vcfAutomation.orchestratorMode==='standalone'?mgmt.vcfAutomation.orchestratorNodeCount+(mgmt.vcfAutomation.orchestratorNodeCount>1?1:0):0))):0;
  // 9.1: Identity Broker IP is allocated from the VCF Services Runtime block — not an additional Mgmt VM Network IP ; 9.0 = VM appliances
  const ibInMgmtVM=(mgmt.vcfIdentityBroker.enabled&&mgmt.vcfIdentityBroker.mode==='appliance'&&!mgmt.vcfIdentityBroker.requiresDedicatedVLAN)?(is91?0:(mgmt.vcfIdentityBroker.haEnabled?3+1:1)):0;
  const cloudProxyIP=mgmt.vcfOperations.enabled&&mgmt.vcfOperations.cloudProxyEnabled?1:0;
  const licServerIP=mgmt.vcfOperations.enabled&&mgmt.vcfOperations.licenseServerEnabled?1:0;
  const mgmtVMIPs=1+1+nsxManagerCount+nsxVIPCount+nsxEdgeMgmtIPs+wldNSXManagerIPs+fleetCountInMgmtVM+additionalSvcIPs+aviControllerIPs+opsNodesInMgmtVM+opsCollectors+logsInMgmtVM+netsNodesInMgmtVM+netsCollectors+autoInMgmtVM+ibInMgmtVM+cloudProxyIP+licServerIP;
  const mgmtVMNotes=[
    'SDDC Manager, vCenter',
    `${nsxManagerCount} NSX Mgr + VIP`,
    nsxEdgeMgmtIPs?`${nsxEdgeMgmtIPs} Edge Mgmt`:'',
    !fleetDedicated?(is91?'Fleet + Instance + 12 Svc Runtime nodes (incl. Identity Broker)':'Fleet'):'',
    aviControllerIPs?'AVI Controllers':'',
    opsCollectors?`${opsCollectors} ${is91?'Cloud Proxies':'Ops Collectors'}`:'',
    netsCollectors?`${netsCollectors} Nets Collectors`:'',
    autoInMgmtVM&&is91?'5 IPs VCF Automation /29 (3 nodes + 2 buffer)':'',
    cloudProxyIP?'Cloud Proxy':'',
    licServerIP?'License Server':''
  ].filter(Boolean).join(' | ');
  vlans.push(makeVLAN(domain,'Management VM Network','vm-network','SDDC Manager, vCenter, NSX Managers, platform service VMs','All management plane VMs','mandatory','dedicated',mgmtVMIPs,mgmtVMNotes,buf,bufPct));

  if(isStretched){
    vlans.push(makeVLAN(domain,'vMotion — AZ1','vmotion','VMkernel vMotion portgroup','Live migration — Availability Zone 1','mandatory','dedicated',mgmt.az1HostCount,`${mgmt.az1HostCount} vmk IPs (AZ1)`,buf,bufPct));
    vlans.push(makeVLAN(domain,'vMotion — AZ2','vmotion','VMkernel vMotion portgroup','Live migration — Availability Zone 2','mandatory','dedicated',mgmt.az2HostCount,`${mgmt.az2HostCount} vmk IPs (AZ2)`,buf,bufPct));
  } else {
    vlans.push(makeVLAN(domain,'vMotion','vmotion','VMkernel vMotion portgroup','Live migration','mandatory','dedicated',mgmt.hostCount,`${mgmt.hostCount} vmk IPs`,buf,bufPct));
  }
  if(mgmt.storageType==='nfs'){
    vlans.push(makeVLAN(domain,'NFS Storage','nfs',t('vlan.nfs_vmk_desc'),'NFS primary storage — 1 vmk per host. L2 mandatory between ESXi and NFS server.','mandatory','dedicated',mgmt.hostCount,t('vlan.nfs_notes_mgmt',{n:mgmt.hostCount}),buf,bufPct));
  } else if(mgmt.storageType==='vmfs'){
    // VMFS sur SAN (iSCSI/FC) : pas de VLAN VMkernel de stockage généré automatiquement
    // L'iSCSI doit être configuré manuellement via "Additional Services" si un VLAN dédié est requis
  } else if(isStretched){
    // vSAN ESA/OSA en Stretched Cluster : L2 ou L3 entre AZ1/AZ2, mais L3 obligatoire vers le Witness (modélisé séparément ci-dessous)
    vlans.push(makeVLAN(domain,'vSAN — AZ1','vsan','vSAN ESA VMkernel','vSAN ESA storage — Availability Zone 1 (L2 or L3 to AZ2, L3-only to Witness)','mandatory','dedicated',mgmt.az1HostCount,`${mgmt.az1HostCount} vmk IPs (AZ1, vSAN ESA)`,buf,bufPct));
    vlans.push(makeVLAN(domain,'vSAN — AZ2','vsan','vSAN ESA VMkernel','vSAN ESA storage — Availability Zone 2 (L2 or L3 to AZ1, L3-only to Witness)','mandatory','dedicated',mgmt.az2HostCount,`${mgmt.az2HostCount} vmk IPs (AZ2, vSAN ESA)`,buf,bufPct));
  } else {
    // vSAN ESA (default) ou vSAN OSA
    vlans.push(makeVLAN(domain,'vSAN','vsan','vSAN ESA VMkernel','vSAN ESA storage — 1 vmk per host','mandatory','dedicated',mgmt.hostCount,`${mgmt.hostCount} vmk IPs (vSAN ESA)`,buf,bufPct));
  }
  if(isStretched){
    const tepAZ1=mgmt.az1HostCount*mgmt.tepInterfacesPerHost, tepAZ2=mgmt.az2HostCount*mgmt.tepInterfacesPerHost;
    vlans.push(makeVLAN(domain,'NSX Host TEP — AZ1','nsx-tep','NSX Host TEP pool','Geneve overlay for ESXi hosts — Availability Zone 1','mandatory','dedicated',tepAZ1,`${mgmt.az1HostCount} hosts × ${mgmt.tepInterfacesPerHost} = ${tepAZ1} IPs (AZ1)`,buf,bufPct));
    vlans.push(makeVLAN(domain,'NSX Host TEP — AZ2','nsx-tep','NSX Host TEP pool','Geneve overlay for ESXi hosts — Availability Zone 2','mandatory','dedicated',tepAZ2,`${mgmt.az2HostCount} hosts × ${mgmt.tepInterfacesPerHost} = ${tepAZ2} IPs (AZ2)`,buf,bufPct));
    const witnessIPs=mgmt.witnessDedicatedVsanVmk?2:1;
    const witnessNotes=mgmt.witnessDedicatedVsanVmk
      ?'2 IPs: vmk0 (management) + vmk1 (dedicated vSAN witness traffic)'
      :'1 IP: vmk0 shared for management + witness traffic (Broadcom default)';
    vlans.push(makeVLAN(domain,'vSAN Witness Traffic — Witness Appliance','vsan-witness','vSAN Witness Host VMkernel (not part of AZ1/AZ2)','Quorum/Witness component — requires independent L3 routing to both AZ1 and AZ2 (not a scalable 3rd site)','mandatory','dedicated',witnessIPs,witnessNotes,buf,bufPct));
  } else {
    const tepIPs=mgmt.hostCount*mgmt.tepInterfacesPerHost;
    vlans.push(makeVLAN(domain,'NSX Host TEP','nsx-tep','NSX Host TEP pool','Geneve overlay for ESXi hosts','mandatory','dedicated',tepIPs,`${mgmt.hostCount} hosts × ${mgmt.tepInterfacesPerHost} = ${tepIPs} IPs`,buf,bufPct));
  }

  if(mgmt.nsxEdgeDeployed){
    vlans.push(makeVLAN(domain,'NSX Edge TEP','nsx-tep','NSX Edge TEP — separate from Host TEP','Dedicated TEP for Edge nodes','mandatory','dedicated',mgmt.nsxEdgeNodeCount,`${mgmt.nsxEdgeNodeCount} Edge TEP IPs`,buf,bufPct));
    vlans.push(makeVLAN(domain,'NSX Edge Uplink 1','nsx-edge-uplink1','Edge uplink 1 (North-South)','Physical underlay uplink','mandatory','dedicated',mgmt.nsxEdgeNodeCount,`${mgmt.nsxEdgeNodeCount} IPs`,buf,bufPct));
    vlans.push(makeVLAN(domain,'NSX Edge Uplink 2','nsx-edge-uplink2','Edge uplink 2 (redundant)','Redundant underlay uplink','mandatory','dedicated',mgmt.nsxEdgeNodeCount,`${mgmt.nsxEdgeNodeCount} IPs`,buf,bufPct));
  }

  if(fleetDedicated){
    let fleetIPs=is91?14:1;
    const fleetNotes=is91?['Fleet appliance (1 IP)','Instance component (1 IP)','Services Runtime nodes /28 min (12 IPs) — incl. Identity Broker']:['1 Fleet appliance (Simple mode)'];
    if(mgmt.vcfOperations.enabled&&!mgmt.vcfOperations.requiresDedicatedVLAN){const n=mgmt.vcfOperations.mode==='enterprise'?4:1;fleetIPs+=n;fleetNotes.push(`VCF Ops: ${n} IPs`);}
    // 9.1: Log Management (6 base IPs +2/replica, Day-N) is allocated from this Services Runtime block — not added on top of the /28-/27 sizing ; 9.0 = master+workers
    if(mgmt.vcfOperationsForLogs.enabled&&!mgmt.vcfOperationsForLogs.requiresDedicatedVLAN){
      if(is91){fleetNotes.push('Log Management (Day-N): 6 IPs +2/replica, within this block');}
      else{const n=mgmt.vcfOperationsForLogs.mode==='clustered'?1+mgmt.vcfOperationsForLogs.workerCount+(mgmt.vcfOperationsForLogs.integratedLBVIP?2:1):1;fleetIPs+=n;fleetNotes.push(`VCF Logs: ${n} IPs`);}
    }
    if(mgmt.vcfOperationsForNetworks.enabled&&!mgmt.vcfOperationsForNetworks.requiresDedicatedVLAN){fleetIPs+=mgmt.vcfOperationsForNetworks.platformNodeCount;fleetNotes.push(`VCF Nets: ${mgmt.vcfOperationsForNetworks.platformNodeCount} IPs`);}
    // 9.1: VCF Automation /29 (5 IPs) is a separate block from Services Runtime, counted in Management VM Network (see mgmtVMNotes) — not mixed into this block ; 9.0 = VA nodes counted here
    if(!is91&&mgmt.vcfAutomation.enabled&&!mgmt.vcfAutomation.requiresDedicatedVLAN){const n=(mgmt.vcfAutomation.mode==='clustered'?5:1)+(mgmt.vcfAutomation.orchestratorMode==='standalone'?mgmt.vcfAutomation.orchestratorNodeCount+(mgmt.vcfAutomation.orchestratorNodeCount>1?1:0):0);fleetIPs+=n;fleetNotes.push(`VCF Auto: ${n} IPs`);}
    fleetNotes.push('Collectors always in Mgmt VM Network');
    // NSX Overlay Segment: no physical VLAN ID — overlay segment (Geneve encapsulation)
    const fleetNote2=mgmt.fleetPlacement==='nsx-overlay-segment'?t('vlan.fleet_note_overlay'):mgmt.fleetPlacement==='nsx-vlan-segment'?t('vlan.fleet_note_vlan'):'';
    vlans.push(makeVLAN(domain,fleetVLANName,fleetVLANType,`${fleetVLANName} — Fleet appliance + platform service nodes`,t('vlan.fleet_platform_purpose',{placement:mgmt.fleetPlacement}),'scenario-driven','dedicated',fleetIPs,fleetNotes.join(' | ')+fleetNote2,buf,bufPct));
  }

  if(mgmt.aviDeployed)vlans.push(makeVLAN(domain,'AVI Management','avi','AVI SE management','AVI load balancer management','scenario-driven','dedicated',4,'AVI SE management IPs',buf,bufPct));
  if(mgmt.vksEnabled||project.scenario==='vcf-automation-vks')vlans.push(makeVLAN(domain,'VKS Infrastructure','vks','VKS Supervisor — 5 IPs (recommended as a contiguous block)','Kubernetes Supervisor control plane','scenario-driven','dedicated',5,'5 IPs (recommended contiguous block): 3 control plane VMs + 1 floating + 1 patching. Note: workload network, AVI VIP pool, ingress/egress CIDR and pod CIDR are separate additional requirements.',buf,bufPct));

  mgmt.additionalServices.filter(s=>s.requiresDedicatedVLAN).forEach(svc=>vlans.push(makeVLAN(domain,`${svc.name} Network`,'service',`Dedicated network for ${svc.name}`,`Service VLAN: ${svc.name}`,'optional','dedicated',svc.applianceCount+(svc.requiresVIP?svc.vipCount:0),svc.notes||`${svc.applianceCount} appliances`,buf,bufPct)));
  return vlans;
}

export function buildWorkloadVLANs(wld, project, t=k=>k) {
  resetVlanCounter();
  const vlans=[];
  const buf=project.subnetBufferEnabled,bufPct=project.subnetBufferPercent;
  const domain=wld.domainName;
  const scope=wld.dedicatedVLANs?'dedicated':'shared';

  vlans.push(makeVLAN(domain,'ESXi Management','management','vmk0 only','ESXi vmk0 for workload domain hosts','mandatory',scope,wld.hostCount,`${wld.hostCount} vmk0 IPs`,buf,bufPct));
  vlans.push(makeVLAN(domain,'VM / Application Network','vm-network','Workload VM network','Application VLAN','mandatory',scope,32,'Adjust to actual VM count',buf,bufPct));
  vlans.push(makeVLAN(domain,'vMotion','vmotion','VMkernel vMotion','Live migration','mandatory',scope,wld.hostCount,`${wld.hostCount} vmk IPs`,buf,bufPct));
  if(wld.storageType==='nfs'){
    vlans.push(makeVLAN(domain,'NFS Storage','nfs',t('vlan.nfs_vmk_desc'),'NFS primary storage — 1 vmk per host. L2 mandatory.','mandatory',scope,wld.hostCount,t('vlan.nfs_notes_wld',{n:wld.hostCount}),buf,bufPct));
  } else if(wld.storageType==='vmfs'){
    // VMFS sur SAN : pas de VLAN VMkernel de stockage généré
  } else {
    vlans.push(makeVLAN(domain,'vSAN','vsan','vSAN ESA VMkernel','vSAN storage — 1 vmk per host','mandatory',scope,wld.hostCount,`${wld.hostCount} vmk IPs (vSAN ESA)`,buf,bufPct));
  }

  if(wld.nsxEnabled){
    const tepIPs=wld.hostCount*wld.tepInterfacesPerHost;
    vlans.push(makeVLAN(domain,'NSX Host TEP','nsx-tep','NSX Host TEP pool','Geneve overlay','mandatory',scope,tepIPs,`${wld.hostCount} × ${wld.tepInterfacesPerHost} = ${tepIPs} IPs`,buf,bufPct));
    if(wld.edgeRequired){
      const edgeScope=wld.sharedEdgeUplinks?'shared':'dedicated';
      vlans.push(makeVLAN(domain,'NSX Edge TEP','nsx-tep','Edge TEP — separate from Host TEP','Dedicated TEP for Edge','mandatory',scope,wld.edgeNodeCount,`${wld.edgeNodeCount} Edge TEP IPs`,buf,bufPct));
      vlans.push(makeVLAN(domain,'NSX Edge Uplink 1','nsx-edge-uplink1','Edge uplink 1','N-S uplink','mandatory',edgeScope,wld.edgeNodeCount,`${wld.edgeNodeCount} IPs`,buf,bufPct));
      vlans.push(makeVLAN(domain,'NSX Edge Uplink 2','nsx-edge-uplink2','Edge uplink 2','Redundant uplink','mandatory',edgeScope,wld.edgeNodeCount,`${wld.edgeNodeCount} IPs`,buf,bufPct));
    }
  }
  if(wld.aviEnabled)vlans.push(makeVLAN(domain,'AVI VIP Network','avi','AVI VIP pool','VIP pool for AVI load balancer services','scenario-driven','dedicated',32,'Adjust to service count',buf,bufPct));
  if(wld.vksEnabled)vlans.push(makeVLAN(domain,'VKS Infrastructure','vks','VKS Supervisor — 5 IPs (recommended as a contiguous block)','Kubernetes Supervisor','scenario-driven','dedicated',5,'5 IPs (recommended contiguous block): 3 control plane + 1 floating + 1 patching. Note: workload network, AVI VIP pool, ingress/egress CIDR and pod CIDR are separate additional requirements.',buf,bufPct));
  wld.additionalServices.filter(s=>s.requiresDedicatedVLAN).forEach(svc=>vlans.push(makeVLAN(domain,`${svc.name} Network`,'service',`Dedicated VLAN for ${svc.name}`,`Service VLAN`,'optional','dedicated',svc.applianceCount+(svc.requiresVIP?svc.vipCount:0),svc.notes||'',buf,bufPct)));
  return vlans;
}

// Returns network prefix (e.g. "10.0.1.") from the VLAN CIDR if filled in
export function getVLANPrefix(vlans, appDomain, vlanName){
  let vlan=vlans.find(v=>v.domain===appDomain&&v.vlanName===vlanName);
  if(!vlan)vlan=vlans.find(v=>v.vlanName===vlanName);
  if(!vlan||!vlan.cidr)return '';
  const m=vlan.cidr.match(/^(\d+\.\d+\.\d+)\.\d+\/\d+$/);
  return m?m[1]+'.':'';
}
