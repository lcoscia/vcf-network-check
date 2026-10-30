// v1.32.0 — imported Workload Domain (VCF Operations › Import a vCenter): existing rows, NSX Manager options, TEP modes,
// import validations. Run with `npm test`.
import assert from 'node:assert/strict';
import test from 'node:test';
const C = await import(new URL('../core/index.js', import.meta.url));
const clone=o=>JSON.parse(JSON.stringify(o));
const t=(k,v)=>C.translate(C.translations,'fr',k,v);
const ALL_CHECKED=Object.fromEntries(C.IMPORT_CHECKLIST.map(c=>[c.key,true]));
const imp=(patch={})=>({...C.defaultWorkloadDomain(1),deployMode:'import',nsxManagerMode:'clustered',importChecklist:{...ALL_CHECKED},...patch});
function build(wlds,projPatch={}){
  const project={...C.DEFAULT_PROJECT,...projPatch};
  const mgmt=clone(C.DEFAULT_MGMT);
  const vlans=[...C.buildManagementVLANs(mgmt,project,wlds,t),...wlds.flatMap(w=>C.buildWorkloadVLANs(w,project,t))];
  const apps=[...C.buildManagementAppliances(mgmt,project,t),...wlds.flatMap(w=>C.buildWorkloadAppliances(w,t))];
  const vips=[...C.buildManagementVIPs(mgmt,project),...wlds.flatMap(w=>C.buildWorkloadVIPs(w))];
  const hosts=C.buildHostInventory(mgmt,wlds);
  const val=C.runValidation(project,mgmt,wlds,vlans,t,apps,vips,hosts);
  const sum=C.buildDomainSummaries(project,mgmt,wlds,vlans,vips);
  return {vlans,apps,vips,hosts,val,sum};
}
const wv=(r)=>r.vlans.filter(v=>v.domain==='WLD-01');
const mgmtVM=(r)=>r.vlans.find(v=>v.vlanName==='Management VM Network').requiredIPs;

test('default WLD is a deployed one; old JSON without deployMode keeps the same output', ()=>{
  assert.equal(C.defaultWorkloadDomain(1).deployMode,'deploy');
  const legacy={...C.defaultWorkloadDomain(1)}; delete legacy.deployMode;
  const a=build([legacy]), b=build([C.defaultWorkloadDomain(1)]);
  assert.deepEqual(a.vlans.map(v=>[v.vlanName,v.requiredIPs]),b.vlans.map(v=>[v.vlanName,v.requiredIPs]));
  assert.ok(!a.vlans.some(v=>v.existing)&&!a.apps.some(a=>a.existing)&&!a.hosts.some(h=>h.existing));
});

test('import: vCenter, hosts and host networks flagged existing; frozen row names unchanged', ()=>{
  const r=build([imp()]);
  const vc=r.apps.find(a=>a.applianceName==='vcenter-wld-01-01');
  assert.ok(vc.existing);
  assert.equal(vc.vlan,'ESXi Management');
  assert.ok(r.hosts.filter(h=>h.domain==='WLD-01').every(h=>h.existing));
  for(const n of ['ESXi Management','VM / Application Network','vMotion','vSAN']) assert.ok(wv(r).find(v=>v.vlanName===n).existing,n);
  assert.ok(r.vips.find(v=>v.vipName==='WLD-01 NSX Manager VIP'));
  assert.equal(r.sum.find(s=>s.domain==='WLD-01').domainType,'workload-import');
});

test('import NSX: new cluster = 3 nodes + VIP deployed (not existing); existing = flagged; shared = none', ()=>{
  const n=build([imp({importNsx:'new'})]);
  assert.equal(n.apps.filter(a=>a.applianceType==='NSX Manager'&&a.domain==='WLD-01').length,3);
  assert.ok(!n.apps.some(a=>a.applianceType==='NSX Manager'&&a.domain==='WLD-01'&&a.existing));
  const e=build([imp({importNsx:'existing'})]);
  assert.ok(e.vips.find(v=>v.vipName==='WLD-01 NSX Manager VIP').existing);
  const s=build([imp({importNsx:'shared'})]);
  assert.equal(s.apps.filter(a=>a.applianceType==='NSX Manager'&&a.domain==='WLD-01').length,0);
  assert.ok(!s.vips.some(v=>v.vipName==='WLD-01 NSX Manager VIP'));
});

test('import TEP: no Host TEP by default, Host TEP row with dedicated TEPs', ()=>{
  assert.ok(!wv(build([imp()])).some(v=>v.vlanName.startsWith('NSX Host TEP')));
  assert.ok(wv(build([imp({importOverlay:'dedicated-tep'})])).some(v=>v.vlanName==='NSX Host TEP'));
});

test('import NSX/vCenter IPs: on WLD ESXi Management when self-hosted, on Management VM Network when on the mgmt domain', ()=>{
  const deploy=build([C.defaultWorkloadDomain(1)]), none=build([]);
  const self=build([imp({importVcLocation:'self'})]), onMgmt=build([imp({importVcLocation:'mgmt'})]);
  assert.equal(mgmtVM(self),mgmtVM(none));
  assert.equal(mgmtVM(onMgmt),mgmtVM(none)+4);
  assert.equal(wv(self).find(v=>v.vlanName==='ESXi Management').requiredIPs,3+1+4);
  assert.ok(mgmtVM(deploy)>mgmtVM(none));
});

test('import validation: checklist, single-node NSX with vCenter 8.x, 9.1.1 mgmt-vmk, 24 WLD max', ()=>{
  const ok=build([imp()]);
  assert.ok(!ok.val.some(m=>m.severity==='blocker'&&m.domain==='WLD-01'),JSON.stringify(ok.val.filter(m=>m.severity==='blocker')));
  const unchecked=build([imp({importChecklist:{}})]).val.filter(m=>m.domain==='WLD-01'&&m.ref?.key?.startsWith('wld-import:'));
  assert.ok(unchecked.length>=C.IMPORT_CHECKLIST.length);
  assert.ok(build([imp({importVcVersion:'8.0u3',nsxManagerMode:'standalone'})]).val.some(m=>m.severity==='blocker'&&/single-node NSX/.test(m.message)));
  assert.ok(build([imp({importOverlay:'mgmt-vmk'})],{vcfVersion:'9.1.1'}).val.some(m=>m.severity==='blocker'&&/9\.1\.1/.test(m.message)));
  const many=Array.from({length:25},(_,i)=>({...C.defaultWorkloadDomain(i+1)}));
  assert.ok(build(many).val.some(m=>m.severity==='blocker'&&/at most 24/.test(m.message)));
});

test('import validation: greenfield-only rules skipped (min 3 hosts, TEP < 2 without TEP)', ()=>{
  const r=build([imp({hostCount:2,tepInterfacesPerHost:1})]);
  assert.ok(!r.val.some(m=>/Min 3 recommended/.test(m.message)));
  assert.ok(!r.val.some(m=>/TEP < 2/.test(m.message)));
});
