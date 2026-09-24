// Engine regression suite for core/*.js (pure ES modules, no dependencies). Run with `npm test` (node --test).
// Messages are checked against the FR translations, so wording changes in core/i18n.js are picked up automatically.
import assert from 'node:assert/strict';
import test from 'node:test';
const C = await import(new URL('../core/index.js', import.meta.url));
const clone=o=>JSON.parse(JSON.stringify(o));
const t=(k,v)=>C.translate(C.translations,'fr',k,v);
function build(mgmtPatch={},projPatch={},wlds=[]){
  const project={...C.DEFAULT_PROJECT,...projPatch};
  const mgmt={...clone(C.DEFAULT_MGMT),...mgmtPatch};
  const vlans=[...C.buildManagementVLANs(mgmt,project,wlds,t),...wlds.flatMap(w=>C.buildWorkloadVLANs(w,project,t))];
  const apps=[...C.buildManagementAppliances(mgmt,project,t),...wlds.flatMap(w=>C.buildWorkloadAppliances(w,t))];
  const vips=[...C.buildManagementVIPs(mgmt,project),...wlds.flatMap(w=>C.buildWorkloadVIPs(w))];
  const val=C.runValidation(project,mgmt,wlds,vlans,t,apps);
  const sum=C.buildDomainSummaries(project,mgmt,wlds,vlans,vips);
  return {project,mgmt,vlans,apps,vips,val,sum};
}

test('vMSC FC 4+4 with untouched defaults: 8 hosts, no witness', ()=>{
  const r=build({topologyMode:'stretched',storageType:'vmfs'}); // hostCount stays 4 (stale default)
  assert.equal(r.sum[0].hostCount,8);
  assert.deepEqual(r.sum[0].azHostCounts,[4,4]);
  assert.ok(!r.vlans.some(v=>v.vlanType==='vsan-witness'));
  assert.ok(!r.apps.some(a=>a.applianceName.startsWith('vsan-witness')));
  assert.ok(!r.val.some(m=>/Witness/.test(m.message)));
  assert.ok(!r.val.some(m=>m.message.startsWith(t('val.orphan_vlan',{vlan:'',count:0}).slice(0,15))));
});
test('vSAN stretched keeps the witness', ()=>{
  const r=build({topologyMode:'vsan-stretched'});
  assert.ok(r.vlans.some(v=>v.vlanType==='vsan-witness'));
  assert.ok(r.apps.some(a=>a.applianceName==='vsan-witness-mgmt'));
});
test('vMSC asymmetric hosts = warning, vSAN = blocker', ()=>{
  const v=build({topologyMode:'stretched',storageType:'vmfs',az1HostCount:4,az2HostCount:3}).val.find(m=>/host counts differ/.test(m.message));
  assert.equal(v.severity,'warning');
  const s=build({topologyMode:'vsan-stretched',az1HostCount:4,az2HostCount:3}).val.find(m=>/host counts differ/.test(m.message));
  assert.equal(s.severity,'blocker');
});
test('cleared AZ field does not concatenate', ()=>{
  assert.equal(C.effectiveHostCount({topologyMode:'stretched',az1HostCount:'',az2HostCount:4,hostCount:4}),4);
});
test('WLD stretched defaults 2+2 → 4 hosts', ()=>{
  const w={...C.defaultWorkloadDomain(1),topologyMode:'stretched',storageType:'vmfs'};
  assert.equal(build({},{},[w]).sum[1].hostCount,4);
});
test('9.1.1 behaves like 9.1 for version-gated rules', ()=>{
  for(const ver of ['9.1','9.1.1']){
    const r=build({},{vcfVersion:ver});
    assert.ok(r.val.some(m=>m.message===t('val.auto_block_info')),ver);
    assert.ok(!r.val.some(m=>m.message===t('val.ops_no_collectors')),ver);
    assert.ok(!r.val.some(m=>/ILB VIP disabled|worker\(s\)/.test(m.message)),ver);
    assert.ok(!r.vips.some(v=>v.vipName==='Fleet VIP'),ver);
  }
  assert.ok(build({},{vcfVersion:'9.0'}).vips.some(v=>v.vipName==='Fleet VIP'));
});
test('expandHostIP', ()=>{
  const e=C.expandHostIP;
  assert.deepEqual(e('25','10.0.1.0/24'),{ip:'10.0.1.25',error:null});
  assert.deepEqual(e(' .25 ',' 10.0.1.0/24 '),{ip:'10.0.1.25',error:null});
  assert.deepEqual(e('1.5','10.0.0.0/22'),{ip:'10.0.1.5',error:null});
  assert.equal(e('5','10.0.0.0/22').ip,'10.0.0.5');
  assert.equal(e('0','10.0.1.0/24').error,'network');
  assert.equal(e('255','10.0.1.0/24').error,'broadcast');
  assert.equal(e('70','10.0.1.64/26').ip,'10.0.1.70');
  assert.equal(e('5','10.0.1.64/26').error,'outside');
  assert.equal(e('300','10.0.1.0/24').error,'invalid');
  assert.equal(e('25','').error,'no-cidr');
  assert.equal(e('abc','10.0.1.0/24').error,'invalid');
  assert.deepEqual(e('10.0.1.9','10.0.1.0/24'),{ip:'10.0.1.9',error:null});
  assert.deepEqual(e('10.0.2.9','10.0.1.0/24'),{ip:'10.0.2.9',error:'outside'});
  assert.deepEqual(e('10.0.2.9',''),{ip:'10.0.2.9',error:null});
  assert.deepEqual(e('',''),{ip:'',error:null});
});
test('getVLANPrefix uses real mask', ()=>{
  const vl=[{domain:'D',vlanName:'N',cidr:' 10.0.1.0/24 '},{domain:'D',vlanName:'W',cidr:'10.0.0.0/22'},{domain:'D',vlanName:'X',cidr:'10.0.1.0'}];
  assert.equal(C.getVLANPrefix(vl,'D','N'),'10.0.1.x');
  assert.equal(C.getVLANPrefix(vl,'D','W'),'10.0.x.x');
  assert.equal(C.getVLANPrefix(vl,'D','X'),'');
  assert.equal(C.getVLANPrefix(vl,'OTHER','N'),'10.0.1.x'); // name fallback kept for WLD → Mgmt VM Network
});
test('single-site unchanged (non-regression)', ()=>{
  const r=build();
  assert.equal(r.sum[0].hostCount,4); assert.equal(r.sum[0].azHostCounts,null);
});

test('vMSC = Stretch all L2: one VLAN per network sized for AZ1+AZ2', ()=>{
  const r=build({topologyMode:'stretched',storageType:'vmfs'});
  const names=r.vlans.map(v=>v.vlanName);
  assert.deepEqual(names,['ESXi Management','Management VM Network','vMotion','NSX Host TEP']);
  assert.equal(r.sum[0].vlanCount,4);
  const by=n=>r.vlans.find(v=>v.vlanName===n);
  assert.equal(by('ESXi Management').requiredIPs,8);
  assert.equal(by('vMotion').requiredIPs,8);
  assert.equal(by('NSX Host TEP').requiredIPs,16);
  assert.equal(by('NSX Host TEP').recommendedCIDR,'/27');
  assert.ok(r.vlans.every(v=>/L2 étendu AZ1\+AZ2/.test(v.notes)));
  assert.ok(r.val.some(m=>m.message===t('val.vmsc_l2_warn')));
});
test('vMSC NFS + Edge + model 4: single stretched rows', ()=>{
  const r=build({topologyMode:'stretched',storageType:'nfs',nsxEdgeDeployed:true,fleetPlacement:'nsx-overlay-segment'});
  assert.ok(!r.vlans.some(v=>/AZ[12]/.test(v.vlanName)), r.vlans.map(v=>v.vlanName).join('|'));
  assert.equal(r.vlans.find(v=>v.vlanName==='NFS Storage').requiredIPs,8);
  assert.equal(r.vlans.filter(v=>v.vlanName==='VCF Management Dedicated VLAN').length,1);
});
test('vMSC workload domain: single rows', ()=>{
  const w={...C.defaultWorkloadDomain(1),topologyMode:'stretched',storageType:'vmfs'};
  const wv=build({},{},[w]).vlans.filter(v=>v.domain===w.domainName);
  assert.ok(!wv.some(v=>/AZ[12]/.test(v.vlanName)));
  assert.equal(wv.find(v=>v.vlanName==='ESXi Management').requiredIPs,4);
});
test('vSAN stretched keeps per-AZ rows', ()=>{
  const r=build({topologyMode:'vsan-stretched'});
  for(const n of ['ESXi Management','vMotion','vSAN','NSX Host TEP']) for(const az of ['AZ1','AZ2'])
    assert.ok(r.vlans.some(v=>v.vlanName===`${n} — ${az}`),n+az);
});

// ── Lot 3: VCF Management Services ──
const mgmtVM=r=>r.vlans.find(v=>v.vlanName==='Management VM Network');
test('plan sizing: 12 + Log Mgmt + RTM, or 30 when reserved', ()=>{
  const P=m=>C.buildMgmtServicesPlan({...clone(C.DEFAULT_MGMT),...m},{...C.DEFAULT_PROJECT});
  assert.equal(P({}).pool.size,18);                         // default: Log Mgmt on → 12 + 6
  assert.equal(P({vcfOperationsForLogs:{...C.DEFAULT_MGMT.vcfOperationsForLogs,enabled:false}}).pool.size,12);
  assert.equal(P({logMgmtExtraReplicas:2,realtimeMetricsEnabled:true}).pool.size,28); // 12+10+6
  assert.equal(P({svcRuntimeReserve30:true}).pool.size,30);
  assert.equal(P({logMgmtExtraReplicas:6,realtimeMetricsEnabled:true,svcRuntimeReserve30:true}).pool.size,36);
  assert.deepEqual(P({}).endpoints.map(e=>e.key),['fleet','instance','runtime','idb','logs-vip']);
  assert.equal(C.buildMgmtServicesPlan(clone(C.DEFAULT_MGMT),{...C.DEFAULT_PROJECT,vcfVersion:'9.0'}),null);
});
test('Mgmt VM Network counts endpoints outside the pool + pool', ()=>{
  const r=build();
  // 1 SDDC + 1 vCenter + 3 NSX + 1 VIP + (5 endpoints + 18 pool) + Ops 4 + Nets 1 + Nets collector 1 + Auto 7 + Cloud Proxy 1 + License 1
  assert.equal(mgmtVM(r).requiredIPs,1+1+3+1+5+18+4+1+1+7+1+1);
  const d=build({fleetPlacement:'dedicated-fleet-vlan'});
  assert.equal(d.vlans.find(v=>v.vlanName==='VCF Management Services Runtime').requiredIPs,5+18+5+1+7); // + Ops(4+lic) + Nets 1 + Auto 7
});
test('9.1: no Log Mgmt appliance, no Nets VIP, no Ops VIP in Simple', ()=>{
  const r=build({vcfOperations:{...C.DEFAULT_MGMT.vcfOperations,mode:'simple'}});
  assert.ok(!r.apps.some(a=>a.applianceName==='vcf-log-mgmt-01'));
  assert.ok(r.vips.some(v=>v.vipName==='VCF Log Management VIP'));
  assert.ok(!r.vips.some(v=>v.vipName==='VCF Operations for Networks VIP'));
  assert.ok(!r.vips.some(v=>v.vipName==='VCF Operations VIP'));
  assert.ok(build().vips.some(v=>v.vipName==='VCF Operations VIP')); // enterprise keeps optional LB VIP
  const o=build({},{vcfVersion:'9.0'});
  assert.ok(o.vips.some(v=>v.vipName==='VCF Operations for Networks VIP'));
});
test('components: VCF Management Services = 4 endpoint IPs + pool', ()=>{
  const c=C.computeComponentRequirements({...C.DEFAULT_PROJECT},clone(C.DEFAULT_MGMT),[]).components.find(x=>x.id==='vcf-mgmt-services');
  assert.equal(c.totalIps,22); assert.equal(c.totalFqdns,4);
});
function validate(mPatch,apps=a=>a,projPatch={}){
  const project={...C.DEFAULT_PROJECT,...projPatch};const mgmt={...clone(C.DEFAULT_MGMT),...mPatch};
  const vlans=C.buildManagementVLANs(mgmt,project,[],t);
  vlans.find(v=>v.vlanName==='Management VM Network').cidr='10.11.99.0/24';
  const al=apps(C.buildManagementAppliances(mgmt,project,t));
  return C.runValidation(project,mgmt,[],vlans,t,al,C.buildManagementVIPs(mgmt,project));
}
// Matches a message against its full translation template ({vars} become wildcards).
const tpl=key=>new RegExp('^'+t(key,{}).replace(/[.*+?^$()|[\]\\]/g,'\\$&').replace(/\\?\{\w+\\?\}/g,'.*')+'$','s');
const has=(msgs,key,sev)=>msgs.some(m=>tpl(key).test(m.message)&&(!sev||m.severity===sev));
test('range validation', ()=>{
  assert.ok(has(validate({}),'val.ms_range_missing','info'));
  assert.ok(has(validate({svcRuntimeRangeStart:'10.11.99.31',svcRuntimeRangeEnd:'10.11.99.40'}),'val.ms_range_min','blocker'));
  assert.ok(has(validate({svcRuntimeRangeStart:'10.11.99.31',svcRuntimeRangeEnd:'10.11.99.45'}),'val.ms_range_small','warning')); // 15 < 18
  const ok=validate({svcRuntimeRangeStart:'10.11.99.31',svcRuntimeRangeEnd:'10.11.99.48',vcfaRangeStart:'10.11.99.50',vcfaRangeEnd:'10.11.99.54'});
  assert.ok(!ok.some(m=>m.severity==='blocker'&&/plage|range/i.test(m.message)), ok.filter(m=>m.severity==='blocker').map(m=>m.message).join('|'));
  assert.ok(has(validate({svcRuntimeRangeStart:'10.11.100.1',svcRuntimeRangeEnd:'10.11.100.20'}),'val.ms_range_outside','warning'));
  assert.ok(has(validate({svcRuntimeRangeStart:'10.11.99.31',svcRuntimeRangeEnd:'10.11.99.48',vcfaRangeStart:'10.11.99.45',vcfaRangeEnd:'10.11.99.49'}),'val.ms_ranges_overlap','blocker'));
  assert.ok(has(validate({vcfaRangeStart:'10.11.99.50',vcfaRangeEnd:'10.11.99.52'}),'val.vcfa_range_small','warning'));
  const inR=validate({svcRuntimeRangeStart:'10.11.99.31',svcRuntimeRangeEnd:'10.11.99.48'},a=>a.map(x=>x.applianceName==='fleet-01'?{...x,ipAddress:'10.11.99.35'}:x));
  assert.ok(inR.some(m=>m.severity==='blocker'&&m.message.includes('fleet-01')&&m.message.includes('10.11.99.35')));
  assert.ok(has(validate({},a=>a,{fqdnSuffix:'corp.local'}),'val.fqdn_local','warning'));
  assert.ok(!has(validate({},a=>a,{fqdnSuffix:'vcf.example.com'}),'val.fqdn_local'));
  assert.ok(!has(validate({},a=>a,{vcfVersion:'9.0'}),'val.ms_range_missing'));
});

// ── Lot 2: vSAN stretched per-network AZ layout ──
test('vSAN stretched default = Broadcom table (per-AZ) with notes, MTU, flags', ()=>{
  const r=build({topologyMode:'vsan-stretched'});
  const az1=r.vlans.find(v=>v.vlanName==='vMotion — AZ1');
  assert.equal(az1.az,'AZ1'); assert.equal(az1.stretchedL2,false); assert.equal(az1.recommendedMTU,9000);
  assert.match(az1.notes,/sous-réseau distinct/);
  const vm=r.vlans.find(v=>v.vlanName==='Management VM Network');
  assert.equal(vm.stretchedL2,true); assert.equal(vm.recommendedMTU,1500); assert.match(vm.notes,/L2 étendu/);
  assert.equal(r.vlans.find(v=>v.vlanType==='vsan-witness').stretchedL2,false);
});
test('vSAN stretched: per-network stretched choice', ()=>{
  const r=build({topologyMode:'vsan-stretched',azNetworks:{hostMgmt:'per-az',vmotion:'stretched',vsan:'per-az',hostTep:'stretched'}});
  const n=r.vlans.map(v=>v.vlanName);
  assert.ok(n.includes('vMotion')&&!n.includes('vMotion — AZ1'));
  assert.ok(n.includes('NSX Host TEP')&&!n.includes('NSX Host TEP — AZ2'));
  assert.ok(n.includes('ESXi Management — AZ1')&&n.includes('vSAN — AZ2'));
  assert.equal(r.vlans.find(v=>v.vlanName==='vMotion').requiredIPs,8);
  assert.equal(r.vlans.find(v=>v.vlanName==='NSX Host TEP').requiredIPs,16);
  assert.ok(r.vlans.find(v=>v.vlanName==='vMotion').stretchedL2);
});
test('vSAN stretched all-L2 preset: no AZ rows, witness kept', ()=>{
  const all={hostMgmt:'stretched',vmotion:'stretched',vsan:'stretched',hostTep:'stretched'};
  const r=build({topologyMode:'vsan-stretched',azNetworks:all});
  assert.ok(!r.vlans.some(v=>v.az));
  assert.ok(r.vlans.some(v=>v.vlanType==='vsan-witness'));
});
test('azNetworks ignored single-site; vMSC always stretched', ()=>{
  const all={hostMgmt:'stretched',vmotion:'stretched',vsan:'stretched',hostTep:'stretched'};
  assert.deepEqual(build({azNetworks:all}).vlans.map(v=>v.vlanName),build().vlans.map(v=>v.vlanName));
  const m=build({topologyMode:'stretched',storageType:'vmfs',azNetworks:{hostMgmt:'per-az'}});
  assert.ok(!m.vlans.some(v=>v.az));
});
test('Model 4 dedicated VLAN is a single stretched row on vSAN stretched', ()=>{
  const r=build({topologyMode:'vsan-stretched',fleetPlacement:'nsx-overlay-segment',nsxEdgeDeployed:true});
  const d=r.vlans.filter(v=>v.vlanName.startsWith('VCF Management Dedicated VLAN'));
  assert.equal(d.length,1); assert.ok(d[0].stretchedL2);
});
test('WLD per-network choice', ()=>{
  const w={...C.defaultWorkloadDomain(1),topologyMode:'vsan-stretched',azNetworks:{hostMgmt:'stretched',vmotion:'per-az',vsan:'per-az',hostTep:'per-az'}};
  const wv=build({topologyMode:'vsan-stretched'},{},[w]).vlans.filter(v=>v.domain===w.domainName).map(v=>v.vlanName);
  assert.ok(wv.includes('ESXi Management')&&wv.includes('vMotion — AZ1'));
});
test('coherence rules', ()=>{
  const V=(m,wlds=[])=>{const r=build(m,{},wlds);return r.val;};
  assert.ok(V({topologyMode:'vsan-stretched',storageType:'vmfs'}).some(x=>x.severity==='blocker'&&x.message===t('val.topo_vsan_storage')));
  assert.ok(V({topologyMode:'stretched'}).some(x=>x.severity==='warning'&&x.message===t('val.topo_vmsc_storage'))); // default storage vSAN
  const w={...C.defaultWorkloadDomain(1),topologyMode:'vsan-stretched'};
  assert.ok(V({},[w]).some(x=>x.severity==='blocker'&&x.message.includes(t('val.wld_stretch_first'))));
  assert.ok(!V({topologyMode:'vsan-stretched'},[w]).some(x=>x.message.includes(t('val.wld_stretch_first'))));
  // same CIDR on AZ1/AZ2
  const project={...C.DEFAULT_PROJECT};const mgmt={...clone(C.DEFAULT_MGMT),topologyMode:'vsan-stretched'};
  const vl=C.buildManagementVLANs(mgmt,project,[],t);
  vl.find(v=>v.vlanName==='vMotion — AZ1').cidr='10.1.1.0/24';vl.find(v=>v.vlanName==='vMotion — AZ2').cidr='10.1.1.0/24';
  assert.ok(C.runValidation(project,mgmt,[],vl,t,[],[]).some(m=>m.severity==='warning'&&m.message===t('val.az_same_cidr',{vlan:'vMotion',cidr:'10.1.1.0/24'})));
});
