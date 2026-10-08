// v1.30.0 field feedback: Management Services ranges → VLAN Design, Log Management label, advisory validation notes.
import assert from 'node:assert/strict';
import test from 'node:test';
const C = await import(new URL('../core/index.js', import.meta.url));
const clone=o=>JSON.parse(JSON.stringify(o));
const t=(k,v)=>C.translate(C.translations,'fr',k,v);
const P={...C.DEFAULT_PROJECT};
const build=(m,p=P)=>{
  const vlans=C.buildManagementVLANs(m,p,[],t);
  const apps=C.buildManagementAppliances(m,p,t);
  return {vlans,apps,plan:C.buildMgmtServicesPlan(m,p)};
};

test('Mgmt Services ranges fill the hosting VLAN Design row when empty', ()=>{
  const m={...clone(C.DEFAULT_MGMT),svcRuntimeRangeStart:'10.11.99.31',svcRuntimeRangeEnd:'10.11.99.50',vcfaRangeStart:'10.11.99.51',vcfaRangeEnd:'10.11.99.55'};
  const {vlans,apps,plan}=build(m);
  const r=C.syncMgmtServicesVlanRange(vlans,apps,plan);
  assert.equal(r.row.vlanName,'Management VM Network');
  assert.equal(r.synced,true);
  assert.equal(r.row.rangeStart,'10.11.99.31');
  // spans the row's required IPs from the lowest reserved address, and covers both reserved ranges
  assert.equal(C.rangeSize(r.row.rangeStart,r.row.rangeEnd),Math.max(r.row.requiredIPs,25));
  assert.deepEqual(r.row.rangeAuto,{start:r.row.rangeStart,end:r.row.rangeEnd});
});

test('Mgmt Services → VLAN Design: follows auto-filled value, never overwrites a manual one', ()=>{
  const m={...clone(C.DEFAULT_MGMT),svcRuntimeRangeStart:'10.11.99.31',svcRuntimeRangeEnd:'10.11.99.50'};
  let {vlans,apps,plan}=build(m);
  const row=C.syncMgmtServicesVlanRange(vlans,apps,plan).row;
  // the ranges change: an untouched auto-filled row follows
  m.svcRuntimeRangeStart='10.11.99.101'; m.svcRuntimeRangeEnd='10.11.99.120';
  plan=C.buildMgmtServicesPlan(m,P);
  C.syncMgmtServicesVlanRange(vlans,apps,plan);
  assert.equal(row.rangeStart,'10.11.99.101');
  // manual edit is kept
  row.rangeStart='10.11.99.10'; row.rangeEnd='10.11.99.200';
  m.svcRuntimeRangeStart='10.11.99.131'; m.svcRuntimeRangeEnd='10.11.99.150';
  const r=C.syncMgmtServicesVlanRange(vlans,apps,C.buildMgmtServicesPlan(m,P));
  assert.equal(r.synced,false); assert.equal(row.rangeStart,'10.11.99.10'); assert.equal(row.rangeEnd,'10.11.99.200');
  assert.equal(r.target.start,'10.11.99.131');
});

test('Mgmt Services → VLAN Design: clearing the ranges clears an auto-filled row; invalid range is ignored', ()=>{
  const m={...clone(C.DEFAULT_MGMT),svcRuntimeRangeStart:'10.11.99.31',svcRuntimeRangeEnd:'10.11.99.50'};
  const {vlans,apps,plan}=build(m);
  const row=C.syncMgmtServicesVlanRange(vlans,apps,plan).row;
  m.svcRuntimeRangeEnd='10.11.9';          // being typed: keep the previous value
  C.syncMgmtServicesVlanRange(vlans,apps,C.buildMgmtServicesPlan(m,P));
  assert.equal(row.rangeStart,'10.11.99.31');
  m.svcRuntimeRangeStart=''; m.svcRuntimeRangeEnd='';
  C.syncMgmtServicesVlanRange(vlans,apps,C.buildMgmtServicesPlan(m,P));
  assert.equal(row.rangeStart,''); assert.equal(row.rangeEnd,''); assert.equal(row.rangeAuto,null);
});

test('Mgmt Services → VLAN Design: dedicated VLAN model targets the dedicated row; 9.0 has none', ()=>{
  const m={...clone(C.DEFAULT_MGMT),fleetPlacement:'dedicated-fleet-vlan',svcRuntimeRangeStart:'10.20.0.20',svcRuntimeRangeEnd:'10.20.0.39'};
  const {vlans,apps,plan}=build(m);
  const r=C.syncMgmtServicesVlanRange(vlans,apps,plan);
  assert.equal(r.row.vlanName,'VCF Management Services Runtime');
  assert.equal(r.row.rangeStart,'10.20.0.20');
  const p90={...P,vcfVersion:'9.0'};
  const b=build(m,p90);
  assert.equal(C.syncMgmtServicesVlanRange(b.vlans,b.apps,b.plan).target,null);
});

test('Log Management label follows the VCF version', ()=>{
  const m=clone(C.DEFAULT_MGMT);
  const label=v=>C.computeComponentRequirements({...P,vcfVersion:v},m,[]).components.find(c=>c.id==='ops-for-logs').label;
  assert.equal(label('9.1'),'VCF Log Management');
  assert.equal(label('9.1.1'),'VCF Log Management');
  assert.equal(label('9.0'),'VCF Operations for Logs');
  const svc=v=>C.buildDomainSummaries({...P,vcfVersion:v},m,[],[],[])[0].enabledServices;
  assert.ok(svc('9.1.1').includes('VCF Log Management'));
  assert.ok(svc('9.0').includes('VCF Ops for Logs'));
});

test('stretched requirement reminders are advisory (nothing to fix), not warnings', ()=>{
  for(const topologyMode of ['vsan-stretched','stretched']){
    const m={...clone(C.DEFAULT_MGMT),topologyMode};
    const msgs=C.runValidation(P,m,[],C.buildManagementVLANs(m,P,[],t),t,C.buildManagementAppliances(m,P,t),[],[]);
    const key=topologyMode==='stretched'?'val.vmsc_l2_warn':'val.vsan_warn';
    const msg=msgs.find(x=>x.message===t(key));
    assert.ok(msg,key); assert.equal(msg.severity,'info'); assert.equal(msg.advisory,true);
  }
  assert.ok(!/doit être L2|Vérifier L2/.test(t('val.vsan_warn')+t('val.vsan_warn_res')));
});
