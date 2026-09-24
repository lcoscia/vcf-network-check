// Pure IPv4 range utilities: parsing, arithmetic, and consecutive-address generation.

export function ipToInt(ip){
  const m=/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec((ip||'').trim());
  if(!m) return null;
  const parts=m.slice(1,5).map(Number);
  if(parts.some(o=>o<0||o>255)) return null;
  return ((parts[0]<<24)>>>0)+(parts[1]<<16)+(parts[2]<<8)+parts[3];
}

export function intToIp(n){
  return [(n>>>24)&255,(n>>>16)&255,(n>>>8)&255,n&255].join('.');
}

export function generateIPRange(rangeStart, count){
  const start=ipToInt(rangeStart);
  if(start===null || count<=0) return {addresses:[],truncated:start===null};
  const addresses=[];
  for(let i=0;i<count;i++) addresses.push(intToIp(start+i));
  return {addresses,truncated:false};
}

export function computeRangeEnd(rangeStart, requiredIPs){
  const start=ipToInt(rangeStart);
  if(start===null||!requiredIPs||requiredIPs<=0) return '';
  return intToIp(start+requiredIPs-1);
}

// Number of addresses between rangeStart and rangeEnd inclusive. Returns 0 if either bound is invalid/empty,
// or if end < start (invalid range) — never negative, never NaN.
export function rangeSize(rangeStart, rangeEnd){
  const start=ipToInt(rangeStart), end=ipToInt(rangeEnd);
  if(start===null||end===null||end<start) return 0;
  return end-start+1;
}

export function ipInCidr(ip, cidr){
  const m=/^(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\/(\d{1,2})$/.exec((cidr||'').trim());
  if(!m) return null;
  const network=ipToInt(m[1]); const prefix=Number(m[2]);
  const target=ipToInt(ip);
  if(network===null||target===null||prefix<0||prefix>32) return null;
  const mask=prefix===0?0:(~0<<(32-prefix))>>>0;
  return (network&mask)===(target&mask);
}

// Completes a partial IP typed in the Appliances/VIPs tabs against the VLAN CIDR. The typed octets replace the
// trailing octets of the network address: "25" in 10.0.1.0/24 → 10.0.1.25, "1.25" in 10.0.0.0/22 → 10.0.1.25.
// A full IPv4 is returned unchanged but still checked against the CIDR. Returns {ip, error} where error is one of
// 'invalid' | 'no-cidr' | 'outside' | 'network' | 'broadcast' (ip is '' whenever error is set, except 'outside'
// on a full IP, where the value is kept as typed and only flagged).
export function expandHostIP(input, cidr){
  const raw=(input||'').trim().replace(/^\./,'');
  if(!raw) return {ip:'',error:null};
  const m=/^(\d{1,3}(?:\.\d{1,3}){3})\/(\d{1,2})$/.exec((cidr||'').trim());
  const net=m?ipToInt(m[1]):null; const prefix=m?Number(m[2]):null;
  const hasCidr=net!==null&&prefix!==null&&prefix<=32;
  const mask=hasCidr?(prefix===0?0:(~0<<(32-prefix))>>>0):0;
  let target=ipToInt(raw);
  const isFull=target!==null;
  if(!isFull){
    if(!/^\d{1,3}(?:\.\d{1,3}){0,2}$/.test(raw)) return {ip:'',error:'invalid'};
    if(!hasCidr) return {ip:'',error:'no-cidr'};
    const parts=raw.split('.').map(Number);
    if(parts.some(o=>o>255)) return {ip:'',error:'invalid'};
    const base=intToIp((net&mask)>>>0).split('.').map(Number);
    target=ipToInt([...base.slice(0,4-parts.length),...parts].join('.'));
  }
  if(!hasCidr) return {ip:raw,error:null};
  const network=(net&mask)>>>0, broadcast=(network|(~mask>>>0))>>>0;
  if(((target&mask)>>>0)!==network) return isFull?{ip:raw,error:'outside'}:{ip:'',error:'outside'};
  if(prefix<=30&&target===network) return {ip:'',error:'network'};
  if(prefix<=30&&target===broadcast) return {ip:'',error:'broadcast'};
  return {ip:intToIp(target),error:null};
}
