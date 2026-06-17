// Pure aggregation logic: rolls up VLAN/VIP/host data into per-domain summary cards.

// ── DOMAIN SUMMARIES ─────────────────────────────────────────────
export function buildDomainSummaries(project,mgmt,workloads,vlans,vips){
  const summaries=[];
  const mgmtVlans=vlans.filter(v=>v.domain==='Management Domain');
  const services=[];
  if(mgmt.vcfOperations.enabled)services.push('VCF Operations');
  if(mgmt.vcfOperationsForLogs.enabled)services.push('VCF Ops for Logs');
  if(mgmt.vcfOperationsForNetworks.enabled)services.push('VCF Ops for Networks');
  if(mgmt.vcfAutomation.enabled)services.push('VCF Automation');
  if(mgmt.vcfIdentityBroker.enabled)services.push('VCF Identity Broker');
  if(mgmt.aviDeployed)services.push('AVI');
  if(mgmt.vksEnabled)services.push('VKS');
  summaries.push({domain:'Management Domain',domainType:'management',hostCount:mgmt.hostCount,enabledServices:services,vlanCount:mgmtVlans.length,totalIPCount:mgmtVlans.reduce((a,v)=>a+v.requiredIPs,0),vipCount:vips.filter(v=>v.domain==='Management Domain').length,notes:`${project.scenario} | ${mgmt.fleetPlacement}`});
  workloads.forEach(wld=>{
    const wVlans=vlans.filter(v=>v.domain===wld.domainName);
    const ws=[];
    if(wld.nsxEnabled)ws.push('NSX');if(wld.aviEnabled)ws.push('AVI');if(wld.vksEnabled)ws.push('VKS');if(wld.edgeRequired)ws.push('Edge');
    summaries.push({domain:wld.domainName,domainType:'workload',hostCount:wld.hostCount,enabledServices:ws,vlanCount:wVlans.length,totalIPCount:wVlans.reduce((a,v)=>a+v.requiredIPs,0),vipCount:vips.filter(v=>v.domain===wld.domainName).length,notes:wld.notes||wld.domainRole});
  });
  return summaries;
}
