// Pure Excel export data-shaping; takes the XLSX library as an explicit parameter to avoid a global dependency.

const FORMULA_RE = /^[=+\-@\t]/;

export function xs(v) { if (v == null) return ''; const s = String(v); return FORMULA_RE.test(s) ? `'${s}` : s; }
export function colW(n) { return { wch: n }; }

export function applyHdr(XLSXLib, ws, range) {
  try {
    const ref = XLSXLib.utils.decode_range(range);
    for (let C = ref.s.c; C <= ref.e.c; C++) {
      const cr = XLSXLib.utils.encode_cell({ r: 0, c: C });
      if (ws[cr]) ws[cr].s = { fill: { fgColor: { rgb: '1B3A5C' } }, font: { bold: true, color: { rgb: 'FFFFFF' }, sz: 10 }, alignment: { horizontal: 'center', wrapText: true } };
    }
  } catch {}
}

export function doExcelExport(state, XLSXLib) {
  const wb = XLSXLib.utils.book_new();
  wb.Props = { Title: `VCF 9 Network Plan — ${state.project.projectName || 'Export'}`, Author: 'VCF 9 Network Planner', CreatedDate: new Date() };

  const ds = [['Domain', 'Type', 'Hosts', 'Services', 'VLANs', 'Total IPs', 'VIPs', 'Notes'], ...state.domainSummaries.map(s => [xs(s.domain), s.domainType === 'management' ? 'Management' : 'Workload', s.hostCount, xs(s.enabledServices.join(', ')), s.vlanCount, s.totalIPCount, s.vipCount, xs(s.notes)])];
  const ws1 = XLSXLib.utils.aoa_to_sheet(ds); ws1['!cols'] = [32, 18, 10, 40, 10, 12, 8, 40].map(colW); applyHdr(XLSXLib, ws1, 'A1:H1');
  XLSXLib.utils.book_append_sheet(wb, ws1, 'Domain Summary');

  const vd = [['Domain', 'VLAN Name', 'Type', 'VLAN ID', 'CIDR', 'Req. IPs', 'Rec. CIDR', 'Mandatory', 'Scope', 'Notes'], ...state.vlans.map(v => [xs(v.domain), xs(v.vlanName), xs(v.vlanType), xs(v.vlanId), xs(v.cidr), v.requiredIPs, xs(v.recommendedCIDR), xs(v.mandatory), xs(v.scope), xs(v.notes)])];
  const ws2 = XLSXLib.utils.aoa_to_sheet(vd); ws2['!cols'] = [28, 24, 18, 10, 16, 10, 12, 14, 12, 40].map(colW); applyHdr(XLSXLib, ws2, 'A1:J1');
  XLSXLib.utils.book_append_sheet(wb, ws2, 'VLAN Summary');

  const ad = [['Appliance Name', 'Type', 'Domain', 'VLAN', 'IP Address', 'FQDN', 'Static IP', 'Notes'], ...state.appliances.map(a => [xs(a.applianceName), xs(a.applianceType), xs(a.domain), xs(a.vlan), xs(a.ipAddress), xs(a.fqdn), a.staticIPRequired ? 'Yes' : 'No', xs(a.notes)])];
  const ws3 = XLSXLib.utils.aoa_to_sheet(ad); ws3['!cols'] = [28, 22, 28, 28, 18, 36, 10, 40].map(colW); applyHdr(XLSXLib, ws3, 'A1:H1');
  XLSXLib.utils.book_append_sheet(wb, ws3, 'Appliance Allocation');

  const vipd = [['VIP Name', 'Service', 'Domain', 'VLAN', 'IP Address', 'FQDN', 'Notes'], ...state.vips.map(v => [xs(v.vipName), xs(v.associatedService), xs(v.domain), xs(v.vlan), xs(v.ipAddress || v.ipPlaceholder), xs(v.fqdn || v.fqdnPlaceholder), xs(v.notes)])];
  const ws4 = XLSXLib.utils.aoa_to_sheet(vipd); ws4['!cols'] = [32, 24, 28, 28, 18, 36, 40].map(colW); applyHdr(XLSXLib, ws4, 'A1:G1');
  XLSXLib.utils.book_append_sheet(wb, ws4, 'VIPs');

  const vald = [['Severity', 'Category', 'Domain', 'Message', 'Resolution'], ...state.validationMessages.map(m => [xs(m.severity.toUpperCase()), xs(m.category), xs(m.domain), xs(m.message), xs(m.resolution)])];
  const ws5 = XLSXLib.utils.aoa_to_sheet(vald); ws5['!cols'] = [12, 14, 28, 60, 50].map(colW); applyHdr(XLSXLib, ws5, 'A1:E1');
  XLSXLib.utils.book_append_sheet(wb, ws5, 'Validation Report');

  const fname = `VCF9_Plan_${(state.project.projectName || 'Export').replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.xlsx`;
  XLSXLib.writeFile(wb, fname);
}
