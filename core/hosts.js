// Pure ESXi host inventory: one row per host (FQDN + management vmk0 IP), per domain and AZ.
//
// The VCF 9.1 P&P workbook lists hosts by FQDN ("Host #1..#16 FQDN") and VCF Installer resolves them through DNS,
// so each host needs a forward/reverse DNS record on the ESXi Management network. vMotion, vSAN, NFS and NSX host
// TEP addresses are NOT per-host inputs: SDDC Manager hands them out from the network pool / IP pool ranges of the
// matching VLANs (VLAN Design tab), so they are not itemized here.

import { effectiveHostCount, isStretchedTopology, azNetworkMode } from './data.js?v=1.29.0';

function slug(s){ return String(s).toLowerCase().replace(/[^a-z0-9-]+/g,'-').replace(/-+/g,'-').replace(/^-|-$/g,''); }

function domainHosts(d, domainName, prefix){
  const stretched=isStretchedTopology(d.topologyMode);
  const perAZ=azNetworkMode(d,'hostMgmt')==='per-az';
  const total=effectiveHostCount(d), az1=stretched?(Number(d.az1HostCount)||0):total;
  const rows=[];
  for(let i=1;i<=total;i++){
    const az=stretched?(i<=az1?'AZ1':'AZ2'):'';
    rows.push({
      id:`host-${slug(domainName)}-${i}`,
      domain:domainName, index:i, az,
      hostName:`${prefix}-${String(i).padStart(2,'0')}`,
      vlan:perAZ?`ESXi Management — ${az}`:'ESXi Management',
      ipAddress:'', fqdn:'',
    });
  }
  return rows;
}

export function buildHostInventory(mgmt, workloadDomains=[]){
  return [
    ...domainHosts(mgmt,'Management Domain','esx-mgmt'),
    ...workloadDomains.flatMap(w=>domainHosts(w,w.domainName,`esx-${slug(w.domainName)}`)),
  ];
}
