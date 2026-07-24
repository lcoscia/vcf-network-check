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

export function ipInCidr(ip, cidr){
  const m=/^(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\/(\d{1,2})$/.exec((cidr||'').trim());
  if(!m) return null;
  const network=ipToInt(m[1]); const prefix=Number(m[2]);
  const target=ipToInt(ip);
  if(network===null||target===null||prefix<0||prefix>32) return null;
  const mask=prefix===0?0:(~0<<(32-prefix))>>>0;
  return (network&mask)===(target&mask);
}
