// Pure CIDR-sizing calculations for VLAN subnets.
import { CIDR_TABLE, GATEWAY_SPARE } from './data.js?v=1.9.0';

export function recommendCIDR(requiredIPs, bufferEnabled=true, bufferPercent=20) {
  const withOverhead = requiredIPs + GATEWAY_SPARE;
  const effective = bufferEnabled ? Math.ceil(withOverhead*(1+bufferPercent/100)) : withOverhead;
  const match = CIDR_TABLE.find(c => c.usable >= effective);
  if (!match) return {requiredIPs,recommendedCIDR:'/20',usableHosts:4094};
  return {requiredIPs,recommendedCIDR:`/${match.prefix}`,usableHosts:match.usable};
}
