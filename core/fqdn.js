// Pure FQDN convention of the Broadcom VCF 9.1 Planning & Preparation Workbook (25-Jun-2026 samples), shared with the
// sibling "VCF Planning & Preparation" tool (core/fqdn.js there — same table, keyed here by Network Planner row names):
//   instance components   <site>-<inst>-<role>NN.<child>   sfo-m01-vc01, sfo-m01-nsx01a/b/c (VIP sfo-m01-nsx01), sfo-m01-en01
//   instance services     <site>-<role>NN.<child>          sfo-vcf01 (SDDC Manager), sfo-ic01, sfo-sr01, sfo-cp01
//   fleet components      flt-<role>NN.<parent>            flt-ops01a/b/c (LB flt-ops01), flt-fc01, flt-lc01, flt-idb01, flt-logs01…
//   ESXi hosts            <site>0<az>-<inst>-r01-esxNN.<child>   numbering restarts at 01 in AZ2; witness <site>-<inst>-cl01-vsw01
// child = project.fqdnSuffix (proposed as <site>.<parent>), parent = project.parentDomain.
// Projects without a site code keep the pre-v1.31.0 behaviour: [fqdnPrefix-]<row-name>.<fqdnSuffix>.

const clean=v=>String(v||'').trim().toLowerCase().replace(/^\.+|\.+$/g,'');
const pad2=n=>String(n).padStart(2,'0');
const letter=n=>String.fromCharCode(96+n); // 1 → a
export function fqdnSlug(name){ return String(name).toLowerCase().replace(/[^a-z0-9-]+/g,'-').replace(/-+/g,'-').replace(/^-|-$/g,''); }

// Child zone proposed from site code + parent domain ('' when either is missing/invalid).
export function proposedFqdnSuffix(project){
  const site=clean(project.siteCode), parent=clean(project.parentDomain);
  return site&&parent&&/^[a-z0-9-]+$/.test(site)?`${site}.${parent}`:'';
}

// Naming context, or null when nothing can be proposed. mode 'workbook' (site code set) or 'legacy'.
export function fqdnContext(project){
  const site=clean(project.siteCode);
  const suffix=clean(project.fqdnSuffix);
  if(site&&/^[a-z0-9-]+$/.test(site)){
    const parent=clean(project.parentDomain)||(suffix.split('.').length>=3?suffix.split('.').slice(1).join('.'):suffix);
    const child=suffix||(parent?`${site}.${parent}`:'');
    if(!child)return null;
    return {mode:'workbook',site,inst:clean(project.instanceName)||'m01',child,parent:parent||child};
  }
  if(!suffix)return null;
  return {mode:'legacy',prefix:clean(project.fqdnPrefix),child:suffix};
}

// Workload domain short name: sfo-w01 for the 1st WLD, sfo-w02… (P&P: wldName default <site>-w01).
const wldTag=(ctx,wldIndex)=>`${ctx.site}-w${pad2(wldIndex||1)}`;

// Host label of one row of the instance/fleet table. Returns [label, zone] or null (no workbook equivalent).
function workbookLabel(ctx,kind,name,row,wldIndex){
  const {site,inst}=ctx, p=`${site}-${inst}`;
  const I=l=>[l,'child'], F=l=>[l,'fleet'];
  if(kind==='hosts'){
    const az=row.az==='AZ2'?2:1;
    const n=row.azIndex||row.index||1;
    const tag=row.domain==='Management Domain'?inst:`w${pad2(wldIndex||1)}`;
    return I(`${site}0${az}-${tag}-r01-esx${pad2(n)}`);
  }
  if(kind==='vips'){
    const VIPS={
      'NSX Manager VIP':I(`${p}-nsx01`),
      'VCF Operations VIP':F('flt-ops01'),
      'VCF Log Management VIP':F('flt-logs01'),
      'VCF Operations for Logs UI VIP':F('flt-logs01'),
      'VCF Automation VIP':F('flt-auto01'),
      'VCF Identity Broker VIP':F('flt-idb01'),
      'VCF Operations for Networks VIP':F('flt-net01'),
      'Fleet VIP':F('flt-fc01'),
      'AVI Controller Cluster VIP':I(`${p}-avilb01`),
    };
    if(VIPS[name])return VIPS[name];
    const w=/ NSX Manager VIP$/.test(name)&&wldIndex?wldTag(ctx,wldIndex):null;
    return w?I(`${w}-nsx01`):null;
  }
  const FIXED={
    'sddc-manager-01':I(`${site}-vcf01`),
    'vcenter-mgmt-01':I(`${p}-vc01`),
    'vsan-witness-mgmt':I(`${p}-cl01-vsw01`),
    'fleet-01':F('flt-fc01'),
    'mgmt-instance-01':I(`${site}-ic01`),
    'vcf-svc-runtime':I(`${site}-sr01`),
    'vcf-ops-cloud-proxy-01':I(`${site}-cp01`),
    'vcf-license-server-01':F('flt-lc01'),
    'vcf-identity-broker-01':F('flt-idb01'),
    'vcf-automation-01':F('flt-auto01'),
    'vcf-automation-svcruntime-01':F('flt-vcfa-sr01'),
    'vcf-nets-platform-01':F('flt-net01a'),
    'vcf-nets-collector-01':I(`${site}-netc01`),
  };
  if(FIXED[name])return FIXED[name];
  let m;
  if((m=/^nsx-manager-mgmt-0?(\d+)$/.exec(name)))return I(`${p}-nsx01${letter(+m[1])}`);
  if((m=/^nsx-edge-mgmt-0?(\d+)$/.exec(name)))return I(`${p}-en${pad2(+m[1])}`);
  if((m=/^vcf-ops-0?(\d+)$/.exec(name)))return F(`flt-ops01${letter(+m[1])}`);
  if((m=/^vcf-ops-rc-0?(\d+)$/.exec(name)))return I(`${site}-cp${pad2(+m[1])}`);
  if((m=/^avi-controller-0?(\d+)$/.exec(name)))return I(`${p}-avi01${letter(+m[1])}`);
  if((m=/^vcf-logs-master-0?(\d+)$/.exec(name)))return F(`flt-logs01a`);
  if((m=/^vcf-logs-worker-0?(\d+)$/.exec(name)))return F(`flt-logs01${letter(+m[1]+1)}`);
  if((m=/^vcf-auto-va-0?(\d+)$/.exec(name)))return F(`flt-auto01${letter(+m[1])}`);
  if(wldIndex){
    const w=wldTag(ctx,wldIndex);
    if(/^vcenter-wld-/.test(name))return I(`${w}-vc01`);
    if(/^vsan-witness-wld-/.test(name))return I(`${w}-cl01-vsw01`);
    if((m=/^nsx-manager-wld-.*-0?(\d+)$/.exec(name)))return I(`${w}-nsx01${letter(+m[1])}`);
    if((m=/^nsx-edge-wld-.*-0?(\d+)$/.exec(name)))return I(`${w}-en${pad2(+m[1])}`);
  }
  return null;
}

// Suggested FQDN for one Appliances / VIPs / Hosts row ('' when no suffix/site is set).
//   kind: 'appliances' | 'vips' | 'hosts'; name: applianceName / vipName / hostName; row: the row (domain, az, azIndex…)
//   wldIndex: 1-based position of the row's workload domain (0/undefined for the Management Domain)
export function suggestFqdn(project,kind,name,row={},wldIndex=0){
  const ctx=fqdnContext(project);
  if(!ctx)return '';
  if(ctx.mode==='legacy')return (ctx.prefix?ctx.prefix+'-':'')+fqdnSlug(name)+'.'+ctx.child;
  const hit=workbookLabel(ctx,kind,name,row,wldIndex);
  if(hit)return `${hit[0]}.${hit[1]==='fleet'?ctx.parent:ctx.child}`;
  // No workbook equivalent (License Hub, Avi SE, VIP pools…): <site>-<inst>-<row-name> in the instance zone.
  const tag=wldIndex?wldTag(ctx,wldIndex):`${ctx.site}-${ctx.inst}`;
  return `${tag}-${fqdnSlug(name)}.${ctx.child}`;
}

// Soft migration of pre-v1.31.0 projects (free FQDN prefix): derive site code / instance from a workbook-style
// prefix ("sfo-m01") and the parent domain from a 3+ label suffix whose first label is that site code. Never touches
// FQDNs already entered. Returns the list of derived fields.
export function migrateFqdnProject(project){
  const derived=[];
  if(project.siteCode)return derived;
  const m=/^([a-z0-9]{2,5})-([a-z][0-9]{2})$/.exec(clean(project.fqdnPrefix));
  if(!m)return derived;
  project.siteCode=m[1]; derived.push('siteCode');
  if(!project.instanceName){project.instanceName=m[2]; derived.push('instanceName');}
  const labels=clean(project.fqdnSuffix).split('.');
  if(!project.parentDomain&&labels.length>=3&&labels[0]===m[1]){project.parentDomain=labels.slice(1).join('.'); derived.push('parentDomain');}
  return derived;
}
