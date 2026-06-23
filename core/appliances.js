// Pure appliance/component domain logic: builds management/workload appliance inventories.

// ── APPLIANCE ENGINE ────────────────────────────────────────────
let _appId=0;
export function resetAppCounter(){_appId=0;}
export function mkApp(name,type,domain,hostingArea,vlan,staticIP,vipReq,fqdnReq,notes){
  return {id:`appliance-${++_appId}`,applianceName:name,applianceType:type,domain,hostingArea,vlan,staticIPRequired:staticIP,vipRequired:vipReq,fqdnRequired:fqdnReq,notes,ipAddress:'',fqdn:''};
}

export function buildManagementAppliances(mgmt,project,t=k=>k){
  resetAppCounter();
  const apps=[];
  const domain='Management Domain';
  const is91=project.vcfVersion==='9.1';
  const fleetDedicated=['dedicated-fleet-vlan','nsx-vlan-segment','nsx-overlay-segment'].includes(mgmt.fleetPlacement);
  const _fvn=mgmt.fleetPlacement==='nsx-overlay-segment'?'Fleet NSX Overlay Segment':mgmt.fleetPlacement==='nsx-vlan-segment'?'Fleet NSX VLAN Segment':(is91?'VCF Management Services Runtime':'Fleet Network');
  const fleetVLAN=fleetDedicated?_fvn:'Management VM Network';
  function platVLAN(req,name){if(req)return name;return fleetDedicated?_fvn:'Management VM Network';}

  apps.push(mkApp('sddc-manager-01','SDDC Manager',domain,'Management VM Network','Management VM Network',true,false,true,'Primary SDDC Manager.'));
  apps.push(mkApp('vcenter-mgmt-01','vCenter Server',domain,'Management VM Network','Management VM Network',true,false,true,'Management Domain vCenter.'));

  if(mgmt.topologyMode==='vsan-stretched'||mgmt.topologyMode==='stretched'){
    if(mgmt.witnessDedicatedVsanVmk){
      apps.push(mkApp('vsan-witness-mgmt','vSAN Witness Appliance (vmk0 — Management)',domain,'vSAN Witness Traffic — Witness Appliance','vSAN Witness Traffic — Witness Appliance',true,false,true,'Witness Host management interface. Independent 3rd site — not part of AZ1/AZ2 host count.'));
      apps.push(mkApp('vsan-witness-vsan','vSAN Witness Appliance (vmk1 — vSAN Witness Traffic)',domain,'vSAN Witness Traffic — Witness Appliance','vSAN Witness Traffic — Witness Appliance',true,false,true,'Dedicated witness traffic interface (vmk1). Requires independent L3 path to both AZ1 and AZ2.'));
    } else {
      apps.push(mkApp('vsan-witness-mgmt','vSAN Witness Appliance',domain,'vSAN Witness Traffic — Witness Appliance','vSAN Witness Traffic — Witness Appliance',true,false,true,'Witness Host — shared vmk0 for management + witness traffic. Independent 3rd site, not part of AZ1/AZ2 host count.'));
    }
  }

  const nsxCount=mgmt.nsxManagerMode==='clustered'?3:1;
  for(let i=1;i<=nsxCount;i++) apps.push(mkApp(`nsx-manager-mgmt-0${i}`,'NSX Manager',domain,'Management VM Network','Management VM Network',true,i===1&&mgmt.nsxManagerMode==='clustered',true,`NSX Manager node ${i} of ${nsxCount}.`));
  // C14: VIP NSX Manager réservée dans tous les modes (Simple + HA) pour permettre un futur scale-out HA sans ré-IP — bonne pratique VCF IP Allocation Workbook (Broadcom TechDocs VCF 9.1)
  apps.push(mkApp('nsx-vip-mgmt','NSX Manager VIP',domain,'Management VM Network','Management VM Network',true,false,true,mgmt.nsxManagerMode==='clustered'?'NSX Manager cluster VIP — HA mode.':t('app.nsx_vip_simple')));

  if(is91){
    apps.push(mkApp('fleet-01','Fleet Appliance (VCF 9.1)',domain,fleetVLAN,fleetVLAN,true,false,true,t('app.fleet_91',{placement:mgmt.fleetPlacement})));
    apps.push(mkApp('mgmt-instance-01','VCF Mgmt Services Instance',domain,fleetVLAN,fleetVLAN,true,false,true,t('app.instance_91')));
    apps.push(mkApp('vcf-svc-runtime','VCF Services Runtime',domain,fleetVLAN,fleetVLAN,true,false,true,t('app.svc_runtime')));
  } else {
    apps.push(mkApp('fleet-01','Fleet Appliance (VCF 9.0)',domain,fleetVLAN,fleetVLAN,true,false,true,t('app.fleet_90',{placement:mgmt.fleetPlacement})));
  }

  if(mgmt.nsxEdgeDeployed){
    for(let i=1;i<=mgmt.nsxEdgeNodeCount;i++) apps.push(mkApp(`nsx-edge-mgmt-0${i}`,'NSX Edge Node',domain,'Management VM Network','Management VM Network',true,false,true,`Edge node ${i}: eth0→Mgmt VM Net, TEP→NSX Edge TEP, fp-eth0/1→Uplink 1/2.`));
  }
  if(mgmt.aviDeployed){
    for(let i=1;i<=3;i++) apps.push(mkApp(`avi-controller-0${i}`,'AVI Controller',domain,'Management VM Network','Management VM Network',true,i===1,true,`AVI Controller node ${i} of 3.`));
    apps.push(mkApp('avi-cluster-vip','AVI Cluster VIP',domain,'Management VM Network','Management VM Network',true,false,true,'AVI Controller cluster VIP.'));
  }

  if(mgmt.sspEnabled){
    apps.push(mkApp('ssp-installer-01','SSP Installer (SSPI)',domain,'Management VM Network','Management VM Network',true,false,true,'Security Services Platform Installer appliance.'));
    apps.push(mkApp('ssp-node-pool','SSP Node Pool (3 controllers + workers)',domain,'SSP Network','SSP Network',true,false,false,'Pool of 13 IPs (3 controllers + minimum 4 workers, per Broadcom\'s documented minimum) — not itemized IP by IP.'));
    apps.push(mkApp('ssp-service-pool','SSP Service IP Pool',domain,'SSP Network','SSP Network',true,true,true,'Contiguous pool of 7 IPs: SSP Instance (NSX metrics ingestion) + SSP Messaging (flow data).'));
  }
  if(mgmt.sspEnabled||mgmt.aviDeployed){
    apps.push(mkApp('license-hub-controller','License Hub Controller',domain,'Management VM Network','Management VM Network',true,false,true,'Licenses vDefend + Avi subscriptions — deployed once per Fleet.'));
    apps.push(mkApp('license-hub-worker','License Hub Worker',domain,'Management VM Network','Management VM Network',true,false,false,'Worker node of the License Hub cluster.'));
    apps.push(mkApp('license-hub-installer','License Hub Installer',domain,'Management VM Network','Management VM Network',true,false,true,'Temporary installer — IP from a subnet with L2/L3 connectivity to the License Hub pool.'));
  }

  if(mgmt.vcfOperations.enabled){
    const opsVLAN=platVLAN(mgmt.vcfOperations.requiresDedicatedVLAN,'VCF Operations Network');
    const nc=mgmt.vcfOperations.mode==='enterprise'?3:1;
    for(let i=1;i<=nc;i++) apps.push(mkApp(`vcf-ops-${String(i).padStart(2,'0')}`,nc===1?'VCF Operations Node':i===1?'VCF Operations Master Node':'VCF Operations Replica Node',domain,opsVLAN,opsVLAN,true,false,true,`VCF Operations node ${i}${nc>1?' of '+nc:''}.`));
    if(mgmt.vcfOperations.mode==='enterprise') apps.push(mkApp('vcf-ops-vip','VCF Operations Cluster VIP',domain,opsVLAN,opsVLAN,true,false,true,'Cluster VIP for VCF Operations enterprise mode.'));
    for(let r=1;r<=mgmt.vcfOperations.remoteCollectorCount;r++) apps.push(mkApp(`vcf-ops-rc-${String(r).padStart(2,'0')}`,'VCF Operations Remote Collector',domain,'Management VM Network','Management VM Network',true,false,true,t('app.rc_note',{r})));
    if(mgmt.vcfOperations.cloudProxyEnabled) apps.push(mkApp('vcf-ops-cloud-proxy-01','VCF Operations Cloud Proxy',domain,'Management VM Network','Management VM Network',true,false,true,t('app.cloud_proxy')));
    if(mgmt.vcfOperations.licenseServerEnabled) apps.push(mkApp('vcf-license-server-01','VCF License Server',domain,'Management VM Network','Management VM Network',true,false,true,t('app.license_server')));
  }

  if(mgmt.vcfOperationsForLogs.enabled){
    if(is91){
      // C6: 9.1 — Log Management intégré dans VCF Management Services (Aria Ops for Logs 8.18)
      const lVLAN=platVLAN(mgmt.vcfOperationsForLogs.requiresDedicatedVLAN,'Log Management Network');
      apps.push(mkApp('vcf-log-mgmt-01','VCF Log Management',domain,lVLAN,lVLAN,true,false,true,t('app.log_mgmt_91')));
    } else {
      // VCF 9.0 — architecture master + workers classique
      const lVLAN=platVLAN(mgmt.vcfOperationsForLogs.requiresDedicatedVLAN,'VCF Operations for Logs Network');
      apps.push(mkApp('vcf-logs-master-01','VCF Ops for Logs Master',domain,lVLAN,lVLAN,true,false,true,'Master node.'));
      if(mgmt.vcfOperationsForLogs.mode==='clustered'){
        for(let w=1;w<=mgmt.vcfOperationsForLogs.workerCount;w++) apps.push(mkApp(`vcf-logs-worker-${String(w).padStart(2,'0')}`,'VCF Ops for Logs Worker',domain,lVLAN,lVLAN,true,false,true,`Worker node ${w}.`));
        apps.push(mkApp('vcf-logs-ui-vip','VCF Ops for Logs UI VIP',domain,lVLAN,lVLAN,true,false,true,'UI/API access VIP.'));
        if(mgmt.vcfOperationsForLogs.integratedLBVIP) apps.push(mkApp('vcf-logs-ilb-vip','VCF Ops for Logs ILB VIP',domain,lVLAN,lVLAN,true,false,true,'ILB VIP for syslog/CFAPI. All log sources must use this VIP.'));
      }
    }
  }

  if(mgmt.vcfOperationsForNetworks.enabled){
    const nVLAN=platVLAN(mgmt.vcfOperationsForNetworks.requiresDedicatedVLAN,'VCF Operations for Networks Network');
    for(let p=1;p<=mgmt.vcfOperationsForNetworks.platformNodeCount;p++) apps.push(mkApp(`vcf-nets-platform-${String(p).padStart(2,'0')}`,'VCF Ops for Networks Platform VM',domain,nVLAN,nVLAN,true,false,true,`Platform VM ${p}.`));
    for(let c=1;c<=mgmt.vcfOperationsForNetworks.collectorCount;c++) apps.push(mkApp(`vcf-nets-collector-${String(c).padStart(2,'0')}`,'VCF Ops for Networks Collector',domain,'Management VM Network','Management VM Network',true,false,true,`Collector ${c} — instance-level, always in Mgmt VM Network.`));
  }

  if(mgmt.vcfAutomation.enabled){
    // 9.1: VCF Automation /29 (5 IPs) defaults to the Management VM Network regardless of the Fleet/Runtime placement; a dedicated VLAN is only possible via the VCF Operations fleet lifecycle API ; 9.0 = platform-services placement
    const aVLAN=is91?(mgmt.vcfAutomation.requiresDedicatedVLAN?'VCF Automation Network':'Management VM Network'):platVLAN(mgmt.vcfAutomation.requiresDedicatedVLAN,'VCF Automation Network');
    if(is91){
      // 9.1: 1 dedicated Automation FQDN (endpoint/VIP) + 1 dedicated VCF Services Runtime FQDN. Nodes (/29 block) without individual DNS.
      apps.push(mkApp('vcf-automation-01','VCF Automation',domain,aVLAN,aVLAN,true,false,true,t('app.auto_91')));
      // 9.1: no separate vcf-auto-vip — the Automation FQDN IS the VIP endpoint.
      if(mgmt.vcfAutomation.orchestratorMode==='standalone'){
        const vrc=mgmt.vcfAutomation.orchestratorNodeCount;
        for(let r=1;r<=vrc;r++) apps.push(mkApp(`vcf-vro-${String(r).padStart(2,'0')}`,'VCF Operations Orchestrator (vRO)',domain,aVLAN,aVLAN,true,false,true,`vRO node ${r} of ${vrc} — VM appliance (encore VM-based en 9.1).`));
        if(vrc>1) apps.push(mkApp('vcf-vro-vip','VCF Operations Orchestrator VIP',domain,aVLAN,aVLAN,true,false,true,'Cluster VIP for vRO HA.'));
      }
    } else {
      // VCF 9.0 — VA nodes classiques
      const vc=mgmt.vcfAutomation.mode==='clustered'?4:1;
      for(let v=1;v<=vc;v++){
        const isUpgrade=mgmt.vcfAutomation.mode==='clustered'&&v===4;
        apps.push(mkApp(`vcf-auto-va-${String(v).padStart(2,'0')}`,isUpgrade?'VCF Automation VA (upgrade/patching)':mgmt.vcfAutomation.mode==='clustered'?`VCF Automation VA (node ${v} of 3 active)`:'VCF Automation VA',domain,aVLAN,aVLAN,true,false,true,isUpgrade?'Node 4: reserved for upgrade/patching.':`VA node ${v}.`));
      }
      if(mgmt.vcfAutomation.mode==='clustered') apps.push(mkApp('vcf-auto-vip','VCF Automation Cluster VIP',domain,aVLAN,aVLAN,true,false,true,'Cluster VIP for HA deployment (3 active + 1 upgrade node).'));
      if(mgmt.vcfAutomation.orchestratorMode==='standalone'){
        const vrc=mgmt.vcfAutomation.orchestratorNodeCount;
        for(let r=1;r<=vrc;r++) apps.push(mkApp(`vcf-vro-${String(r).padStart(2,'0')}`,'VCF Automation Orchestrator (vRO)',domain,aVLAN,aVLAN,true,false,true,`Standalone vRO node ${r} of ${vrc}.`));
        if(vrc>1) apps.push(mkApp('vcf-vro-vip','VCF Automation Orchestrator VIP',domain,aVLAN,aVLAN,true,false,true,'Cluster VIP for standalone vRO HA.'));
      }
    }
  }

  if(mgmt.vcfIdentityBroker.enabled){
    if(mgmt.vcfIdentityBroker.mode==='embedded'){
      apps.push(mkApp('vcf-identity-broker-embedded','VCF Identity Broker (Embedded)',domain,'Embedded (vCenter/NSX)','Management VM Network',false,false,false,t('app.ib_embedded')));
    } else if(is91){
      // 9.1 — Identity Broker is a service within VCF Services Runtime (no separate VMs); its IP is allocated from the Services Runtime block, so it follows the Fleet/Runtime VLAN placement
      const ibVLAN=mgmt.vcfIdentityBroker.requiresDedicatedVLAN?'VCF Identity Broker Network':fleetVLAN;
      apps.push(mkApp('vcf-identity-broker-01','VCF Identity Broker',domain,ibVLAN,ibVLAN,true,false,true,t('app.ib_91')));
    } else {
      // VCF 9.0 — VM appliances classiques
      const ibVLAN=mgmt.vcfIdentityBroker.requiresDedicatedVLAN?'VCF Identity Broker Network':'Management VM Network';
      const ibc=mgmt.vcfIdentityBroker.haEnabled?3:1;
      for(let b=1;b<=ibc;b++) apps.push(mkApp(`vcf-identity-broker-${String(b).padStart(2,'0')}`,mgmt.vcfIdentityBroker.haEnabled?`VCF Identity Broker (node ${b} of ${ibc})`:'VCF Identity Broker',domain,ibVLAN,ibVLAN,true,false,true,`Identity Broker appliance ${b}.`));
      if(mgmt.vcfIdentityBroker.haEnabled) apps.push(mkApp('vcf-identity-broker-vip','VCF Identity Broker HA VIP',domain,ibVLAN,ibVLAN,true,false,true,'HA VIP for Identity Broker cluster.'));
    }
  }

  if(mgmt.vksEnabled||project.scenario==='vcf-automation-vks') apps.push(mkApp('vks-supervisor','VKS Supervisor Cluster',domain,'VKS Infrastructure','VKS Infrastructure',true,false,true,'5 IPs (recommended contiguous block): 3 control plane VMs + 1 floating + 1 patching. Workload network, AVI VIP pool, ingress/egress CIDR and pod CIDR are separate additional requirements.'));

  mgmt.additionalServices.forEach(svc=>{
    const sVLAN=svc.requiresDedicatedVLAN?`${svc.name} Network`:'Management VM Network';
    for(let i=1;i<=svc.applianceCount;i++) apps.push(mkApp(`${svc.name.toLowerCase().replace(/\s/g,'-')}-0${i}`,svc.name,domain,sVLAN,sVLAN,true,false,true,svc.notes||`Appliance ${i}.`));
    if(svc.requiresVIP&&svc.vipCount>0) for(let v=1;v<=svc.vipCount;v++) apps.push(mkApp(`${svc.name.toLowerCase().replace(/\s/g,'-')}-vip-0${v}`,`${svc.name} VIP`,domain,sVLAN,sVLAN,true,false,true,`VIP for ${svc.name}.`));
  });

  return apps;
}

export function buildWorkloadAppliances(wld,t=k=>k){
  const apps=[];
  const domain=wld.domainName;
  apps.push(mkApp(`vcenter-${domain.toLowerCase()}-01`,'vCenter Server',domain,'Management Domain — Mgmt VM Net','Management VM Network',true,false,true,`vCenter for ${domain}. IP in Mgmt Domain Mgmt VM Network.`));

  if(wld.topologyMode==='vsan-stretched'||wld.topologyMode==='stretched'){
    if(wld.witnessDedicatedVsanVmk){
      apps.push(mkApp(`vsan-witness-${domain.toLowerCase()}-mgmt`,'vSAN Witness Appliance (vmk0 — Management)',domain,'vSAN Witness Traffic — Witness Appliance','vSAN Witness Traffic — Witness Appliance',true,false,true,`Witness Host management interface for ${domain}. Independent 3rd site — not part of AZ1/AZ2 host count.`));
      apps.push(mkApp(`vsan-witness-${domain.toLowerCase()}-vsan`,'vSAN Witness Appliance (vmk1 — vSAN Witness Traffic)',domain,'vSAN Witness Traffic — Witness Appliance','vSAN Witness Traffic — Witness Appliance',true,false,true,`Dedicated witness traffic interface (vmk1) for ${domain}. Requires independent L3 path to both AZ1 and AZ2.`));
    } else {
      apps.push(mkApp(`vsan-witness-${domain.toLowerCase()}`,'vSAN Witness Appliance',domain,'vSAN Witness Traffic — Witness Appliance','vSAN Witness Traffic — Witness Appliance',true,false,true,`Witness Host for ${domain} — shared vmk0 for management + witness traffic. Independent 3rd site, not part of AZ1/AZ2 host count.`));
    }
  }

  if(wld.nsxEnabled&&wld.nsxManagerMode!=='shared'){
    const nc=wld.nsxManagerMode==='clustered'?3:1;
    for(let i=1;i<=nc;i++) apps.push(mkApp(`nsx-manager-${domain.toLowerCase()}-0${i}`,'NSX Manager',domain,'Management Domain — Mgmt VM Net','Management VM Network',true,false,true,`NSX Mgr ${i}/${nc} for ${domain}. IP in Mgmt Domain Mgmt VM Network.`));
    apps.push(mkApp(`nsx-manager-${domain.toLowerCase()}-vip`,'NSX Manager VIP',domain,'Management Domain — Mgmt VM Net','Management VM Network',true,false,true,wld.nsxManagerMode==='clustered'?`NSX Manager cluster VIP for ${domain}.`:`NSX Manager VIP for ${domain} (reserved for future scale-out).`));
  }
  if(wld.nsxEnabled&&wld.edgeRequired){
    for(let i=1;i<=wld.edgeNodeCount;i++) apps.push(mkApp(`nsx-edge-${domain.toLowerCase()}-0${i}`,'NSX Edge Node',domain,'VM / Application Network','VM / Application Network',true,false,true,`Edge node ${i}: eth0→VM/App Net, TEP→Edge TEP, fp-eth0/1→Uplink 1/2.`));
  }
  if(wld.aviEnabled){
    apps.push(mkApp(`avi-se-${domain.toLowerCase()}-01`,'AVI Service Engine',domain,'AVI VIP Network','AVI VIP Network',true,false,false,`AVI SE for ${domain}.`));
    apps.push(mkApp(`avi-se-${domain.toLowerCase()}-02`,'AVI Service Engine',domain,'AVI VIP Network','AVI VIP Network',true,false,false,'AVI SE pair for HA.'));
  }
  if(wld.vksEnabled) apps.push(mkApp(`vks-supervisor-${domain.toLowerCase()}`,'VKS Supervisor',domain,'VKS Infrastructure','VKS Infrastructure',true,false,true,`VKS Supervisor for ${domain}.`));
  if(wld.sspEnabled&&wld.nsxEnabled&&wld.nsxManagerMode!=='shared'){
    apps.push(mkApp(`ssp-node-pool-${domain.toLowerCase()}`,'SSP Node Pool (3 controllers + workers)',domain,'SSP Network','SSP Network',true,false,false,`Pool of 13 IPs for ${domain} (3 controllers + minimum 4 workers).`));
    apps.push(mkApp(`ssp-service-pool-${domain.toLowerCase()}`,'SSP Service IP Pool',domain,'SSP Network','SSP Network',true,true,true,`Contiguous pool of 7 IPs for ${domain}.`));
  }
  wld.additionalServices.forEach(svc=>{
    const sVLAN=svc.requiresDedicatedVLAN?`${svc.name} Network`:'VM / Application Network';
    for(let i=1;i<=svc.applianceCount;i++) apps.push(mkApp(`${svc.name.toLowerCase().replace(/\s/g,'-')}-${domain.toLowerCase()}-0${i}`,svc.name,domain,sVLAN,sVLAN,true,false,true,svc.notes||''));
  });
  return apps;
}
