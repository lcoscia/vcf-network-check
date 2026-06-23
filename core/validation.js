// Pure validation engine: runs design-rule checks across project/domain/VLAN state and returns structured messages.

// ── VALIDATION ENGINE ────────────────────────────────────────────
let _valId=0;
export function mkMsg(severity,category,domain,message,resolution){return {id:`val-${++_valId}`,severity,category,domain,message,resolution};}

export function runValidation(project,mgmt,workloads,vlans,t=k=>k){
  _valId=0;
  const msgs=[];
  const domain='Management Domain';
  if(mgmt.hostCount<3) msgs.push(mkMsg('blocker','bring-up',domain,`Management Domain has ${mgmt.hostCount} hosts. Minimum 3 required (vSAN ESA/OSA cluster technical minimum).`,'Add hosts to reach at least 3 (vSAN minimum) or 4 (recommended).'));
  else if(mgmt.hostCount===3){
    if(project.scenario==='consolidated-3node-vsan-esa'&&(mgmt.storageType==='vsan-esa'||mgmt.storageType==='vsan-osa')) msgs.push(mkMsg('info','bring-up',domain,'3-host vSAN cluster meets the documented Consolidated Architecture / VCF Edge minimum (Broadcom TechDocs VCF 9.1).','No action required — 4 hosts recommended for N+1 resilience if scaling later.'));
    else msgs.push(mkMsg('warning','bring-up',domain,'Management Domain has 3 hosts — meets the vSAN technical minimum but 4 hosts is the standard recommended baseline for N+1 resilience.','Consider adding a 4th host, or select the "Consolidated / 3-Node vSAN ESA" scenario if 3 hosts is intentional.'));
  }
  if(mgmt.nsxEdgeDeployed&&mgmt.nsxEdgeNodeCount<2) msgs.push(mkMsg('warning','nsx',domain,'Single NSX Edge node — no HA. Recommend 2+ Edge nodes.','Increase Edge node count to 2.'));
  if(!mgmt.fleetPlacement) msgs.push(mkMsg('blocker','vlan',domain,'Fleet placement is undefined.','Select Fleet placement.'));
  if(!mgmt.layer2AdjacencyConfirmed) msgs.push(mkMsg('warning','bring-up',domain,'L2 adjacency for bring-up not confirmed.','Confirm L2 adjacency.'));
  if(mgmt.topologyMode==='vsan-stretched'){
    msgs.push(mkMsg('warning','bring-up',domain,t('val.vsan_warn'),t('val.vsan_warn_res')));
    if(!mgmt.layer2AdjacencyConfirmed)msgs.push(mkMsg('blocker','bring-up',domain,t('val.vsan_l2_block'),t('val.vsan_l2_res')));
  }
  if(mgmt.topologyMode==='stretched') msgs.push(mkMsg('warning','bring-up',domain,'Stretched topology (vMSC): ensure all VLANs are extended across all sites.','Verify VLAN extension.'));
  if(mgmt.topologyMode==='vsan-stretched'||mgmt.topologyMode==='stretched'){
    if(mgmt.az1HostCount<1||mgmt.az2HostCount<1) msgs.push(mkMsg('blocker','bring-up',domain,'Each Availability Zone must have at least 1 host.','Set AZ1/AZ2 host counts to 1 or more.'));
    else if(mgmt.az1HostCount!==mgmt.az2HostCount) msgs.push(mkMsg('blocker','bring-up',domain,`AZ1 (${mgmt.az1HostCount}) and AZ2 (${mgmt.az2HostCount}) host counts differ. vSAN Stretched Cluster requires equal host counts per site for proper failover.`,'Set AZ1 host count equal to AZ2 host count.'));
    const perSite=mgmt.az1HostCount;
    const tier=perSite<=10?'<200ms RTT':perSite<=15?'<100ms RTT':'exceeds the documented 15-host/site tier';
    msgs.push(mkMsg('info','bring-up',domain,`Witness latency tier for ${perSite} hosts/site: ${tier} required between each AZ and the vSAN Witness (min 10 Gbps between AZ1 and AZ2).`,'Confirm the WAN/L3 link to the Witness meets this RTT.'));
  }
  if(mgmt.fleetPlacement==='nsx-overlay-segment'&&!mgmt.nsxEdgeDeployed) msgs.push(mkMsg('blocker','nsx',domain,t('val.overlay_block'),t('val.overlay_res')));
  if((mgmt.vksEnabled||project.scenario==='vcf-automation-vks')&&!mgmt.nsxEdgeDeployed) msgs.push(mkMsg('warning','scenario',domain,'VKS enabled but NSX Edge not deployed.','Deploy NSX Edge or confirm overlay from WLD NSX.'));
  if(mgmt.aviDeployed&&!mgmt.nsxEdgeDeployed) msgs.push(mkMsg('info','scenario',domain,'AVI enabled but NSX Edge not deployed. Verify data plane connectivity.','Verify AVI SE network design.'));
  if(mgmt.tepInterfacesPerHost<2) msgs.push(mkMsg('warning','nsx',domain,'TEP interfaces per host < 2. Recommend 2 for TEP HA.','Set TEP to 2+.'));
  if(mgmt.vcfOperations.enabled&&mgmt.vcfOperations.mode==='enterprise'&&mgmt.vcfOperations.remoteCollectorCount===0) msgs.push(mkMsg('info','scenario',domain,'VCF Operations enterprise mode with no Remote Collectors.','Add collectors for workload domains.'));
  if(mgmt.vcfOperationsForLogs.enabled&&mgmt.vcfOperationsForLogs.mode==='clustered'&&!mgmt.vcfOperationsForLogs.integratedLBVIP) msgs.push(mkMsg('warning','vip',domain,'VCF Ops for Logs clustered but ILB VIP disabled. Log sources cannot use a single syslog endpoint.','Enable ILB VIP.'));
  if(mgmt.vcfOperationsForLogs.enabled&&mgmt.vcfOperationsForLogs.mode==='clustered'&&mgmt.vcfOperationsForLogs.workerCount<2) msgs.push(mkMsg('warning','scenario',domain,`VCF Ops for Logs: only ${mgmt.vcfOperationsForLogs.workerCount} worker(s). Min 2 recommended.`,'Set worker count ≥ 2.'));
  // 9.1 — Identity Broker, Log Management and Real-time Metrics (Day-N) IPs are all allocated from the Services Runtime block; may push it from /28 to /27
  if(project.vcfVersion==='9.1'&&mgmt.vcfOperationsForLogs.enabled) msgs.push(mkMsg('info','vlan',domain,t('val.svcruntime_27_info'),t('val.svcruntime_27_res')));
  // 9.1 — VCF Automation /29 block is a separate allocation from the Services Runtime block
  if(project.vcfVersion==='9.1'&&mgmt.vcfAutomation.enabled) msgs.push(mkMsg('info','vlan',domain,t('val.auto_block_info'),t('val.auto_block_res')));
  if(mgmt.vcfAutomation.enabled&&!mgmt.vcfIdentityBroker.enabled) msgs.push(mkMsg('warning','scenario',domain,'VCF Automation enabled but VCF Identity Broker not configured.','Enable VCF Identity Broker.'));
  const bringUpReady=mgmt.hostCount>=3&&mgmt.layer2AdjacencyConfirmed&&mgmt.tepInterfacesPerHost>=2;
  msgs.push(bringUpReady?mkMsg('info','bring-up',domain,'Bring-up readiness check PASSED.'):mkMsg('blocker','bring-up',domain,'Bring-up readiness check FAILED.','Address all blockers before VCF Cloud Builder.'));

  workloads.forEach((wld,idx)=>{
    const d=wld.domainName||`Workload ${idx+1}`;
    if(!wld.domainName||!wld.domainName.trim()) msgs.push(mkMsg('blocker','vlan',d,`Workload Domain ${idx+1} has no name.`,'Set a domain name.'));
    if(wld.hostCount<3) msgs.push(mkMsg('warning','bring-up',d,`"${d}" has only ${wld.hostCount} hosts. Min 3 recommended.`,'Add another host.'));
    if(wld.edgeRequired&&!wld.nsxEnabled) msgs.push(mkMsg('blocker','nsx',d,`"${d}": Edge required but NSX not enabled.`,'Enable NSX.'));
    if(wld.vksEnabled&&!wld.nsxEnabled) msgs.push(mkMsg('blocker','scenario',d,`"${d}": VKS enabled but NSX not enabled.`,'Enable NSX.'));
    if(wld.edgeRequired&&wld.edgeNodeCount<2) msgs.push(mkMsg('warning','nsx',d,`"${d}": only 1 Edge node. Min 2 recommended.`,'Increase Edge count.'));
    if(wld.tepInterfacesPerHost<2) msgs.push(mkMsg('warning','nsx',d,`"${d}": TEP < 2 per host.`,'Set TEP to 2+.'));
    if(wld.topologyMode==='vsan-stretched') msgs.push(mkMsg('warning','bring-up',d,t('val.vsan_warn'),t('val.vsan_warn_res')));
    if(wld.topologyMode==='stretched') msgs.push(mkMsg('warning','bring-up',d,'Stretched topology (vMSC): ensure all VLANs are extended across all sites.','Verify VLAN extension.'));
    if(wld.topologyMode==='vsan-stretched'||wld.topologyMode==='stretched'){
      if(wld.az1HostCount<1||wld.az2HostCount<1) msgs.push(mkMsg('blocker','bring-up',d,`"${d}": each Availability Zone must have at least 1 host.`,'Set AZ1/AZ2 host counts to 1 or more.'));
      else if(wld.az1HostCount!==wld.az2HostCount) msgs.push(mkMsg('blocker','bring-up',d,`"${d}": AZ1 (${wld.az1HostCount}) and AZ2 (${wld.az2HostCount}) host counts differ. vSAN Stretched Cluster requires equal host counts per site for proper failover.`,'Set AZ1 host count equal to AZ2 host count.'));
      const perSite=wld.az1HostCount;
      const tier=perSite<=10?'<200ms RTT':perSite<=15?'<100ms RTT':'exceeds the documented 15-host/site tier';
      msgs.push(mkMsg('info','bring-up',d,`"${d}": Witness latency tier for ${perSite} hosts/site: ${tier} required between each AZ and the vSAN Witness (min 10 Gbps between AZ1 and AZ2).`,'Confirm the WAN/L3 link to the Witness meets this RTT.'));
    }
  });

  const domains=[...new Set(vlans.map(v=>v.domain))];
  domains.forEach(dom=>{
    const dv=vlans.filter(v=>v.domain===dom);
    const e1=dv.some(v=>v.vlanType==='nsx-edge-uplink1'),e2=dv.some(v=>v.vlanType==='nsx-edge-uplink2');
    if(e1&&!e2) msgs.push(mkMsg('blocker','vlan',dom,`"${dom}": Edge Uplink 1 present but Uplink 2 missing.`,'Both uplinks are mandatory.'));
    if(e2&&!e1) msgs.push(mkMsg('blocker','vlan',dom,`"${dom}": Edge Uplink 2 present but Uplink 1 missing.`,'Both uplinks are mandatory.'));
  });

  if(project.scenario==='private-ai'){
    if(!workloads.some(w=>w.domainRole==='ai-workloads')) msgs.push(mkMsg('warning','scenario','Global','Scenario is "Private AI" but no WLD has role "AI Workloads".','Set at least one WLD to AI Workloads.'));
    if(!mgmt.nsxEdgeDeployed) msgs.push(mkMsg('warning','scenario','Management Domain','Private AI scenario typically requires NSX Edge.','Consider enabling NSX Edge.'));
  }
  if(project.scenario==='vcf-automation-vks'&&!workloads.some(w=>w.vksEnabled)&&!mgmt.vksEnabled) msgs.push(mkMsg('warning','scenario','Global','Scenario is "VCF Automation + VKS" but VKS not enabled in any domain.','Enable VKS in at least one domain.'));
  if(project.scenario==='consolidated-3node-vsan-esa'){
    if(mgmt.hostCount!==3) msgs.push(mkMsg('info','scenario','Management Domain',`Scenario "Consolidated / 3-Node vSAN ESA" typically uses exactly 3 hosts (current: ${mgmt.hostCount}).`,'Set Management Domain host count to 3, or switch scenario.'));
    if(mgmt.storageType!=='vsan-esa') msgs.push(mkMsg('warning','scenario','Management Domain','Scenario "Consolidated / 3-Node vSAN ESA" expects vSAN ESA storage.','Set Storage Type to vSAN ESA.'));
    if(workloads.length>0) msgs.push(mkMsg('info','scenario','Global','Consolidated Architecture: Workload Domain(s) typically run as resource pools on the shared 3-host Management cluster rather than separate clusters.','Refer to VCF 9.1 Consolidated Architecture design guidance.'));
  }
  if(!project.projectName.trim()) msgs.push(mkMsg('info','scenario','Global','Project name is not set.','Enter project name.'));

  return msgs;
}
