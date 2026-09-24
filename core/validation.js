// Pure validation engine: runs design-rule checks across project/domain/VLAN state and returns structured messages.

import { ipInCidr, rangeSize, ipToInt, ipInRange, rangesOverlap, parseCidr, cidrsOverlap, gatewayIP } from './iprange.js?v=1.29.0';
import { buildMgmtServicesPlan, SVC_RUNTIME_MIN_IPS } from './mgmtservices.js?v=1.29.0';
import { isVcf91Plus, isStretchedTopology, hasVsanWitness, effectiveHostCount } from './data.js?v=1.29.0';

// ── VALIDATION ENGINE ────────────────────────────────────────────
let _valId=0;
// ref (optional): {tab, key} — lets the Validation tab jump to the offending row (data-ref="key" in index.html).
export function mkMsg(severity,category,domain,message,resolution,ref=null){return {id:`val-${++_valId}`,severity,category,domain,message,resolution,ref};}

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

// Every full IP planned in the project (appliances, VIPs, ESXi hosts) with where to find it.
function plannedIPs(appliances,vips,hosts){
  return [
    ...appliances.map(a=>({name:a.applianceName,ip:(a.ipAddress||'').trim(),domain:a.domain,vlan:a.vlan,ref:{tab:'appliances',key:`app:${a.applianceName}`}})),
    ...vips.map(v=>({name:v.vipName,ip:(v.ipAddress||'').trim(),domain:v.domain,vlan:v.vlan,ref:{tab:'vips',key:`vip:${v.vipName}`}})),
    ...hosts.map(h=>({name:h.hostName,ip:(h.ipAddress||'').trim(),domain:h.domain,vlan:h.vlan,ref:{tab:'hosts',key:`host:${h.id}`}})),
  ].filter(x=>ipToInt(x.ip)!==null);
}

// IP plan consistency: duplicate IPs, IPs outside their VLAN CIDR or on its network/broadcast/gateway address,
// malformed or out-of-subnet gateways, overlapping VLAN CIDRs and reused VLAN IDs within a domain. VLANs of a
// Workload Domain with shared VLANs (scope 'shared') legitimately reuse Management values and are skipped.
function ipPlanChecks(msgs,vlans,appliances,vips,hosts,t){
  const planned=plannedIPs(appliances,vips,hosts);
  const byIp=new Map();
  planned.forEach(x=>{ if(!byIp.has(x.ip))byIp.set(x.ip,[]); byIp.get(x.ip).push(x); });
  byIp.forEach((list,ip)=>{ if(list.length>1) msgs.push(mkMsg('blocker','vlan',list[0].domain,t('val.ip_duplicate',{ip,names:list.map(x=>x.name).join(', ')}),t('val.ip_duplicate_res'),list[0].ref)); });
  const vlanOf=x=>vlans.find(v=>v.domain===x.domain&&v.vlanName===x.vlan)||vlans.find(v=>v.vlanName===x.vlan);
  planned.forEach(x=>{
    const v=vlanOf(x); const c=parseCidr(v?.cidr); if(!c)return;
    const n=ipToInt(x.ip);
    if(n<c.network||n>c.broadcast) msgs.push(mkMsg('warning','vlan',x.domain,t('val.ip_outside_cidr',{name:x.name,ip:x.ip,vlan:v.vlanName,cidr:v.cidr}),t('val.ip_outside_cidr_res'),x.ref));
    else if(c.prefix<=30&&(n===c.network||n===c.broadcast)) msgs.push(mkMsg('blocker','vlan',x.domain,t('val.ip_edge',{name:x.name,ip:x.ip,cidr:v.cidr}),t('val.ip_outside_cidr_res'),x.ref));
    else if(gatewayIP(v.gateway)===x.ip) msgs.push(mkMsg('blocker','vlan',x.domain,t('val.ip_is_gateway',{name:x.name,ip:x.ip,vlan:v.vlanName}),t('val.ip_outside_cidr_res'),x.ref));
  });
  const vref=v=>({tab:'vlans',key:`vlan:${v.domain}|${v.vlanName}`});
  vlans.forEach(v=>{
    const g=(v.gateway||'').trim(); if(!g)return;
    if(!gatewayIP(g)) msgs.push(mkMsg('warning','vlan',v.domain,t('val.gw_invalid',{vlan:v.vlanName,gw:g}),t('val.gw_res'),vref(v)));
    else if(v.cidr&&ipInCidr(gatewayIP(g),v.cidr)===false) msgs.push(mkMsg('warning','vlan',v.domain,t('val.gw_outside',{vlan:v.vlanName,gw:g,cidr:v.cidr}),t('val.gw_res'),vref(v)));
  });
  const base=v=>v.vlanName.replace(/ — AZ[12]$/,'');
  const own=vlans.filter(v=>v.scope!=='shared');
  for(let i=0;i<own.length;i++) for(let j=i+1;j<own.length;j++){
    const a=own[i], b=own[j];
    const azPair=a.domain===b.domain&&a.az&&b.az&&base(a)===base(b);
    if(!azPair&&a.cidr&&b.cidr&&cidrsOverlap(a.cidr,b.cidr)) msgs.push(mkMsg('warning','vlan',a.domain,t('val.cidr_overlap',{a:`${a.domain} / ${a.vlanName}`,b:`${b.domain} / ${b.vlanName}`}),t('val.cidr_overlap_res'),vref(b)));
    if(!azPair&&a.domain===b.domain&&a.vlanId&&String(a.vlanId).trim()===String(b.vlanId).trim()&&a.vlanType!=='overlay'&&b.vlanType!=='overlay') msgs.push(mkMsg('warning','vlan',a.domain,t('val.vlanid_dup',{id:a.vlanId,a:a.vlanName,b:b.vlanName}),t('val.vlanid_dup_res'),vref(b)));
  }
}

// Stretched topology vs principal storage: a vSAN stretched cluster needs vSAN storage; a vMSC is the non-vSAN option.
function topologyStorageChecks(msgs,d,label,dom,t){
  const vsan=dom.storageType==='vsan-esa'||dom.storageType==='vsan-osa';
  if(dom.topologyMode==='vsan-stretched'&&!vsan) msgs.push(mkMsg('blocker','bring-up',d,`${label}${t('val.topo_vsan_storage')}`,t('val.topo_vsan_storage_res')));
  if(dom.topologyMode==='stretched'&&vsan) msgs.push(mkMsg('warning','bring-up',d,`${label}${t('val.topo_vmsc_storage')}`,t('val.topo_vmsc_storage_res')));
}

// VCF 9.1+ Management Services ranges (core/mgmtservices.js): services runtime node pool and VCF Automation node
// range — size, placement in the network CIDR, overlap, and no appliance/VIP IP inside either range.
function mgmtServicesChecks(msgs,domain,plan,vlans,appliances,vips,t,hosts=[]){
  const MS={tab:'management',key:'ms-ranges'};
  if(!plan)return;
  const cidrOf=appName=>{
    const app=appliances.find(a=>a.applianceName===appName);
    return app?(vlans.find(v=>v.domain===domain&&v.vlanName===app.vlan)?.cidr||''):'';
  };
  const {pool,vcfa}=plan;
  if(pool.required>SVC_RUNTIME_MIN_IPS) msgs.push(mkMsg('info','vlan',domain,t('val.ms_pool_sized',{required:pool.required,size:pool.size}),t('val.ms_pool_sized_res'),MS));
  const ranges=[];
  if(!pool.start&&!pool.end) msgs.push(mkMsg('info','vlan',domain,t('val.ms_range_missing',{size:pool.size}),t('val.ms_range_missing_res'),MS));
  else if(pool.rangeSize===0) msgs.push(mkMsg('warning','vlan',domain,t('val.ms_range_invalid'),t('val.ms_range_invalid_res'),MS));
  else{
    ranges.push({label:t('ms.pool_label'),start:pool.start,end:pool.end});
    if(pool.rangeSize<SVC_RUNTIME_MIN_IPS) msgs.push(mkMsg('blocker','vlan',domain,t('val.ms_range_min',{size:pool.rangeSize}),t('val.ms_range_min_res'),MS));
    else if(pool.rangeSize<pool.required) msgs.push(mkMsg('warning','vlan',domain,t('val.ms_range_small',{size:pool.rangeSize,required:pool.required}),t('val.ms_pool_sized_res'),MS));
    const cidr=cidrOf('fleet-01');
    if(cidr&&(ipInCidr(pool.start,cidr)===false||ipInCidr(pool.end,cidr)===false)) msgs.push(mkMsg('warning','vlan',domain,t('val.ms_range_outside',{range:t('ms.pool_label'),cidr}),t('val.ms_range_outside_res'),MS));
  }
  if(vcfa.enabled){
    if(!vcfa.start&&!vcfa.end) msgs.push(mkMsg('info','vlan',domain,t('val.vcfa_range_missing'),t('val.ms_range_missing_res'),MS));
    else if(vcfa.rangeSize===0) msgs.push(mkMsg('warning','vlan',domain,t('val.ms_range_invalid'),t('val.ms_range_invalid_res'),MS));
    else{
      ranges.push({label:t('ms.vcfa_label'),start:vcfa.start,end:vcfa.end});
      if(vcfa.rangeSize<vcfa.required) msgs.push(mkMsg('warning','vlan',domain,t('val.vcfa_range_small',{size:vcfa.rangeSize}),t('val.vcfa_range_small_res'),MS));
      const cidr=cidrOf('vcf-automation-01');
      if(cidr&&(ipInCidr(vcfa.start,cidr)===false||ipInCidr(vcfa.end,cidr)===false)) msgs.push(mkMsg('warning','vlan',domain,t('val.ms_range_outside',{range:t('ms.vcfa_label'),cidr}),t('val.ms_range_outside_res'),MS));
      if(pool.rangeSize>0&&rangesOverlap(pool.start,pool.end,vcfa.start,vcfa.end)) msgs.push(mkMsg('blocker','vlan',domain,t('val.ms_ranges_overlap'),t('val.ms_ranges_overlap_res'),MS));
    }
  }
  // "Each FQDN must resolve to a unique, currently unassigned IP address [...] must not overlap with any IP ranges
  // already reserved for VCF services runtime nodes or VCF Automation nodes." — applies to every planned IP.
  plannedIPs(appliances,vips,hosts)
    .forEach(x=>ranges.forEach(r=>{
      if(ipInRange(x.ip,r.start,r.end)) msgs.push(mkMsg('blocker','vlan',domain,t('val.ms_ip_in_range',{name:x.name,ip:x.ip,range:r.label}),t('val.ms_ip_in_range_res'),x.ref));
    }));
}

// `appliances` added as the last parameter (kept optional/defaulted to [] so existing single caller doesn't break
// if it's ever omitted) — needed to count appliances per VLAN block for the IP-range rules below.
export function runValidation(project,mgmt,workloads,vlans,t=k=>k,appliances=[],vips=[],hosts=[]){
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
  topologyStorageChecks(msgs,domain,'',mgmt,t);
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
  if(is91) mgmtServicesChecks(msgs,domain,buildMgmtServicesPlan(mgmt,project),vlans,appliances,vips,t,hosts);
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
    topologyStorageChecks(msgs,d,`"${d}": `,wld,t);
    // TechDocs 9.1 (Stretching Clusters): the default management domain cluster must be stretched first.
    if(isStretchedTopology(wld.topologyMode)&&!isStretchedTopology(mgmt.topologyMode)) msgs.push(mkMsg('blocker','bring-up',d,`"${d}": ${t('val.wld_stretch_first')}`,t('val.wld_stretch_first_res')));
  });

  ipPlanChecks(msgs,vlans,appliances,vips,hosts,t);

  // Per-AZ networks (not stretched) need a distinct subnet on each AZ — the VLAN ID may be the same (Broadcom 9.1).
  vlans.filter(v=>v.az==='AZ1'&&v.cidr).forEach(v1=>{
    const base=v1.vlanName.replace(/ — AZ1$/,'');
    const v2=vlans.find(v=>v.domain===v1.domain&&v.vlanName===`${base} — AZ2`);
    if(v2&&v2.cidr.trim()===v1.cidr.trim()) msgs.push(mkMsg('warning','vlan',v1.domain,t('val.az_same_cidr',{vlan:base,cidr:v1.cidr}),t('val.az_same_cidr_res'),{tab:'vlans',key:`vlan:${v2.domain}|${v2.vlanName}`}));
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
    if(v.cidr&&ipInCidr(v.rangeStart,v.cidr)===false) msgs.push(mkMsg('warning','vlan',v.domain,t('val.range_outside_cidr',{vlan:v.vlanName,range:v.rangeStart,cidr:v.cidr}),t('val.range_outside_cidr_res'),{tab:'vlans',key:`vlan:${v.domain}|${v.vlanName}`}));
    if(v.rangeEnd){
      if(v.cidr&&ipInCidr(v.rangeEnd,v.cidr)===false) msgs.push(mkMsg('warning','vlan',v.domain,t('val.rangeend_outside_cidr',{vlan:v.vlanName,range:v.rangeEnd,cidr:v.cidr}),t('val.range_outside_cidr_res'),{tab:'vlans',key:`vlan:${v.domain}|${v.vlanName}`}));
      const size=rangeSize(v.rangeStart,v.rangeEnd);
      if(size===0) msgs.push(mkMsg('warning','vlan',v.domain,t('val.range_end_before_start',{vlan:v.vlanName}),t('val.range_end_before_start_res'),{tab:'vlans',key:`vlan:${v.domain}|${v.vlanName}`}));
      else if(size<v.requiredIPs) msgs.push(mkMsg('info','vlan',v.domain,t('val.range_too_small',{vlan:v.vlanName,size,need:v.requiredIPs}),t('val.range_too_small_res'),{tab:'vlans',key:`vlan:${v.domain}|${v.vlanName}`}));
    }
    const need=appliances.filter(a=>a.domain===v.domain&&a.vlan===v.vlanName&&a.staticIPRequired===true).length;
    if(need>v.requiredIPs) msgs.push(mkMsg('info','vlan',v.domain,t('val.range_insufficient',{vlan:v.vlanName,need,available:v.requiredIPs}),t('val.range_insufficient_res'),{tab:'vlans',key:`vlan:${v.domain}|${v.vlanName}`}));
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
  // TechDocs 9.1: "Domain suffixes such as .local are not supported."
  const localFqdn=[project.fqdnSuffix,...appliances.map(a=>a.fqdn),...vips.map(v=>v.fqdn)].some(f=>/\.local\.?$/i.test((f||'').trim()));
  if(localFqdn) msgs.push(mkMsg('warning','scenario','Global',t('val.fqdn_local'),t('val.fqdn_local_res')));
  if(!project.projectName.trim()) msgs.push(mkMsg('info','scenario','Global','Project name is not set.','Enter project name.'));

  return msgs;
}
