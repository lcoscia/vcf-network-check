// Import of a "VCF Planning & Preparation" project JSON (sibling tool — Export JSON → { meta, globalSettings, form,
// sizing }) into the Network Planner. Reverse of that tool's core/np-import.js mapping (Network Planner export → P&P
// form). Pure module: planningPrepToState() returns the new project / domains plus row edits, then
// applyPlanningPrepEdits() writes those edits onto the generated VLAN / appliance / VIP / host rows. Both fill a
// report { applied:[{path,target,value}], skipped:[{path,reason}] } shown after the import.

import { DEFAULT_PROJECT, DEFAULT_MGMT } from './data.js?v=1.31.0';
import { defaultWorkloadDomain } from './reference.js?v=1.31.0';

export const SCALE_VSAN_STRETCHED='Stretched cluster — vSAN stretched (2 AZ + witness)';
export const SCALE_VMSC='Stretched cluster — vMSC (stretch all L2, VMFS-FC / NFSv3)';

export function isPlanningPrepExport(d){
  return !!(d&&typeof d==='object'&&d.form&&typeof d.form==='object'&&!d.managementDomain);
}

const has=v=>v!==undefined&&v!==null&&String(v).trim()!=='';
const str=v=>String(v).trim();
const clone=o=>JSON.parse(JSON.stringify(o));
const ipToN=ip=>{const p=String(ip||'').trim().split('.').map(Number);return p.length===4&&p.every(x=>Number.isInteger(x)&&x>=0&&x<=255)?((p[0]*256+p[1])*256+p[2])*256+p[3]:null;};

// P&P network prefix → Network Planner VLAN row (domain 'mgmt' or 'wld' = first workload domain), as in np-import.js.
export const PP_VLANS=[
  ['esxMgmt',    'mgmt', /^ESXi Management( — AZ1)?$/],
  ['vmMgmt',     'mgmt', /^Management VM Network$/],
  ['vcfMgmt',    'mgmt', /^VCF Management Services Runtime$/],
  ['vmotion',    'mgmt', /^vMotion( — AZ1)?$/],
  ['vsan1',      'mgmt', /^vSAN( — AZ1)?$/],
  ['overlay',    'mgmt', /^NSX Host TEP( — AZ1)?$/],
  ['nfs',        'mgmt', /^NFS Storage$/],
  ['az2EsxMgmt', 'mgmt', /^ESXi Management — AZ2$/],
  ['az2Vmotion', 'mgmt', /^vMotion — AZ2$/],
  ['az2Vsan',    'mgmt', /^vSAN — AZ2$/],
  ['az2Overlay', 'mgmt', /^NSX Host TEP — AZ2$/],
  ['edgeTep',    'mgmt', /^NSX Edge TEP$/],
  ['nsxEdgeUplink1', 'mgmt', /^NSX Edge Uplink 1$/],
  ['nsxEdgeUplink2', 'mgmt', /^NSX Edge Uplink 2$/],
  ['wldEsxMgmt', 'wld',  /^ESXi Management( — AZ1)?$/],
  ['wldVmMgmt',  'wld',  /^VM \/ Application Network$/],
  ['wldVmotion', 'wld',  /^vMotion( — AZ1)?$/],
  ['wldVsan',    'wld',  /^vSAN( — AZ1)?$/],
  ['wldOverlay', 'wld',  /^NSX Host TEP( — AZ1)?$/],
  ['wldNfs',     'wld',  /^NFS Storage$/],
];
const VLAN_FIELDS=[['Vlan','vlanId'],['Gateway','gateway'],['Cidr','cidr'],['IpStart','rangeStart'],['IpEnd','rangeEnd']];

// P&P [fqdn key, ip key] → Network Planner applianceName (reverse of np-import.js APPLIANCES).
export const PP_APPLIANCES=[
  ['vcfSddcFqdn','vcfSddcIp','sddc-manager-01'],
  ['vcMgmtFqdn','vcMgmtIp','vcenter-mgmt-01'],
  ['nsxMgr1Fqdn','nsxMgr1Ip','nsx-manager-mgmt-01'],
  ['nsxMgr2Fqdn','nsxMgr2Ip','nsx-manager-mgmt-02'],
  ['nsxMgr3Fqdn','nsxMgr3Ip','nsx-manager-mgmt-03'],
  ['nsxEdge1Fqdn','nsxEdge1Ip','nsx-edge-mgmt-01'],
  ['nsxEdge2Fqdn','nsxEdge2Ip','nsx-edge-mgmt-02'],
  ['vcfOpsPrimaryFqdn','vcfOpsPrimaryIp','vcf-ops-01'],
  ['vcfOpsReplicaFqdn','vcfOpsReplicaIp','vcf-ops-02'],
  ['vcfOpsDataFqdn','vcfOpsDataIp','vcf-ops-03'],
  ['fleetComponentsFqdn','fleetComponentsIp','fleet-01'],
  ['instanceComponentsFqdn','instanceComponentsIp','mgmt-instance-01'],
  ['vcfSvcRuntimeFqdn','vcfSvcRuntimeIp','vcf-svc-runtime'],
  ['licenseServerFqdn','licenseServerIp','vcf-license-server-01'],
  ['idBrokerFqdn','idBrokerIp','vcf-identity-broker-01'],
  ['vcfAutoSvcRuntimeFqdn','vcfAutoSvcRuntimeIp','vcf-automation-svcruntime-01'],
  ['vsanWitnessHost','vsanWitnessIp','vsan-witness-mgmt'],
  ['aviCtrl1Fqdn','aviCtrl1Ip','avi-controller-01'],
  ['aviCtrl2Fqdn','aviCtrl2Ip','avi-controller-02'],
  ['aviCtrl3Fqdn','aviCtrl3Ip','avi-controller-03'],
  ['wldVcFqdn','wldVcIp','vcenter-wld-01-01'],
];
export const PP_VIPS=[
  ['nsxVipFqdn','nsxVipIp','NSX Manager VIP'],
  ['vcfOpsLbFqdn','vcfOpsLbIp','VCF Operations VIP'],
  ['vcfLogsFqdn','vcfLogsIp','VCF Log Management VIP'],
  ['aviClusterFqdn','aviClusterIp','AVI Controller Cluster VIP'],
  ['wldNsxVipFqdn','wldNsxVipIp','WLD-01 NSX Manager VIP'],
];

// Step 1 — P&P JSON → Network Planner project / domains + pending row edits.
export function planningPrepToState(d){
  const f=d.form||{};
  const report={source:'VCF Planning & Preparation JSON',applied:[],skipped:[]};
  const ok=(path,target,value)=>report.applied.push({path,target,value:String(value)});
  const skip=(path,reason)=>report.skipped.push({path,reason});
  const project=clone(DEFAULT_PROJECT);
  const mgmt=clone(DEFAULT_MGMT);
  const used=new Set();
  const get=k=>{used.add(k);return has(f[k])?str(f[k]):'';};

  // ── Project ──
  const ver=get('vcfVersion')||str(d.globalSettings?.vcfVersion||'');
  if(ver){
    const v=/^9\.1\.1/.test(ver)?'9.1.1':/^9\.1/.test(ver)?'9.1':/^9\.0/.test(ver)?'9.0':'';
    if(v){project.vcfVersion=v;ok('form.vcfVersion','project.vcfVersion',v);} else skip('form.vcfVersion',`version ${ver} unknown`);
  }
  if(/vSphere Foundation/i.test(get('deploymentType'))) skip('form.deploymentType','VMware vSphere Foundation has no Network Planner scenario — planned as VCF');
  const site=get('deploymentRegion')||get('primarySiteName');
  if(site){project.siteCode=site.toLowerCase();ok('form.deploymentRegion','project.siteCode',project.siteCode);}
  const inst=get('deploymentInstance');
  if(inst){project.instanceName=inst.toLowerCase();ok('form.deploymentInstance','project.instanceName',project.instanceName);}
  const parent=get('domainName');
  if(parent){project.parentDomain=parent.toLowerCase();ok('form.domainName','project.parentDomain',project.parentDomain);}
  const child=get('subDomainName');
  if(child){project.fqdnSuffix=child.toLowerCase();ok('form.subDomainName','project.fqdnSuffix',project.fqdnSuffix);}
  const dns=[get('dnsServer1'),get('dnsServer2')].filter(Boolean);
  if(dns.length){project.dnsServers=dns;ok('form.dnsServer1/2','project.dnsServers',dns.join(', '));}
  const ntp=[get('ntpServer1'),get('ntpServer2')].filter(Boolean);
  if(ntp.length){project.ntpServers=ntp;ok('form.ntpServer1/2','project.ntpServers',ntp.join(', '));}
  if(has(d.globalSettings?.siteName)&&!project.projectName){project.projectName=str(d.globalSettings.siteName);}

  // ── Topology / hosts ──
  const scale=get('deploymentScale');
  const stretchInc=get('vsanStretchInclude');
  let topo='single-site';
  if(scale===SCALE_VMSC) topo='stretched';
  else if(scale===SCALE_VSAN_STRETCHED||stretchInc==='Include') topo='vsan-stretched';
  if(scale||stretchInc){mgmt.topologyMode=topo;ok('form.deploymentScale','managementDomain.topologyMode',topo);}
  if(/^Consolidated/.test(scale)){project.scenario='consolidated-3node-vsan-esa';ok('form.deploymentScale','project.scenario',project.scenario);}
  const n=x=>{const v=parseInt(x,10);return Number.isFinite(v)&&v>0?v:0;};
  const az1=n(get('mgmtHostCount')), az2=n(get('mgmtAz2HostCount'))||az1;
  if(az1){
    if(topo==='single-site'){mgmt.hostCount=az1;ok('form.mgmtHostCount','managementDomain.hostCount',az1);}
    else{mgmt.az1HostCount=az1;mgmt.az2HostCount=az2;mgmt.hostCount=az1+az2;ok('form.mgmtHostCount','managementDomain.az1HostCount',az1);ok('form.mgmtAz2HostCount','managementDomain.az2HostCount',az2);}
  }
  const storage=get('principalStorage');
  if(storage){
    const s=/^vSAN-ESA/i.test(storage)?'vsan-esa':/^vSAN-OSA/i.test(storage)?'vsan-osa':/^VMFS/i.test(storage)?'vmfs':/^NFS/i.test(storage)?'nfs':'';
    if(s){mgmt.storageType=s;ok('form.principalStorage','managementDomain.storageType',s);} else skip('form.principalStorage',`"${storage}" unknown`);
  }

  // ── Components ──
  const inc=(k,path,apply)=>{const v=get(k);if(v==='Include'||v==='Exclude'){apply(v==='Include');ok(`form.${k}`,path,v);}};
  const nsxMgr=get('nsxMgrCount');
  if(nsxMgr){mgmt.nsxManagerMode=/3 nodes|Cluster/i.test(nsxMgr)?'clustered':'standalone';ok('form.nsxMgrCount','managementDomain.nsxManagerMode',mgmt.nsxManagerMode);}
  inc('nsxEdgeInclude','managementDomain.nsxEdgeDeployed',b=>{mgmt.nsxEdgeDeployed=b;if(b)mgmt.nsxEdgeNodeCount=2;});
  inc('vcfMgmtInclude','managementDomain.fleetPlacement',b=>{mgmt.fleetPlacement=b?'dedicated-fleet-vlan':'shared-mgmt-vlan';});
  const opsMode=get('vcfOpsHaMode');
  if(opsMode){mgmt.vcfOperations.mode=opsMode==='HA Cluster'?'enterprise':'standalone';ok('form.vcfOpsHaMode','managementDomain.vcfOperations.mode',mgmt.vcfOperations.mode);}
  inc('vcfOpsCollectorInclude','managementDomain.vcfOperations.cloudProxyEnabled',b=>{mgmt.vcfOperations.cloudProxyEnabled=b;});
  inc('vcfLogsInclude','managementDomain.vcfOperationsForLogs.enabled',b=>{mgmt.vcfOperationsForLogs.enabled=b;});
  const rep=n(get('vcfLogsReplicaCount'));
  if(rep){mgmt.logMgmtExtraReplicas=Math.max(0,rep-1);ok('form.vcfLogsReplicaCount','managementDomain.logMgmtExtraReplicas',mgmt.logMgmtExtraReplicas);}
  inc('vcfNetOpsInclude','managementDomain.vcfOperationsForNetworks.enabled',b=>{mgmt.vcfOperationsForNetworks.enabled=b;});
  const idb=get('idBrokerInclude');
  if(idb==='Include'){mgmt.vcfIdentityBroker.enabled=true;mgmt.vcfIdentityBroker.mode='appliance';ok('form.idBrokerInclude','managementDomain.vcfIdentityBroker.mode','appliance');}
  else if(idb==='Exclude') skip('form.idBrokerInclude','Exclude = embedded or not deployed in P&P — Network Planner Identity Broker setting left unchanged');
  inc('aviInclude','managementDomain.aviDeployed',b=>{mgmt.aviDeployed=b;});

  // ── Management Services / VCF Automation ranges ──
  const s0=get('vcfSvcRangeStart'), s1=get('vcfSvcRangeEnd');
  if(s0){mgmt.svcRuntimeRangeStart=s0;ok('form.vcfSvcRangeStart','managementDomain.svcRuntimeRangeStart',s0);}
  if(s1){mgmt.svcRuntimeRangeEnd=s1;ok('form.vcfSvcRangeEnd','managementDomain.svcRuntimeRangeEnd',s1);}
  const pool=[1,2,3,4,5].map(i=>get(`vcfAutoIpPool${i}`)).filter(ip=>ipToN(ip)!==null);
  if(pool.length){
    const ns=pool.map(ipToN), lo=Math.min(...ns), hi=Math.max(...ns);
    mgmt.vcfaRangeStart=pool[ns.indexOf(lo)]; mgmt.vcfaRangeEnd=pool[ns.indexOf(hi)];
    ok('form.vcfAutoIpPool1..5','managementDomain.vcfaRangeStart/End',`${mgmt.vcfaRangeStart} – ${mgmt.vcfaRangeEnd}`);
    if(hi-lo+1!==5) skip('form.vcfAutoIpPool1..5',`VCF Automation pool spans ${hi-lo+1} addresses (expected 5: 3 active + 2 buffer) — imported as the range lowest → highest`);
  }
  if(get('cloudProxyFqdn')&&get('vcfOpsCollectorFqdn')) skip('form.cloudProxyFqdn','P&P has both a Cloud Proxy and a VCF Operations Collector FQDN — Network Planner has one Cloud Proxy row: the Collector value is used');

  // ── Workload domain ──
  const wldInc=get('wldInclude');
  const workloadDomains=wldInc==='Exclude'?[]:[defaultWorkloadDomain(1)];
  if(wldInc) ok('form.wldInclude','workloadDomains',wldInc==='Exclude'?'none':'1');
  const wldStorage=get('wldStorageType');
  if(workloadDomains[0]&&wldStorage){
    const s=/^vSAN-ESA/i.test(wldStorage)?'vsan-esa':/^vSAN-OSA/i.test(wldStorage)?'vsan-osa':/^VMFS/i.test(wldStorage)?'vmfs':/^NFS/i.test(wldStorage)?'nfs':'';
    if(s){workloadDomains[0].storageType=s;ok('form.wldStorageType','workloadDomains[0].storageType',s);}
  }
  if(get('wldName')) skip('form.wldName',`kept Network Planner domain name "${workloadDomains[0]?.domainName||'—'}" (row names such as "WLD-01 NSX Manager VIP" depend on it)`);
  project.workloadDomainCount=workloadDomains.length;

  // ── Row edits (resolved against the generated rows in applyPlanningPrepEdits) ──
  const vlans=[];
  PP_VLANS.forEach(([pre,dom,re])=>{
    const fields={};
    VLAN_FIELDS.forEach(([suf,key])=>{const v=get(pre+suf);if(v)fields[key]=v;});
    // P&P edge uplinks also live in edge{1,2}UplinkVlan{n}; nsxEdgeUplink{n}Vlan is the canonical one.
    if(Object.keys(fields).length) vlans.push({prefix:pre,dom,re,fields});
  });
  const appliances=[], vips=[];
  const pair=(fk,ik)=>({fqdn:get(fk),ipAddress:get(ik)});
  PP_APPLIANCES.forEach(([fk,ik,name])=>{const e=pair(fk,ik);if(e.fqdn||e.ipAddress)appliances.push({name,keys:`${fk}/${ik}`,...e});});
  PP_VIPS.forEach(([fk,ik,name])=>{const e=pair(fk,ik);if(e.fqdn||e.ipAddress)vips.push({name,keys:`${fk}/${ik}`,...e});});
  // Merged on the P&P side: one "VCF Operations Collector" field = NP Cloud Proxy (9.1) / first Remote Collector (9.0).
  const col={fqdn:get('vcfOpsCollectorFqdn')||get('cloudProxyFqdn'),ipAddress:get('vcfOpsCollectorIp')||get('cloudProxyIp')};
  if(col.fqdn||col.ipAddress) appliances.push({name:['vcf-ops-cloud-proxy-01','vcf-ops-rc-01'],keys:'vcfOpsCollectorFqdn/Ip',...col});
  // VCF Automation: one FQDN/IP in P&P — NP VIP row when present, otherwise the appliance row.
  const auto={fqdn:get('vcfAutoFqdn'),ipAddress:get('vcfAutoIp')};
  if(auto.fqdn||auto.ipAddress) vips.push({name:'VCF Automation VIP',fallbackAppliance:'vcf-automation-01',keys:'vcfAutoFqdn/Ip',...auto});
  const nets={fqdn:get('vcfNetOpsFqdn'),ipAddress:get('vcfNetOpsPlatformIpv4')||get('vcfNetOpsIp')};
  if(nets.fqdn||nets.ipAddress) appliances.push({name:'vcf-nets-platform-01',keys:'vcfNetOpsFqdn/PlatformIpv4',...nets});
  const netc=get('vcfNetOpsCollectorIpv4');
  if(netc) appliances.push({name:'vcf-nets-collector-01',keys:'vcfNetOpsCollectorIpv4',fqdn:'',ipAddress:netc});
  get('sddcHostname');

  const hosts=[];
  for(let i=1;i<=16;i++){
    const m=pair(`m01Host${i}Fqdn`,`m01Host${i}Ip`);
    if(m.fqdn||m.ipAddress) hosts.push({dom:'mgmt',index:i,keys:`m01Host${i}`,...m});
    const a=pair(`az2Host${i}Fqdn`,`az2Host${i}Ip`);
    if(a.fqdn||a.ipAddress){
      if(topo==='vsan-stretched') hosts.push({dom:'mgmt',index:(mgmt.az1HostCount||0)+i,keys:`az2Host${i}`,...a});
      else skip(`form.az2Host${i}`,'AZ2 host rows only exist for a vSAN stretched cluster');
    }
    const w=pair(`w01Host${i}Fqdn`,`w01Host${i}Ip`);
    if(w.fqdn||w.ipAddress) hosts.push({dom:'wld',index:i,keys:`w01Host${i}`,...w});
  }

  // Everything else of the P&P form (passwords, VDS, BGP, sizing, licences…) has no Network Planner field.
  const rest=Object.keys(f).filter(k=>!used.has(k)&&!k.startsWith('_')&&has(f[k])&&!/Pw$|Password|Mtu$/.test(k)&&!/^edge[12]UplinkVlan/.test(k));
  if(rest.length) skip(`form (${rest.length} fields)`,`no Network Planner equivalent: ${rest.slice(0,25).join(', ')}${rest.length>25?'…':''}`);

  return {project,managementDomain:mgmt,workloadDomains,edits:{vlans,appliances,vips,hosts},report};
}

// Step 2 — writes the pending edits onto the generated rows (after the planner rebuilt them from the new state).
// Never creates rows: a value whose row does not exist in this design is reported as skipped.
export function applyPlanningPrepEdits(edits,rows,report,wldName){
  const ok=(path,target,value)=>report.applied.push({path,target,value:String(value)});
  const skip=(path,reason)=>report.skipped.push({path,reason});
  const domOf=dom=>dom==='mgmt'?'Management Domain':wldName;
  edits.vlans.forEach(e=>{
    const domain=domOf(e.dom);
    const row=domain&&rows.vlans.find(v=>v.domain===domain&&e.re.test(v.vlanName));
    if(!row){skip(`form.${e.prefix}*`,`no matching VLAN row in this design (${e.dom==='wld'?'workload domain':'Management Domain'}: ${e.re.source.replace(/[\\^$]/g,'')})`);return;}
    Object.entries(e.fields).forEach(([k,v])=>{row[k]=v;ok(`form.${e.prefix}${VLAN_FIELDS.find(x=>x[1]===k)[0]}`,`vlans[${row.vlanName}].${k}`,v);});
  });
  const setRow=(row,e,label)=>{
    if(e.fqdn){row.fqdn=e.fqdn;ok(`form.${e.keys}`,`${label}.fqdn`,e.fqdn);}
    if(e.ipAddress){row.ipAddress=e.ipAddress;ok(`form.${e.keys}`,`${label}.ipAddress`,e.ipAddress);}
  };
  edits.appliances.forEach(e=>{
    const names=[].concat(e.name);
    const row=names.map(n=>rows.appliances.find(a=>a.applianceName===n)).find(Boolean);
    if(row) setRow(row,e,`appliances[${row.applianceName}]`);
    else skip(`form.${e.keys}`,`no "${names.join('" / "')}" row in this design (component not enabled?)`);
  });
  edits.vips.forEach(e=>{
    const row=rows.vips.find(v=>v.vipName===e.name);
    if(row){setRow(row,e,`vips[${e.name}]`);return;}
    const app=e.fallbackAppliance&&rows.appliances.find(a=>a.applianceName===e.fallbackAppliance);
    if(app) setRow(app,e,`appliances[${app.applianceName}]`);
    else skip(`form.${e.keys}`,`no "${e.name}" row in this design (component not enabled?)`);
  });
  edits.hosts.forEach(e=>{
    const domain=domOf(e.dom);
    const row=domain&&rows.hosts.find(h=>h.domain===domain&&h.index===e.index);
    if(row) setRow(row,e,`hosts[${row.hostName}]`);
    else skip(`form.${e.keys}`,'beyond the host count of this domain');
  });
  return report;
}
