// v1.31.0: Broadcom P&P workbook FQDN convention, JSON export envelope + stable row names (read by the sibling
// "VCF Planning & Preparation" importer, core/np-import.js there), and import of a P&P JSON.
import assert from 'node:assert/strict';
import test from 'node:test';
const C = await import(new URL('../core/index.js', import.meta.url));
const clone=o=>JSON.parse(JSON.stringify(o));
const t=(k,v)=>C.translate(C.translations,'fr',k,v);
const P={...clone(C.DEFAULT_PROJECT),siteCode:'sfo',instanceName:'m01',parentDomain:'rainpole.io',fqdnSuffix:'sfo.rainpole.io'};
const rows=(m,p=P,w=[])=>({
  vlans:[...C.buildManagementVLANs(m,p,w,t),...w.flatMap(x=>C.buildWorkloadVLANs(x,p,t))],
  appliances:[...C.buildManagementAppliances(m,p,t),...w.flatMap(x=>C.buildWorkloadAppliances(x,t))],
  vips:[...C.buildManagementVIPs(m,p),...w.flatMap(x=>C.buildWorkloadVIPs(x))],
  hosts:C.buildHostInventory(m,w),
});

test('workbook FQDN convention', ()=>{
  const s=(kind,name,row={},wi=0)=>C.suggestFqdn(P,kind,name,row,wi);
  assert.equal(C.proposedFqdnSuffix({siteCode:'SFO',parentDomain:'rainpole.io'}),'sfo.rainpole.io');
  assert.equal(s('appliances','vcenter-mgmt-01'),'sfo-m01-vc01.sfo.rainpole.io');
  assert.equal(s('appliances','nsx-manager-mgmt-03'),'sfo-m01-nsx01c.sfo.rainpole.io');
  assert.equal(s('vips','NSX Manager VIP'),'sfo-m01-nsx01.sfo.rainpole.io');
  assert.equal(s('appliances','nsx-edge-mgmt-02'),'sfo-m01-en02.sfo.rainpole.io');
  assert.equal(s('appliances','sddc-manager-01'),'sfo-vcf01.sfo.rainpole.io');
  assert.equal(s('appliances','mgmt-instance-01'),'sfo-ic01.sfo.rainpole.io');
  assert.equal(s('appliances','vcf-svc-runtime'),'sfo-sr01.sfo.rainpole.io');
  assert.equal(s('appliances','vcf-ops-cloud-proxy-01'),'sfo-cp01.sfo.rainpole.io');
  assert.equal(s('appliances','vcf-ops-02'),'flt-ops01b.rainpole.io');
  assert.equal(s('vips','VCF Operations VIP'),'flt-ops01.rainpole.io');
  assert.equal(s('appliances','fleet-01'),'flt-fc01.rainpole.io');
  assert.equal(s('appliances','vcf-license-server-01'),'flt-lc01.rainpole.io');
  assert.equal(s('appliances','vcf-identity-broker-01'),'flt-idb01.rainpole.io');
  assert.equal(s('vips','VCF Log Management VIP'),'flt-logs01.rainpole.io');
  assert.equal(s('appliances','vcf-automation-01'),'flt-auto01.rainpole.io');
  assert.equal(s('appliances','vcf-automation-svcruntime-01'),'flt-vcfa-sr01.rainpole.io');
  assert.equal(s('appliances','vcf-nets-platform-01'),'flt-net01a.rainpole.io');
  assert.equal(s('appliances','vsan-witness-mgmt'),'sfo-m01-cl01-vsw01.sfo.rainpole.io');
  assert.equal(s('appliances','vcenter-wld-01-01',{domain:'WLD-01'},1),'sfo-w01-vc01.sfo.rainpole.io');
  // unknown row: instance zone fallback
  assert.equal(s('appliances','license-hub-installer'),'sfo-m01-license-hub-installer.sfo.rainpole.io');
});

test('host FQDNs restart at esx01 in AZ2', ()=>{
  const m={...clone(C.DEFAULT_MGMT),topologyMode:'vsan-stretched',az1HostCount:4,az2HostCount:4};
  const h=C.buildHostInventory(m,[]);
  const f=h.map(x=>C.suggestFqdn(P,'hosts',x.hostName,x));
  assert.equal(f[0],'sfo01-m01-r01-esx01.sfo.rainpole.io');
  assert.equal(f[3],'sfo01-m01-r01-esx04.sfo.rainpole.io');
  assert.equal(f[4],'sfo02-m01-r01-esx01.sfo.rainpole.io');
  assert.equal(f[7],'sfo02-m01-r01-esx04.sfo.rainpole.io');
  const single=C.buildHostInventory(clone(C.DEFAULT_MGMT),[]);
  assert.equal(C.suggestFqdn(P,'hosts',single[1].hostName,single[1]),'sfo01-m01-r01-esx02.sfo.rainpole.io');
});

test('legacy projects keep prefix-name.suffix and migrate softly', ()=>{
  const legacy={...clone(C.DEFAULT_PROJECT),fqdnPrefix:'vcf-prod',fqdnSuffix:'corp.local'};
  assert.equal(C.suggestFqdn(legacy,'appliances','vcenter-mgmt-01'),'vcf-prod-vcenter-mgmt-01.corp.local');
  assert.deepEqual(C.migrateFqdnProject(legacy),[]);
  assert.equal(legacy.siteCode,'');
  const wb={...clone(C.DEFAULT_PROJECT),fqdnPrefix:'sfo-m01',fqdnSuffix:'sfo.rainpole.io'};
  assert.deepEqual(C.migrateFqdnProject(wb),['siteCode','instanceName','parentDomain']);
  assert.equal(C.suggestFqdn(wb,'appliances','fleet-01'),'flt-fc01.rainpole.io');
  assert.equal(C.suggestFqdn({...clone(C.DEFAULT_PROJECT)},'appliances','fleet-01'),'');
});

test('export envelope meta', ()=>{
  assert.deepEqual(C.exportMeta('1.31.0'),{tool:'VCF Network Planner',version:'1.31.0',schema:1});
  for(const k of ['siteCode','instanceName','parentDomain','dnsServers','ntpServers']) assert.ok(k in C.DEFAULT_PROJECT,k);
});

// Frozen: the P&P importer (core/np-import.js in the sibling repo) maps these exact row names. Renaming any of them
// silently breaks NP → P&P import — update both tools together.
test('row names read by the P&P importer stay stable', ()=>{
  const m={...clone(C.DEFAULT_MGMT),nsxEdgeDeployed:true,aviDeployed:true,topologyMode:'vsan-stretched'};
  const w=C.defaultWorkloadDomain(1);
  const r91=rows(m,P,[w]), r90=rows(m,{...P,vcfVersion:'9.0'},[w]);
  const ded=rows({...clone(C.DEFAULT_MGMT),fleetPlacement:'dedicated-fleet-vlan',storageType:'nfs'});
  const apps=new Set([...r91.appliances,...r90.appliances].map(a=>a.applianceName));
  ['sddc-manager-01','vcenter-mgmt-01','nsx-manager-mgmt-01','nsx-manager-mgmt-02','nsx-manager-mgmt-03','nsx-edge-mgmt-01','nsx-edge-mgmt-02',
   'vcf-ops-01','vcf-ops-02','vcf-ops-03','vcf-ops-cloud-proxy-01','vcf-ops-rc-01','fleet-01','mgmt-instance-01','vcf-svc-runtime',
   'vcf-license-server-01','vcf-identity-broker-01','vcf-automation-01','vcf-automation-svcruntime-01','vcf-nets-platform-01',
   'vcf-nets-collector-01','vsan-witness-mgmt','avi-controller-01','avi-controller-02','avi-controller-03','vcenter-wld-01-01']
    .forEach(n=>assert.ok(apps.has(n),`appliance ${n}`));
  const vips=new Set(r91.vips.map(v=>v.vipName));
  ['NSX Manager VIP','VCF Operations VIP','VCF Log Management VIP','VCF Automation VIP','AVI Controller Cluster VIP','WLD-01 NSX Manager VIP']
    .forEach(n=>assert.ok(vips.has(n),`vip ${n}`));
  const mv=new Set([...r91.vlans,...ded.vlans].filter(v=>v.domain==='Management Domain').map(v=>v.vlanName));
  ['ESXi Management — AZ1','ESXi Management — AZ2','Management VM Network','vMotion — AZ1','vMotion — AZ2','vSAN — AZ1','vSAN — AZ2',
   'NSX Host TEP — AZ1','NSX Host TEP — AZ2','NSX Edge TEP','NSX Edge Uplink 1','NSX Edge Uplink 2','VCF Management Services Runtime','NFS Storage','ESXi Management','vMotion','NSX Host TEP']
    .forEach(n=>assert.ok(mv.has(n),`mgmt vlan ${n}`));
  const wv=new Set(r91.vlans.filter(v=>v.domain==='WLD-01').map(v=>v.vlanName));
  ['VM / Application Network'].forEach(n=>assert.ok(wv.has(n),`wld vlan ${n}`));
});

const PP={meta:{tool:'VCF 9.1 Web Planner',version:'1.9.1.002'},globalSettings:{vcfVersion:'9.1.0.0',siteName:'sfo'},sizing:{},form:{
  vcfVersion:'9.1.0.0',deploymentType:'VMware Cloud Foundation',deploymentRegion:'sfo',deploymentInstance:'m01',domainName:'rainpole.io',subDomainName:'sfo.rainpole.io',
  dnsServer1:'10.11.10.4',dnsServer2:'10.11.10.5',ntpServer1:'ntp0.sfo.rainpole.io',
  deploymentScale:C.SCALE_VSAN_STRETCHED,vsanStretchInclude:'Include',mgmtHostCount:'4',mgmtAz2HostCount:'4',principalStorage:'vSAN-ESA',
  nsxMgrCount:'NSX Management Cluster (3 nodes)',nsxEdgeInclude:'Include',vcfMgmtInclude:'Exclude',vcfOpsHaMode:'HA Cluster',vcfOpsCollectorInclude:'Include',
  vcfLogsInclude:'Include',vcfLogsReplicaCount:'3',vcfNetOpsInclude:'Include',idBrokerInclude:'Include',aviInclude:'Exclude',
  vcfSvcRangeStart:'10.11.10.31',vcfSvcRangeEnd:'10.11.10.60',vcfAutoRangeStart:'10.11.10.61',vcfAutoRangeEnd:'10.11.10.65',
  esxMgmtVlan:'1111',esxMgmtGateway:'10.11.11.1',esxMgmtCidr:'10.11.11.0/24',vmMgmtVlan:'1110',vmMgmtCidr:'10.11.10.0/24',vmMgmtGateway:'10.11.10.1',
  vmotionVlan:'1112',vmotionCidr:'10.11.12.0/24',vmotionIpStart:'10.11.12.101',vmotionIpEnd:'10.11.12.104',
  az2EsxMgmtVlan:'1211',az2EsxMgmtCidr:'10.12.11.0/24',az2OverlayVlan:'1214',nsxEdgeUplink1Vlan:'1117',
  vcfSddcFqdn:'sfo-vcf01.sfo.rainpole.io',vcfSddcIp:'10.11.10.13',vcMgmtFqdn:'sfo-m01-vc01.sfo.rainpole.io',vcMgmtIp:'10.11.10.70',
  nsxVipFqdn:'sfo-m01-nsx01.sfo.rainpole.io',nsxVipIp:'10.11.10.71',vcfOpsCollectorFqdn:'sfo-cp01.sfo.rainpole.io',vcfOpsCollectorIp:'10.11.10.80',
  vcfAutoFqdn:'flt-auto01.rainpole.io',vcfAutoIp:'10.11.10.90',
  m01Host1Fqdn:'sfo01-m01-r01-esx01.sfo.rainpole.io',m01Host1Ip:'10.11.11.101',az2Host1Fqdn:'sfo02-m01-r01-esx01.sfo.rainpole.io',az2Host1Ip:'10.12.11.101',
  wldInclude:'Exclude',bgpAsn:'65101',m01Host1Pw:'secret',
}};

test('P&P JSON import → Network Planner state + rows', ()=>{
  assert.equal(C.isPlanningPrepExport(PP),true);
  assert.equal(C.isPlanningPrepExport({project:{},managementDomain:{},vlans:[],appliances:[]}),false);
  const r=C.planningPrepToState(clone(PP));
  assert.equal(r.project.vcfVersion,'9.1'); assert.equal(r.project.siteCode,'sfo'); assert.equal(r.project.parentDomain,'rainpole.io');
  assert.equal(r.project.fqdnSuffix,'sfo.rainpole.io'); assert.deepEqual(r.project.dnsServers,['10.11.10.4','10.11.10.5']);
  const m=r.managementDomain;
  assert.equal(m.topologyMode,'vsan-stretched'); assert.equal(m.az1HostCount,4); assert.equal(m.az2HostCount,4);
  assert.equal(m.logMgmtExtraReplicas,2); assert.equal(m.svcRuntimeRangeStart,'10.11.10.31');
  assert.equal(m.vcfaRangeStart,'10.11.10.61'); assert.equal(m.vcfaRangeEnd,'10.11.10.65');
  assert.equal(r.workloadDomains.length,0);
  const R=rows(m,r.project,r.workloadDomains);
  C.applyPlanningPrepEdits(r.edits,R,r.report,undefined);
  const v=n=>R.vlans.find(x=>x.vlanName===n);
  assert.equal(v('ESXi Management — AZ1').vlanId,'1111'); assert.equal(v('ESXi Management — AZ2').cidr,'10.12.11.0/24');
  assert.equal(v('Management VM Network').gateway,'10.11.10.1'); assert.equal(v('vMotion — AZ1').rangeEnd,'10.11.12.104');
  assert.equal(v('NSX Host TEP — AZ2').vlanId,'1214'); assert.equal(v('NSX Edge Uplink 1').vlanId,'1117');
  const a=n=>R.appliances.find(x=>x.applianceName===n);
  assert.equal(a('sddc-manager-01').fqdn,'sfo-vcf01.sfo.rainpole.io'); assert.equal(a('vcenter-mgmt-01').ipAddress,'10.11.10.70');
  assert.equal(a('vcf-ops-cloud-proxy-01').ipAddress,'10.11.10.80');
  assert.equal(R.vips.find(x=>x.vipName==='NSX Manager VIP').ipAddress,'10.11.10.71');
  assert.equal(R.vips.find(x=>x.vipName==='VCF Automation VIP').fqdn,'flt-auto01.rainpole.io');
  assert.equal(R.hosts[0].fqdn,'sfo01-m01-r01-esx01.sfo.rainpole.io');
  assert.equal(R.hosts[4].ipAddress,'10.12.11.101'); assert.equal(R.hosts[4].az,'AZ2');
  // report: BGP listed as ignored, passwords never echoed
  const sk=JSON.stringify(r.report.skipped);
  assert.ok(sk.includes('bgpAsn')); assert.ok(!sk.includes('secret')); assert.ok(!JSON.stringify(r.report.applied).includes('secret'));
});

test('P&P import: vMSC topology, storage and AZ2 rows', ()=>{
  const d=clone(PP); d.form.deploymentScale=C.SCALE_VMSC; d.form.vsanStretchInclude='Exclude'; d.form.principalStorage='NFSv3';
  const r=C.planningPrepToState(d);
  assert.equal(r.managementDomain.topologyMode,'stretched'); assert.equal(r.managementDomain.storageType,'nfs');
  assert.ok(r.report.skipped.some(s=>/az2Host1/.test(s.path)));
});

test('P&P import: legacy vcfAutoIpPool1..5 and cloudProxy fields still read', ()=>{
  const d=clone(PP);
  delete d.form.vcfAutoRangeStart; delete d.form.vcfAutoRangeEnd;
  Object.assign(d.form,{vcfAutoIpPool1:'10.11.10.71',vcfAutoIpPool2:'10.11.10.72',vcfAutoIpPool3:'10.11.10.73',vcfAutoIpPool4:'10.11.10.74',vcfAutoIpPool5:'10.11.10.75'});
  delete d.form.vcfOpsCollectorFqdn; delete d.form.vcfOpsCollectorIp;
  Object.assign(d.form,{cloudProxyFqdn:'sfo-m01-cpxy01.sfo.rainpole.io',cloudProxyIp:'10.11.10.81'});
  const r=C.planningPrepToState(d);
  assert.equal(r.managementDomain.vcfaRangeStart,'10.11.10.71'); assert.equal(r.managementDomain.vcfaRangeEnd,'10.11.10.75');
  assert.ok(!r.report.skipped.some(s=>/vcfAutoIpPool/.test(s.path)));
  const R=rows(r.managementDomain,r.project,r.workloadDomains);
  C.applyPlanningPrepEdits(r.edits,R,r.report,undefined);
  assert.equal(R.appliances.find(x=>x.applianceName==='vcf-ops-cloud-proxy-01').ipAddress,'10.11.10.81');
  // From / To wins over legacy fields when both are present
  const both=clone(PP); both.form.vcfAutoIpPool1='10.11.10.99';
  const rb=C.planningPrepToState(both);
  assert.equal(rb.managementDomain.vcfaRangeStart,'10.11.10.61');
  assert.ok(rb.report.skipped.some(s=>/vcfAutoIpPool/.test(s.path)));
});
