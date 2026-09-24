// Pure validation engine: runs design-rule checks across project/domain/VLAN state and returns structured messages.

import { ipInCidr, rangeSize } from './iprange.js?v=1.26.0';
import { isVcf91Plus, isStretchedTopology, hasVsanWitness, effectiveHostCount } from './data.js?v=1.26.0';

// ── VALIDATION ENGINE ────────────────────────────────────────────
let _valId=0;
export function mkMsg(severity,category,domain,message,resolution){return {id:`val-${++_valId}`,severity,category,domain,message,resolution};}

// Anti-regression safety net: flags any appliance whose `vlan` name doesn't match any generated VLAN row.
// Domain-agnostic by design, mirroring the fallback in getVLANPrefix (core/vlan.js): matches on vlanName only,
// NOT on (domain, vlanName) — many Workload Domain appliances legitimately reference 'Management VM Network'
// (a Management Domain row) while their own appliance.domain is the WLD name. Matching by domain too would
// generate massive false positives on any install with Workload Domains.
export function findOrphanApplianceVlans(vlans,appliances){
  const vlanNames=new Set(vlans.map(v=>v.vlanName));
  return appliances.filter(a=>a.vlan&&!vlanNames.has(a.vlan));
}

// AZ host-count rules shared by the Management and Workload Domains. Equal AZ1/AZ2 host counts and the Witness
// latency tiers are vSAN stretched cluster requirements; a vMSC (non-vSAN array) has no vSAN Witness and symmetry
// is only a failover-capacity recommendation there, so it is downgraded to a warning (KB 417356).
function stretchedHostChecks(msgs,d,label,dom){
  const az1=Number(dom.az1HostCount)||0, az2=Number(dom.az2HostCount)||0;
  const vsan=hasVsanWitness(dom.topologyMode);
  if(az1<1||az2<1) msgs.push(mkMsg('blocker','bring-up',d,label?`${label}each Availability Zone must have at least 1 host.`:'Each Availability Zone must have at least 1 host.','Set AZ1/AZ2 host counts to 1 or more.'));
  else if(az1!==az2){
    if(vsan) msgs.push(mkMsg('blocker','bring-up',d,`${label}AZ1 (${az1}) and AZ2 (${az2}) host counts differ. vSAN Stretched Cluster requires equal host counts per site for proper failover.`,'Set AZ1 host count equal to AZ2 host count.'));
    else msgs.push(mkMsg('warning','bring-up',d,`${label}AZ1 (${az1}) and AZ2 (${az2}) host counts differ. In a vMSC, each AZ must be able to restart the other AZ's workloads after a site failure.`,'Size each AZ for full failover capacity, or set equal host counts.'));
  }
  if(vsan){
    const tier=az1<=10?'<200ms RTT':az1<=15?'<100ms RTT':'exceeds the documented 15-host/site tier';
    msgs.push(mkMsg('info','bring-up',d,`${label}Witness latency tier for ${az1} hosts/site: ${tier} required between each AZ and the vSAN Witness (min 10 Gbps between AZ1 and AZ2).`,'Confirm the WAN/L3 link to the Witness meets this RTT.'));
  }
}

// `appliances` added as the last parameter (kept optional/defaulted to [] so existing single caller doesn't break
// if it's ever omitted) — needed to count appliances per VLAN block for the IP-range rules below.
export function runValidation(project,mgmt,workloads,vlans,t=k=>k,appliances=[]){
  _valId=0;
  const msgs=[];
  const domain='Management Domain';
  const is91=isVcf91Plus(project.vcfVersion);
  const mgmtHosts=effectiveHostCount(mgmt);
  // NFS/VMFS storage supports a 2-host "Simple" deployment model per Broadcom TechDocs VCF 9.1
  // (Single-Rack vSphere Cluster Model); vSAN ESA/OSA still requires the 3-host technical minimum.
  const mgmtMinHosts=(mgmt.storageType==='nfs'||mgmt.storageType==='vmfs')?2:3;
  if(mgmtHosts<mgmtMinHosts) msgs.push(mkMsg('blocker','bring-up',domain,`Management Domain has ${mgmtHosts} hosts. Minimum ${mgmtMinHosts} required (${mgmtMinHosts===2?'NFS/VMFS "Simple" deployment minimum':'vSAN ESA/OSA cluster technical minimum'}).`,`Add hosts to reach at least ${mgmtMinHosts}${mgmtMinHosts===3?' (vSAN minimum) or 4 (recommended)':''}.`));
  else if(mgmtHosts===3&&(mgmt.storageType==='vsan-esa'||mgmt.storageType==='vsan-osa')){
    if(project.scenario==='consolidated-3node-vsan-esa') msgs.push(mkMsg('info','bring-up',domain,'3-host vSAN cluster meets the documented Consolidated Architecture / VCF Edge minimum (Broadcom TechDocs VCF 9.1).','No action required — 4 hosts recommended for N+1 resilience if scaling later.'));
    else msgs.push(mkMsg('warning','bring-up',domain,'Management Domain has 3 hosts — meets the vSAN technical minimum but 4 hosts is the standard recommended baseline for N+1 resilience.','Consider adding a 4th host, or select the "Consolidated / 3-Node vSAN ESA" scenario if 3 hosts is intentional.'));
  }
  if(mgmt.nsxEdgeDeployed&&mgmt.nsxEdgeNodeCount<2) msgs.push(mkMsg('warning','nsx',domain,'Single NSX Edge node — no HA. Recommend 2+ Edge nodes.','Increase Edge node count to 2.'));
  if(!mgmt.fleetPlacement) msgs.push(mkMsg('blocker','vlan',domain,'Fleet placement is undefined.','Select Fleet placement.'));
  if(mgmt.topologyMode==='vsan-stretched'){
    msgs.push(mkMsg('warning','bring-up',domain,t('val.vsan_warn'),t('val.vsan_warn_res')));
  }
  if(mgmt.topologyMode==='stretched') msgs.push(mkMsg('warning','bring-up',domain,t('val.vmsc_l2_warn'),t('val.vmsc_l2_res')));
  if(isStretchedTopology(mgmt.topologyMode)) stretchedHostChecks(msgs,domain,'',mgmt);
  if(mgmt.fleetPlacement==='nsx-overlay-segment'&&!mgmt.nsxEdgeDeployed) msgs.push(mkMsg('blocker','nsx',domain,t('val.overlay_block'),t('val.overlay_res')));
  // Model 4 (Dedicated VLAN + NSX Stretched Overlay Segment): fleetPlacement==='nsx-overlay-segment' combined with
  // a stretched topologyMode. The dedicated VLAN (Fleet/Instance/Services Runtime/Identity Broker, Day-0) must be
  // physically stretched at L2 between AZ1/AZ2 — this is independent of NSX Federation, which only covers the
  // overlay segment. See core/vlan.js for the AZ1/AZ2 dedicated-VLAN row duplication in this mode.
  const isModel4=mgmt.fleetPlacement==='nsx-overlay-segment'&&(mgmt.topologyMode==='vsan-stretched'||mgmt.topologyMode==='stretched');
  if(isModel4){
    msgs.push(mkMsg('info','vlan',domain,t('val.stretched_l2_info'),t('val.stretched_l2_res')));
    msgs.push(mkMsg('info','vlan',domain,t('val.overlay_federation_info')));
  }
  // "NSX VLAN Segment" is not one of the 4 officially documented VCF 9.1 network models — kept only for backward
  // compatibility with existing 9.1 projects that already selected it before the option was removed from the select.
  if(is91&&mgmt.fleetPlacement==='nsx-vlan-segment') msgs.push(mkMsg('warning','vlan',domain,t('val.legacy_nsxvlan_warn'),t('val.legacy_nsxvlan_warn_res')));
  // Legacy JSON safety net: these 5 per-component "dedicated VLAN" flags have no UI checkbox and no effect under
  // dedicated-fleet-vlan / shared-mgmt-vlan (no such option is documented by Broadcom for these models — see
  // core/vlan.js comments, VCF-MGMT-DV-NET-REQD-001). A project imported from before this flag was locked down (or
  // hand-edited JSON) may still carry one set to true; the app still honors it (still generates a separate VLAN row)
  // for backward compatibility, so this is informational only, not a blocker.
  if(mgmt.fleetPlacement==='dedicated-fleet-vlan'||mgmt.fleetPlacement==='shared-mgmt-vlan'){
    const legacyFlags=[
      ['VCF Operations',mgmt.vcfOperations.requiresDedicatedVLAN],
      ['VCF Operations for Logs',mgmt.vcfOperationsForLogs.requiresDedicatedVLAN],
      ['VCF Operations for Networks',mgmt.vcfOperationsForNetworks.requiresDedicatedVLAN],
      ['VCF Automation',mgmt.vcfAutomation.requiresDedicatedVLAN],
      ['VCF Identity Broker',mgmt.vcfIdentityBroker.requiresDedicatedVLAN],
    ].filter(([,v])=>v).map(([n])=>n);
    if(legacyFlags.length) msgs.push(mkMsg('info','vlan',domain,t('val.legacy_dedicated_vlan_flags',{components:legacyFlags.join(', ')}),t('val.legacy_dedicated_vlan_flags_res')));
  }
  if((mgmt.vksEnabled||project.scenario==='vcf-automation-vks')&&!mgmt.nsxEdgeDeployed) msgs.push(mkMsg('warning','scenario',domain,'VKS enabled but NSX Edge not deployed.','Deploy NSX Edge or confirm overlay from WLD NSX.'));
  if(mgmt.vksEnabled&&(!mgmt.vksVPCs||mgmt.vksVPCs.length===0)) msgs.push(mkMsg('info','vlan',domain,t('val.vks_no_vpc'),t('val.vks_no_vpc_res')));
  if(mgmt.vksEnabled&&mgmt.vksLBType==='avi'&&!mgmt.aviDeployed) msgs.push(mkMsg('warning','scenario',domain,t('val.vks_avi_mismatch'),t('val.vks_avi_mismatch_res')));
  if(mgmt.aviDeployed&&!mgmt.nsxEdgeDeployed) msgs.push(mkMsg('info','scenario',domain,'AVI enabled but NSX Edge not deployed. Verify data plane connectivity.','Verify AVI SE network design.'));
  if(mgmt.tepInterfacesPerHost<2) msgs.push(mkMsg('warning','nsx',domain,'TEP interfaces per host < 2. Recommend 2 for TEP HA.','Set TEP to 2+.'));
  if(!is91&&mgmt.vcfOperations.enabled&&mgmt.vcfOperations.mode==='enterprise'&&mgmt.vcfOperations.remoteCollectorCount===0) msgs.push(mkMsg('info','scenario',domain,t('val.ops_no_collectors'),t('val.ops_no_collectors_res')));
  // 9.0 only: 9.1+ Log Management is a VCF services runtime service (no master/worker nodes, no ILB toggle).
  if(!is91&&mgmt.vcfOperationsForLogs.enabled&&mgmt.vcfOperationsForLogs.mode==='clustered'&&!mgmt.vcfOperationsForLogs.integratedLBVIP) msgs.push(mkMsg('warning','vip',domain,'VCF Ops for Logs clustered but ILB VIP disabled. Log sources cannot use a single syslog endpoint.','Enable ILB VIP.'));
  if(!is91&&mgmt.vcfOperationsForLogs.enabled&&mgmt.vcfOperationsForLogs.mode==='clustered'&&mgmt.vcfOperationsForLogs.workerCount<2) msgs.push(mkMsg('warning','scenario',domain,`VCF Ops for Logs: only ${mgmt.vcfOperationsForLogs.workerCount} worker(s). Min 2 recommended.`,'Set worker count ≥ 2.'));
  // 9.1 — Identity Broker, Log Management and Real-time Metrics (Day-N) IPs are all allocated from the Services Runtime block; may push it from /28 to /27
  if(is91&&mgmt.vcfOperationsForLogs.enabled&&!mgmt.svcRuntimeReserve30) msgs.push(mkMsg('info','vlan',domain,t('val.svcruntime_27_info'),t('val.svcruntime_27_res')));
  // 9.1 — VCF Automation /29 block is a separate allocation from the Services Runtime block
  if(is91&&mgmt.vcfAutomation.enabled) msgs.push(mkMsg('info','vlan',domain,t('val.auto_block_info'),t('val.auto_block_res')));
  if(mgmt.vcfAutomation.enabled&&!mgmt.vcfIdentityBroker.enabled) msgs.push(mkMsg('warning','scenario',domain,'VCF Automation enabled but VCF Identity Broker not configured.','Enable VCF Identity Broker.'));
  const bringUpReady=mgmtHosts>=mgmtMinHosts&&mgmt.tepInterfacesPerHost>=2;
  msgs.push(bringUpReady?mkMsg('info','bring-up',domain,'Bring-up readiness check PASSED.'):mkMsg('blocker','bring-up',domain,'Bring-up readiness check FAILED.','Address all blockers before VCF Cloud Builder.'));

  workloads.forEach((wld,idx)=>{
    const d=wld.domainName||`Workload ${idx+1}`;
    if(!wld.domainName||!wld.domainName.trim()) msgs.push(mkMsg('blocker','vlan',d,`Workload Domain ${idx+1} has no name.`,'Set a domain name.'));
    const wldHosts=effectiveHostCount(wld);
    if(wldHosts<3) msgs.push(mkMsg('warning','bring-up',d,`"${d}" has only ${wldHosts} hosts. Min 3 recommended.`,'Add another host.'));
    if(wld.edgeRequired&&!wld.nsxEnabled) msgs.push(mkMsg('blocker','nsx',d,`"${d}": Edge required but NSX not enabled.`,'Enable NSX.'));
    if(wld.vksEnabled&&!wld.nsxEnabled) msgs.push(mkMsg('blocker','scenario',d,`"${d}": VKS enabled but NSX not enabled.`,'Enable NSX.'));
    if(wld.vksEnabled&&(!wld.vksVPCs||wld.vksVPCs.length===0)) msgs.push(mkMsg('info','vlan',d,t('val.vks_no_vpc'),t('val.vks_no_vpc_res')));
    if(wld.vksEnabled&&wld.vksLBType==='avi'&&!wld.aviEnabled) msgs.push(mkMsg('warning','scenario',d,t('val.vks_avi_mismatch'),t('val.vks_avi_mismatch_res')));
    if(wld.edgeRequired&&wld.edgeNodeCount<2) msgs.push(mkMsg('warning','nsx',d,`"${d}": only 1 Edge node. Min 2 recommended.`,'Increase Edge count.'));
    if(wld.tepInterfacesPerHost<2) msgs.push(mkMsg('warning','nsx',d,`"${d}": TEP < 2 per host.`,'Set TEP to 2+.'));
    if(wld.topologyMode==='vsan-stretched') msgs.push(mkMsg('warning','bring-up',d,t('val.vsan_warn'),t('val.vsan_warn_res')));
    if(wld.topologyMode==='stretched') msgs.push(mkMsg('warning','bring-up',d,`"${d}": ${t('val.vmsc_l2_warn')}`,t('val.vmsc_l2_res')));
    if(isStretchedTopology(wld.topologyMode)) stretchedHostChecks(msgs,d,`"${d}": `,wld);
  });

  const domains=[...new Set(vlans.map(v=>v.domain))];
  domains.forEach(dom=>{
    const dv=vlans.filter(v=>v.domain===dom);
    const e1=dv.some(v=>v.vlanType==='nsx-edge-uplink1'),e2=dv.some(v=>v.vlanType==='nsx-edge-uplink2');
    if(e1&&!e2) msgs.push(mkMsg('blocker','vlan',dom,`"${dom}": Edge Uplink 1 present but Uplink 2 missing.`,'Both uplinks are mandatory.'));
    if(e2&&!e1) msgs.push(mkMsg('blocker','vlan',dom,`"${dom}": Edge Uplink 2 present but Uplink 1 missing.`,'Both uplinks are mandatory.'));
  });

  // C6: IP range (rangeStart/rangeEnd) rules — Chantier C, Auto-fill feature. Non-blocking: this app has no blocking
  // rule on free-form appliance IP entry today, so these stay warning/info regardless of the range/CIDR mismatch.
  vlans.forEach(v=>{
    if(!v.rangeStart) return;
    if(v.cidr&&ipInCidr(v.rangeStart,v.cidr)===false) msgs.push(mkMsg('warning','vlan',v.domain,t('val.range_outside_cidr',{vlan:v.vlanName,range:v.rangeStart,cidr:v.cidr}),t('val.range_outside_cidr_res')));
    if(v.rangeEnd){
      if(v.cidr&&ipInCidr(v.rangeEnd,v.cidr)===false) msgs.push(mkMsg('warning','vlan',v.domain,t('val.rangeend_outside_cidr',{vlan:v.vlanName,range:v.rangeEnd,cidr:v.cidr}),t('val.range_outside_cidr_res')));
      const size=rangeSize(v.rangeStart,v.rangeEnd);
      if(size===0) msgs.push(mkMsg('warning','vlan',v.domain,t('val.range_end_before_start',{vlan:v.vlanName}),t('val.range_end_before_start_res')));
      else if(size<v.requiredIPs) msgs.push(mkMsg('info','vlan',v.domain,t('val.range_too_small',{vlan:v.vlanName,size,need:v.requiredIPs}),t('val.range_too_small_res')));
    }
    const need=appliances.filter(a=>a.domain===v.domain&&a.vlan===v.vlanName&&a.staticIPRequired===true).length;
    if(need>v.requiredIPs) msgs.push(mkMsg('info','vlan',v.domain,t('val.range_insufficient',{vlan:v.vlanName,need,available:v.requiredIPs}),t('val.range_insufficient_res')));
  });

  // Anti-regression: appliances referencing a VLAN name absent from any generated VLAN row (see findOrphanApplianceVlans
  // above). Grouped by (domain, vlan) to avoid flooding the list when several appliances of the same block point to
  // the same missing VLAN.
  const orphanAppliances=findOrphanApplianceVlans(vlans,appliances);
  const orphanGroups=new Map();
  orphanAppliances.forEach(a=>{
    const key=`${a.domain}\u0000${a.vlan}`;
    if(!orphanGroups.has(key))orphanGroups.set(key,{domain:a.domain,vlan:a.vlan,count:0});
    orphanGroups.get(key).count++;
  });
  orphanGroups.forEach(({domain:d,vlan,count})=>{
    msgs.push(mkMsg('warning','vlan',d,t('val.orphan_vlan',{vlan,count}),t('val.orphan_vlan_res')));
  });

  if(project.scenario==='private-ai'){
    if(!workloads.some(w=>w.domainRole==='ai-workloads')) msgs.push(mkMsg('warning','scenario','Global','Scenario is "Private AI" but no WLD has role "AI Workloads".','Set at least one WLD to AI Workloads.'));
    if(!mgmt.nsxEdgeDeployed) msgs.push(mkMsg('warning','scenario','Management Domain','Private AI scenario typically requires NSX Edge.','Consider enabling NSX Edge.'));
  }
  if(project.scenario==='vcf-automation-vks'&&!workloads.some(w=>w.vksEnabled)&&!mgmt.vksEnabled) msgs.push(mkMsg('warning','scenario','Global','Scenario is "VCF Automation + VKS" but VKS not enabled in any domain.','Enable VKS in at least one domain.'));
  if(project.scenario==='consolidated-3node-vsan-esa'){
    if(mgmtHosts!==3) msgs.push(mkMsg('info','scenario','Management Domain',`Scenario "Consolidated / 3-Node vSAN ESA" typically uses exactly 3 hosts (current: ${mgmtHosts}).`,'Set Management Domain host count to 3, or switch scenario.'));
    if(mgmt.storageType!=='vsan-esa') msgs.push(mkMsg('warning','scenario','Management Domain','Scenario "Consolidated / 3-Node vSAN ESA" expects vSAN ESA storage.','Set Storage Type to vSAN ESA.'));
    if(workloads.length>0) msgs.push(mkMsg('info','scenario','Global','Consolidated Architecture: Workload Domain(s) typically run as resource pools on the shared 3-host Management cluster rather than separate clusters.','Refer to VCF 9.1 Consolidated Architecture design guidance.'));
  }
  if(!project.projectName.trim()) msgs.push(mkMsg('info','scenario','Global','Project name is not set.','Enter project name.'));

  return msgs;
}
