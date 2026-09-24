// Lot 4 engine features: CIDR helpers, ESXi host inventory, per-subnet IP map, IP plan checks, VPC external VLAN.
import assert from 'node:assert/strict';
import test from 'node:test';
const C = await import(new URL('../core/index.js', import.meta.url));
const clone=o=>JSON.parse(JSON.stringify(o));
const t=(k,v)=>C.translate(C.translations,'fr',k,v);
const P={...C.DEFAULT_PROJECT};

test('CIDR helpers', ()=>{
  const c=C.parseCidr('10.0.1.77/24');
  assert.equal(C.intToIp(c.network),'10.0.1.0'); assert.equal(C.intToIp(c.firstUsable),'10.0.1.1'); assert.equal(c.size,256);
  assert.equal(C.parseCidr('10.0.1.0/33'),null);
  assert.equal(C.cidrsOverlap('10.0.0.0/22','10.0.3.0/24'),true);
  assert.equal(C.cidrsOverlap('10.0.0.0/24','10.0.1.0/24'),false);
  assert.equal(C.gatewayIP('10.11.11.1/24'),'10.11.11.1');
  assert.equal(C.gatewayIP('nope'),'');
});

test('host inventory: counts, AZ split, VLAN mapping', ()=>{
  const m={...clone(C.DEFAULT_MGMT),topologyMode:'vsan-stretched'};
  const w={...C.defaultWorkloadDomain(1)};
  const h=C.buildHostInventory(m,[w]);
  const mh=h.filter(x=>x.domain==='Management Domain');
  assert.equal(mh.length,8);
  assert.deepEqual(mh.map(x=>x.az),['AZ1','AZ1','AZ1','AZ1','AZ2','AZ2','AZ2','AZ2']);
  assert.equal(mh[0].vlan,'ESXi Management — AZ1'); assert.equal(mh[7].vlan,'ESXi Management — AZ2');
  assert.equal(mh[0].hostName,'esx-mgmt-01');
  assert.equal(h.filter(x=>x.domain==='WLD-01').length,3);
  const all={...m,azNetworks:{hostMgmt:'stretched',vmotion:'per-az',vsan:'per-az',hostTep:'per-az'}};
  assert.ok(C.buildHostInventory(all,[]).every(x=>x.vlan==='ESXi Management'));
  assert.ok(C.buildHostInventory({...m,topologyMode:'stretched'},[]).every(x=>x.vlan==='ESXi Management'));
});

test('IP map classifies addresses', ()=>{
  const v={cidr:'10.0.1.0/28',gateway:'10.0.1.1/28'};
  const m=C.buildIpMap(v,[{ip:'10.0.1.5',label:'a'},{ip:'10.0.1.6',label:'b'},{ip:'10.0.1.6',label:'c'},{ip:'10.0.1.9',label:'d'}],[{start:'10.0.1.8',end:'10.0.1.10',label:'pool',kind:'reserved'}]);
  const k=ip=>m.cells.find(c=>c.ip===ip).kind;
  assert.equal(m.cells.length,16);
  assert.equal(k('10.0.1.0'),'edge'); assert.equal(k('10.0.1.15'),'edge'); assert.equal(k('10.0.1.1'),'gateway');
  assert.equal(k('10.0.1.5'),'assigned'); assert.equal(k('10.0.1.6'),'conflict'); assert.equal(k('10.0.1.9'),'conflict');
  assert.equal(k('10.0.1.8'),'reserved'); assert.equal(k('10.0.1.2'),'free');
  // an IP inside the VLAN's own allocation range is a normal assignment, not a conflict
  const pool=C.buildIpMap({cidr:'10.0.1.0/28'},[{ip:'10.0.1.3',label:'x'}],[{start:'10.0.1.2',end:'10.0.1.6',label:'vlan',kind:'pool'}]);
  assert.equal(pool.cells.find(c=>c.ip==='10.0.1.3').kind,'assigned');
  assert.equal(pool.cells.find(c=>c.ip==='10.0.1.4').kind,'pool');
  assert.equal(C.buildIpMap({cidr:'10.0.0.0/20'}).error,'too-large');
  assert.equal(C.buildIpMap({cidr:''}).error,'no-cidr');
});

function run(mPatch={},edit=()=>{},wlds=[]){
  const mgmt={...clone(C.DEFAULT_MGMT),...mPatch};
  const vlans=[...C.buildManagementVLANs(mgmt,P,wlds,t),...wlds.flatMap(w=>C.buildWorkloadVLANs(w,P,t))];
  const apps=C.buildManagementAppliances(mgmt,P,t), vips=C.buildManagementVIPs(mgmt,P), hosts=C.buildHostInventory(mgmt,wlds);
  const V=n=>vlans.find(v=>v.vlanName===n);
  edit({V,apps,vips,hosts,vlans});
  return C.runValidation(P,mgmt,wlds,vlans,t,apps,vips,hosts);
}
// Matches a message against its full translation template ({vars} become wildcards).
const tpl=key=>new RegExp('^'+t(key,{}).replace(/[.*+?^$()|[\]\\]/g,'\\$&').replace(/\\?\{\w+\\?\}/g,'.*')+'$','s');
const find=(msgs,key,sev)=>msgs.find(m=>tpl(key).test(m.message)&&(!sev||m.severity===sev));

test('IP plan checks', ()=>{
  const dup=run({},({apps,hosts})=>{apps[0].ipAddress='10.0.1.10';hosts[0].ipAddress='10.0.1.10';});
  const d=find(dup,'val.ip_duplicate','blocker'); assert.ok(d); assert.equal(d.ref.tab,'appliances');
  assert.ok(find(run({},({V,apps})=>{V('Management VM Network').cidr='10.0.1.0/24';apps[0].ipAddress='10.0.2.10';}),'val.ip_outside_cidr','warning'));
  assert.ok(find(run({},({V,apps})=>{V('Management VM Network').cidr='10.0.1.0/24';apps[0].ipAddress='10.0.1.255';}),'val.ip_edge','blocker'));
  assert.ok(find(run({},({V,apps})=>{const v=V('Management VM Network');v.cidr='10.0.1.0/24';v.gateway='10.0.1.1/24';apps[0].ipAddress='10.0.1.1';}),'val.ip_is_gateway','blocker'));
  assert.ok(find(run({},({V})=>{V('vMotion').gateway='abc';}),'val.gw_invalid','warning'));
  assert.ok(find(run({},({V})=>{const v=V('vMotion');v.cidr='10.0.5.0/24';v.gateway='10.0.6.1';}),'val.gw_outside','warning'));
  assert.ok(find(run({},({V})=>{V('vMotion').cidr='10.0.0.0/22';V('vSAN').cidr='10.0.3.0/24';}),'val.cidr_overlap','warning'));
  assert.ok(find(run({},({V})=>{V('vMotion').vlanId='20';V('vSAN').vlanId='20';}),'val.vlanid_dup','warning'));
  // AZ1/AZ2 pair of one network may share the VLAN ID (Broadcom 9.1)
  const az=run({topologyMode:'vsan-stretched'},({V})=>{V('vMotion — AZ1').vlanId='20';V('vMotion — AZ2').vlanId='20';});
  assert.ok(!find(az,'val.vlanid_dup'));
  // shared-scope WLD VLANs may reuse values
  const w={...C.defaultWorkloadDomain(1),dedicatedVLANs:false};
  const sh=run({},({vlans})=>{vlans.find(v=>v.domain==='Management Domain'&&v.vlanName==='vMotion').cidr='10.9.0.0/24';vlans.find(v=>v.domain==='WLD-01'&&v.vlanName==='vMotion').cidr='10.9.0.0/24';},[w]);
  assert.ok(!find(sh,'val.cidr_overlap'));
  // clean plan: no IP-plan message at all
  const clean=run({},({V,apps})=>{V('Management VM Network').cidr='10.0.1.0/24';apps[0].ipAddress='10.0.1.10';apps[1].ipAddress='10.0.1.11';});
  assert.ok(!['val.ip_duplicate','val.ip_outside_cidr','val.ip_edge','val.cidr_overlap','val.vlanid_dup'].some(k=>find(clean,k)));
});

test('VPC external VLAN only for Distributed connectivity (9.1+)', ()=>{
  const names=m=>C.buildManagementVLANs({...clone(C.DEFAULT_MGMT),...m},P,[],t).map(v=>v.vlanName);
  assert.ok(!names({}).includes('VPC External (Distributed Transit Gateway)')); // workbook default: centralized
  const v=C.buildManagementVLANs({...clone(C.DEFAULT_MGMT),vpcConnectivity:'distributed',vpcExternalIPs:30},P,[],t).find(x=>x.vlanType==='vpc-external');
  assert.equal(v.requiredIPs,30); assert.equal(v.recommendedMTU,1500);
  assert.ok(!C.buildManagementVLANs({...clone(C.DEFAULT_MGMT),vpcConnectivity:'distributed'},{...P,vcfVersion:'9.0'},[],t).some(x=>x.vlanType==='vpc-external'));
});

test('every VLAN row carries a gateway field', ()=>{
  assert.ok(C.buildManagementVLANs(clone(C.DEFAULT_MGMT),P,[],t).every(v=>v.gateway===''));
});
