// Pure VIP domain logic: builds management/workload virtual IP inventories.

// ── VIP ENGINE ──────────────────────────────────────────────────
let _vipId=0;
export function resetVipCounter(){_vipId=0;}
export function mkVIP(vipName,service,domain,vlan,notes){
  return {id:`vip-${++_vipId}`,vipName,associatedService:service,domain,vlan,ipPlaceholder:'TBD',fqdnPlaceholder:'TBD',notes,ipAddress:'',fqdn:''};
}

export function buildManagementVIPs(mgmt,project){
  resetVipCounter();
  const vips=[];
  const domain='Management Domain';
  const is91=project.vcfVersion==='9.1';
  const fleetDedicated=['dedicated-fleet-vlan','nsx-vlan-segment','nsx-overlay-segment'].includes(mgmt.fleetPlacement);
  const _fvn=mgmt.fleetPlacement==='nsx-overlay-segment'?'Fleet NSX Overlay Segment':mgmt.fleetPlacement==='nsx-vlan-segment'?'Fleet NSX VLAN Segment':(is91?'VCF Management Services Runtime':'Fleet Network');
  const fleetVLAN=fleetDedicated?_fvn:'Management VM Network';
  function platVLAN(req,name){if(req)return name;return fleetDedicated?_fvn:'Management VM Network';}

  vips.push(mkVIP('NSX Manager VIP','NSX Manager',domain,'Management VM Network',mgmt.nsxManagerMode==='clustered'?'Cluster VIP for NSX Manager 3-node cluster.':'Standalone NSX Manager — VIP reserved for future scale-out.'));
  vips.push(mkVIP('Fleet VIP','Fleet',domain,fleetVLAN,mgmt.fleetMode==='clustered'?'Fleet HA cluster VIP.':'Fleet standalone VIP. Reserved for DNS stability.'));
  if(mgmt.aviDeployed) vips.push(mkVIP('AVI Controller Cluster VIP','Avi Load Balancer',domain,'Management VM Network','AVI Controller cluster VIP.'));
  if(mgmt.vcfOperations.enabled){const v=platVLAN(mgmt.vcfOperations.requiresDedicatedVLAN,'VCF Operations Network');vips.push(mkVIP('VCF Operations VIP','VCF Operations',domain,v,mgmt.vcfOperations.mode==='enterprise'?'Enterprise analytics cluster VIP.':'Standalone VCF Operations VIP — reserved for DNS.'));}
  if(mgmt.vcfOperationsForLogs.enabled){
    if(is91){
      // 9.1: Log Management = 1 FQDN (LB endpoint), IPs (6 base +2/replica) allocated from the VCF Services Runtime block — no separate UI/ILB VIPs
      vips.push(mkVIP('VCF Log Management VIP','VCF Log Management',domain,fleetVLAN,'Log Management LB endpoint (1 FQDN). IPs allocated from the VCF Services Runtime block (6 base + 2 per additional replica).'));
    } else {
      const v=platVLAN(mgmt.vcfOperationsForLogs.requiresDedicatedVLAN,'VCF Operations for Logs Network');
      vips.push(mkVIP('VCF Operations for Logs UI VIP','VCF Operations for Logs',domain,v,mgmt.vcfOperationsForLogs.mode==='clustered'?'UI/API VIP for Logs cluster.':'Standalone Logs VIP — reserved for DNS.'));
      if(mgmt.vcfOperationsForLogs.mode==='clustered'&&mgmt.vcfOperationsForLogs.integratedLBVIP) vips.push(mkVIP('VCF Operations for Logs ILB Syslog VIP','VCF Operations for Logs — ILB',domain,v,'ILB VIP for syslog (UDP 514) and CFAPI. All log sources must point here.'));
    }
  }
  if(mgmt.vcfOperationsForNetworks.enabled){const v=platVLAN(mgmt.vcfOperationsForNetworks.requiresDedicatedVLAN,'VCF Operations for Networks Network');vips.push(mkVIP('VCF Operations for Networks VIP','VCF Operations for Networks',domain,v,'VIP for VCF Ops for Networks UI/API.'));}
  if(mgmt.vcfAutomation.enabled){
    // 9.1: /29 (5 IPs) block defaults to Management VM Network — independent from the Services Runtime block
    const v=is91?(mgmt.vcfAutomation.requiresDedicatedVLAN?'VCF Automation Network':'Management VM Network'):platVLAN(mgmt.vcfAutomation.requiresDedicatedVLAN,'VCF Automation Network');
    vips.push(mkVIP('VCF Automation VIP','VCF Automation',domain,v,is91?'VCF Automation 9.1 endpoint (FQDN = VIP). /29 block (5 IPs): 3 IPs assigned to nodes + 2 IPs buffer for redeploy/rolling updates.':(mgmt.vcfAutomation.mode==='clustered'?'Cluster VIP for VCF Automation HA (3 active + 1 upgrade node).':'Standalone VCF Automation VIP.')));
    if(mgmt.vcfAutomation.orchestratorMode==='standalone') vips.push(mkVIP('VCF Automation Orchestrator (vRO) VIP','VCF Automation Orchestrator (vRO)',domain,v,mgmt.vcfAutomation.orchestratorNodeCount>1?'Cluster VIP for standalone vRO HA cluster.':'Standalone vRO VIP — reserved for DNS.'));
  }
  // 9.1: Identity Broker has no separate VIP — its FQDN is the Services Runtime-integrated endpoint (1 FQDN + 1 IP from the Runtime block, see Appliances tab) ; 9.0 = appliance VIP
  if(mgmt.vcfIdentityBroker.enabled&&mgmt.vcfIdentityBroker.mode==='appliance'&&!is91){const v=mgmt.vcfIdentityBroker.requiresDedicatedVLAN?'VCF Identity Broker Network':'Management VM Network';vips.push(mkVIP('VCF Identity Broker VIP','VCF Identity Broker',domain,v,mgmt.vcfIdentityBroker.haEnabled?'HA VIP for Identity Broker cluster.':'Standalone Identity Broker VIP.'));}
  if(mgmt.vksEnabled||project.scenario==='vcf-automation-vks'){vips.push(mkVIP('VKS Supervisor API VIP','VKS Supervisor',domain,'VKS Infrastructure','Kubernetes API server VIP.'));vips.push(mkVIP('VKS Ingress VIP Pool','VKS Load Balancer',domain,'VKS Infrastructure','NSX ALB VIP pool for VKS workload ingress.'));}
  mgmt.additionalServices.forEach(svc=>{if(svc.requiresVIP&&svc.vipCount>0){const v=svc.requiresDedicatedVLAN?`${svc.name} Network`:'Management VM Network';for(let i=1;i<=svc.vipCount;i++) vips.push(mkVIP(`${svc.name} VIP ${i}`,svc.name,domain,v,`Service VIP ${i} for ${svc.name}.`));}});
  return vips;
}

export function buildWorkloadVIPs(wld){
  const vips=[];
  const domain=wld.domainName;
  if(wld.nsxEnabled&&wld.nsxManagerMode!=='shared') vips.push(mkVIP(`${domain} NSX Manager VIP`,'NSX Manager',domain,'Management VM Network',wld.nsxManagerMode==='clustered'?`NSX Manager cluster VIP for ${domain}.`:`NSX Manager VIP for ${domain} (reserved for DNS).`));
  if(wld.aviEnabled) vips.push(mkVIP(`${domain} AVI VIP Pool`,'AVI Load Balancer',domain,'AVI VIP Network',`LB VIP pool for ${domain} workloads.`));
  if(wld.vksEnabled){vips.push(mkVIP(`${domain} VKS Supervisor VIP`,'VKS Supervisor',domain,'VKS Infrastructure',`Kubernetes API VIP for ${domain}.`));vips.push(mkVIP(`${domain} VKS Ingress VIP Pool`,'VKS Ingress',domain,'VKS Infrastructure',`NSX ALB VIP pool for ${domain} VKS ingress.`));}
  wld.additionalServices.forEach(svc=>{if(svc.requiresVIP&&svc.vipCount>0){const v=svc.requiresDedicatedVLAN?`${svc.name} Network`:'VM / Application Network';for(let i=1;i<=svc.vipCount;i++) vips.push(mkVIP(`${domain} ${svc.name} VIP ${i}`,svc.name,domain,v,`VIP for ${svc.name} in ${domain}.`));}});
  return vips;
}
