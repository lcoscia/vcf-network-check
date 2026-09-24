// Pure per-subnet IP map: classifies every address of a VLAN CIDR (network/broadcast, gateway, reserved ranges,
// assigned appliance/VIP/host IPs, duplicates, free) for the VLAN Design tab's IP map.

import { ipToInt, intToIp, parseCidr, gatewayIP } from './iprange.js?v=1.29.0';

export const IP_MAP_MAX = 1024; // up to a /22 is drawn cell by cell

// assigned: [{ip, label}] (every planned IP of the project); ranges: [{start, end, label, kind}]
export function buildIpMap(vlan, assigned=[], ranges=[]){
  const c=parseCidr(vlan?.cidr);
  if(!c) return {error:'no-cidr', cells:[]};
  if(c.size>IP_MAP_MAX) return {error:'too-large', size:c.size, cells:[]};
  const gw=ipToInt(gatewayIP(vlan.gateway));
  const byIp=new Map();
  assigned.forEach(a=>{ const n=ipToInt(a.ip); if(n===null)return; if(!byIp.has(n))byIp.set(n,[]); byIp.get(n).push(a.label); });
  const rs=ranges.map(r=>({...r,s:ipToInt(r.start),e:ipToInt(r.end)})).filter(r=>r.s!==null&&r.e!==null);
  const cells=[];
  const stats={free:0,assigned:0,reserved:0,conflict:0};
  for(let n=c.network;n<=c.broadcast;n++){
    const labels=byIp.get(n)||[];
    // Reserved ranges (kind 'reserved') win over the VLAN's own allocation range (kind 'pool'); only a reserved range
    // makes an assigned IP a conflict — the VLAN range is exactly where appliance/host IPs are expected.
    const inRange=rs.filter(r=>n>=r.s&&n<=r.e);
    const range=inRange.find(r=>r.kind!=='pool')||inRange[0];
    let kind, label;
    if(c.prefix<=30&&(n===c.network||n===c.broadcast)){ kind='edge'; label=n===c.network?'network':'broadcast'; }
    else if(n===gw){ kind='gateway'; label='gateway'; }
    else kind=null;
    if(labels.length>1||(labels.length&&(kind||(range&&range.kind!=='pool')))){ kind='conflict'; label=[...labels,label||range?.label].filter(Boolean).join(' / '); stats.conflict++; }
    else if(labels.length){ kind='assigned'; label=labels[0]; stats.assigned++; }
    else if(!kind&&range){ kind=range.kind||'reserved'; label=range.label; stats.reserved++; }
    else if(!kind){ kind='free'; label=''; stats.free++; }
    cells.push({ip:intToIp(n), last:n&255, kind, label});
  }
  return {cells, stats, size:c.size};
}
