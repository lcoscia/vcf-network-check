# VCF 9.1 Network Planner — v1.16.0

Single-page network design tool for VMware Cloud Foundation 9 pre-deployment planning. No login required — open `index.html` (served via a static HTTP server, see [Usage](#usage)) in a browser.

**Available in French and English** — toggle FR / EN in the header. Language persists across sessions (localStorage).

## Features

### Planning tabs
- **Overview** — global config, VCF version selector (9.0 / 9.1), FQDN suffix/prefix, domain summary cards
- **Management Domain** — hosts, NSX, storage type, topology mode, VCF Management Services network model
- **Platform Services** — VCF Operations, Log Management, Networks, Automation, Identity Broker
- **Workload Domains** — per-domain config with storage type, NSX, VKS, domain roles
- **VLAN Design** — auto-generated VLAN table with VLAN ID and CIDR input (IP prefix pre-fill)
- **Appliances** — full appliance list with IP/FQDN fields and FQDN suffix auto-placeholder
- **VIPs** — virtual IP allocation with IP prefix pre-fill from VLAN CIDRs
- **Validation** — architectural rules with Blocker / Warning / Info severity
- **Export / Import** — Excel workbook (5 sheets) + JSON save/restore
- **VCF Components** — clickable card grid grouped by domain (Management + each Workload Domain); click a component (SDDC Manager, vCenter, NSX Manager/Edge, ESXi, VCF Operations/Automation, Avi, VKS, **SSP**, **License Hub**…) to see its scope, IPs/unit, FQDNs/unit, and the totals computed dynamically from the current project configuration

### VCF 9.0 / 9.1 dual support

#### VCF 9.1
- **VCF Management Services** — 4 mandatory Day-0 FQDNs (Fleet, Instance, VCF Services Runtime, Identity Broker) + Services Runtime IP block /28 min (12 IPs) – /27 max (30 IPs); Identity Broker's IP is allocated from this block (not additional). License Server is a separate component (1 FQDN, IP in the Management VM Network, outside the Services Runtime block)
- **2 network models**: VCF Management Shared VLAN Network Model (Day 0) / VCF Management Dedicated VLAN Network Model (Day 2 via fleet lifecycle API)
- **VCF Automation (cloud-native)**: 1 dedicated FQDN (endpoint/VIP) + 1 dedicated VCF Services Runtime FQDN + separate /29 block (5 IPs: 3 node IPs + 2 buffer for redeploy/rolling updates) — independent from the Services Runtime block, defaults to the Management VM Network (dedicated VLAN via fleet lifecycle API) — no separate VA VMs
- **Identity Broker**: containerized service in Services Runtime — 1 FQDN, IP allocated from the Services Runtime block, HA native (no separate VM/VIP)
- **Log Management** (Day-N): Aria Operations for Logs 8.18 integrated in Management Services — 1 FQDN (LB endpoint) + 6 base IPs + 2 IPs per additional replica, all from the Services Runtime block
- **Real-time Metrics** (Day-N): new 9.x component — 0 FQDN + 6 IPs, from the Services Runtime block (internal CIDR 198.18.0.0/15)
- **NSX Manager VIP**: reserved in all modes including Simple (VCF IP Allocation Workbook best practice for non-disruptive future HA scale-out)
- **Cloud Proxy**: replaces Remote Collectors in 9.x — 1 FQDN per VCF instance
- **SSP (Security Services Platform)**: hosts vDefend (NDR, malware prevention, security intelligence) — 1:1:1 with an NSX Manager cluster; 1 SSPI installer + SSP instance (3 controllers + 5-10 workers); ~21 IPs / 3 FQDNs per instance (SSPI, SSP Ingress, SSP Messaging); opt-in toggle at Management Domain level and per Workload Domain; domains on a shared NSX Manager cluster are not double-counted
- **License Hub (vDefend + Avi)**: distinct from License Server — manages vDefend/Avi subscription licensing (up to 120 endpoints); deployed once per Fleet (1 Controller + 1 Worker + 1 Installer = 9 IPs, 1 FQDN); auto-enabled as soon as SSP or Avi is in use

#### VCF 9.0
- Fleet Appliance (1 FQDN), classic platform service VM architecture
- Identity Broker appliance mode with HA (3 nodes + VIP)
- VCF Automation VA nodes (Standalone / HA 4-node)
- VCF Operations for Logs: master + workers architecture

### Use cases / Scenarios
- **Consolidated / 3-Node vSAN ESA (Compact)** (`project.scenario = consolidated-3node-vsan-esa`) — VCF 9 Consolidated Architecture: Management Domain and VI Workload Domain(s) share a single 3-host vSAN ESA cluster, with isolation enforced via resource pools instead of separate clusters. Use this for small/edge/lab deployments where dedicating separate clusters per domain isn't justified. 3 hosts is the documented vSAN ESA/OSA technical minimum (RAID-1 FTT=1); 4 hosts are recommended for N+1 availability. The host count field allows a minimum of 3, with validation messages adapting accordingly (Info at 3 hosts with vSAN ESA + this scenario, Warning recommending 4 otherwise).

### Network models
- **4 Fleet/Platform network models**: Shared Management VM Network, Dedicated Fleet VLAN, NSX VLAN Segment, NSX Overlay Segment (Edge required)
- **Storage types**: vSAN ESA (VCF 9 default), vSAN OSA, NFS, VMFS
- **Topology modes**: Single-Site, vSAN Stretched Cluster (Broadcom prerequisites), Stretched vMSC, Partially Stretched — available for **both the Management Domain and each Workload Domain independently**. In Stretched mode, a domain is modeled as **AZ1 + AZ2 + a distinct vSAN Witness**: explicit AZ1/AZ2 host count fields (AZ1→AZ2 auto-sync, with mandatory symmetry validation), per-AZ VLAN rows (ESXi Management, vMotion, vSAN, NSX Host TEP), and a dedicated Witness VLAN/appliance (1 IP by default — shared vmk0 — or 2 IPs with a dedicated vmk1, user-selectable). Each stretched Workload Domain gets its own independent Witness, never shared with the Management Domain or other Workload Domains

### VCF 9.x design rules (per Broadcom TechDocs)
- NSX Manager VIP reserved in all modes (VCF IP Allocation Workbook best practice for non-disruptive future HA scale-out)
- VCF Services Runtime: /28 min (12 IPs) — /27 max (30 IPs), recommended ceiling for Day-N scale-out (Log Management, Real-time Metrics, additional replicas). Identity Broker's IP, and Day-N Log Management/Real-time Metrics IPs, are allocated from this block
- VCF Automation /29 block (5 IPs: 3 node IPs + 2 buffer for redeploy/rolling updates) independent from the Services Runtime block — defaults to the Management VM Network, dedicated VLAN via fleet lifecycle API
- vSAN Stretched Cluster prerequisites: VM Management Network mandatory L2-stretched across both sites; vSAN VMkernel network L2 or L3 (only Witness link needs independent routing); Witness latency two-tier (≤10 hosts/site <200ms RTT, 11-15 hosts/site <100ms RTT), 10 Gbps
- Fleet Network routing — collectors always in Management VM Network
- VKS Infrastructure VLAN: 5 IPs — recommended contiguous block; 3 control plane + 1 floating + 1 patching; workload network/AVI VIP pool/ingress-egress CIDR/pod CIDR are separate additional requirements
- NSX TEP calculation per host
- Workload Domain min 2 hosts when using NFS storage

### Bilingual FR / EN
- FR ↔ EN toggle pill in the header (persisted in `localStorage`)
- All UI labels, topology descriptions, fleet model descriptions, validation messages, and VLAN/appliance notes switch language instantly
- Engine-generated notes (VLAN Notes column, Appliance Notes, Validation messages) follow the active language
- French content is never removed — both languages coexist in a `translations` object

### UX
- Topology explanations with L2/L3 rules per network
- Domain Role descriptions (Runtime Kubernetes = VKS Supervisor cluster)
- Fleet model indicator in Platform Services tab
- FQDN Suffix/Prefix → auto-placeholder in Appliances and VIPs
- IP prefix pre-fill from VLAN CIDR (e.g. `10.0.1.0/24` → placeholder `10.0.1.`)
- Version-aware UI: VCF 9.1 controls adapt automatically (Automation labels, Identity Broker HA, Log Management model)

## Usage

```bash
git clone https://github.com/lcoscia/vcf-network-check.git
cd vcf-network-check
python3 -m http.server 8000
# then open http://localhost:8000/index.html
```

No configuration required. Authentication is disabled — the tool is accessible directly.

> `index.html` loads its business logic via real ES modules (`<script type="module">`), so it must be served over HTTP(S) — Chrome blocks ES module imports over `file://`. A static server (`python3 -m http.server`, VS Code Live Server, etc.) is required; Firefox is more permissive but a server is still the supported path.

## Architecture

All business logic lives in pure ES modules under `core/`, with zero DOM/Alpine/`window` coupling — each module is independently testable and reusable outside the browser UI (e.g. a future MCP server or CLI):

| File | Role |
|---|---|
| `core/index.js` | Barrel — re-exports every Core symbol, no logic |
| `core/data.js` | Static constants: CIDR sizing table, default project/domain templates |
| `core/reference.js` | ID/domain helpers, default workload-domain factory, VCF-component IP/FQDN reference table |
| `core/sizing.js` | CIDR recommendation logic |
| `core/vlan.js` | VLAN list derivation (Management + Workload Domains) |
| `core/appliances.js` | Appliance inventory derivation |
| `core/vips.js` | VIP inventory derivation |
| `core/summary.js` | Per-domain summary aggregation |
| `core/validation.js` | Architectural validation engine |
| `core/excel.js` | Excel export data shaping (takes the `XLSX` library as a parameter) |
| `core/i18n.js` | FR/EN translation dictionary + pure translator |
| `core/components.js` | Per-component IP/FQDN requirement calculation (VCF Components tab) |

`index.html` is a thin UI layer: HTML markup + Alpine.js, with a single `<script type="module">` that imports `core/index.js` and calls `Core.*` from the Alpine component. Tailwind is loaded via CDN with a `tw-` prefix (used only by the VCF Components tab) so it can never collide with the pre-existing custom CSS design system.

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Vanilla HTML5 + Alpine.js v3 |
| Architecture | Pure ES modules in `core/` + thin UI layer (`index.html`) |
| Styling | Custom CSS — VCF-DD Design System + Tailwind CDN (`tw-` prefix) |
| Excel Export | SheetJS (xlsx.full.min.js) |
| Runtime | Browser-only, no build step (served via static HTTP server) |
| Compatibility | Chrome, Edge, Firefox, Safari |

> Authentication (Supabase + EmailJS) is fully commented out in the source and can be re-enabled by searching for `AUTH DISABLED` markers.

## Version History

| Version | Date | Notes |
|---|---|---|
| v1.16.0 | Jul 2026 | Structural multi-agent audit (6 agents, one per VCF function, plus 1 orchestrator) validating every IP/FQDN/appliance/VIP figure exclusively against techdocs.broadcom.com. Blocking fix: the SSP Node Pool/Service Pool wrongly counted 13+7=21 IPs — a figure that actually matched the documented "8 workers" tier — instead of the true documented minimum of 4 workers, i.e. 9+5=15 IPs (Broadcom decision SEC-SSP-NET-004/SEC-SSP-CFG-008); Broadcom's maximum scale-out benchmark of 24 IPs (10 workers) is kept for reference. Blocking fix: Management VM Network VLAN sizing double-counted legacy "Remote Collectors" on top of the actual Cloud Proxy in VCF 9.1, inflating the IP block calculation. Significant fixes: the "VCF Components" panel was not VCF 9.0/9.1 version-aware for several components (Ops Collectors, VCF Automation) and showed incorrect figures in 9.1; added the missing Cloud Proxy, VCF Operations for Logs, and VCF Operations for Networks components to the panel. Minor fixes: clarified labels, removed an unverifiable documentation reference ("IP Allocation Workbook"), and added a caveat on the min-2-hosts NFS sizing rule |
| v1.15.0 | Jul 2026 | Closes 6 "phantom" VLANs: VCF Operations, Log Management/Ops for Logs (9.0 and 9.1), Ops for Networks, Identity Broker and SSP already had dedicated-VLAN logic in appliance/VIP calculations, but the VLAN Design table never generated a matching row for them, making it impossible to declare a consistent IP prefix for these services. New generic validation rule warns whenever an appliance references a VLAN missing from the generated table (anti-regression safety net). VLAN Design tab: the end of the IP range is now shown read-only next to "Range Start" (derived from "Req. IPs"), and the "Auto-fill" button now uses the block's actual bound instead of an arbitrary value. Minor fix: the "→ VIP" indicator now also shows in NSX Manager "Simple" mode (previously clustered mode only, even though a VIP is always reserved) |
| v1.14.0 | Jul 2026 | VLAN Design tab: new "Range Start" field on every VLAN row and an "↳ Auto-fill" button that sequentially pre-fills the IP addresses of the appliances in that block (matching domain + VLAN), never overwriting an IP already entered manually. VCF Automation finally gets its own dedicated VLAN row in 9.1 when the "dedicated VLAN" option is checked (previously invisibly aggregated into "Management VM Network"). New validation rules: a warning when the declared range start IP falls outside the row's CIDR, and an info message when the number of static-IP appliances in the block exceeds its planned capacity |
| v1.13.3 | Jul 2026 | Appliances/VIPs tabs: discreet badge on empty IP/FQDN fields (no alert color) and a "X/Y IP addresses filled" summary counter per table (Identity Broker Embedded excluded, its IP is disabled by design). New "FQDN Req." column in Appliances and a "→ VIP" indicator pointing cluster nodes to their VIP in the VIPs tab. Internal cleanup: removed the dead `hostingArea` field and hardcoded `'TBD'` VIP placeholders; the VIPs sheet in the Excel export now shows an empty cell instead of "TBD" when IP/FQDN is unset, consistent with the other sheets |
| v1.13.2 | Jul 2026 | Removed 11 duplicate entries from the Appliances tab: cluster VIPs (NSX Manager, AVI Cluster, VCF Operations, VCF Ops for Logs UI/ILB, VCF Operations Orchestrator, VCF Automation Cluster, VCF Automation Orchestrator, VCF Identity Broker HA, additional-service VIPs, workload-domain NSX Manager VIP) were incorrectly listed both in the Appliances tab and in the dedicated VIPs tab (and duplicated in the Excel export). A VIP is a floating IP on an already-counted cluster, not a dedicated VM — these lines now live only in the VIPs tab (single source of truth: `core/vips.js`). Dashboard Appliances counter drops by ~11 rows; VIP totals unchanged |
| v1.13.1 | Jul 2026 | The "VCF Management Services — Network Model" dropdown labels (Management Domain, VCF 9.1) now match Broadcom's official model names word-for-word (e.g. "VCF Management Dedicated VLAN and NSX Overlay Segment Network Model"), per the Broadcom TechDocs "Fleet Level Component Backing Networking Models" page, instead of shortened in-house labels |
| v1.13.0 | Jul 2026 | Fixed the VCF Management Services network model (VCF 9.1): fully aligned with the 4 official models documented by Broadcom (Shared VLAN / Dedicated VLAN / Dedicated VLAN + NSX Overlay Segment / Dedicated VLAN + NSX Stretched Overlay Segment). The "NSX VLAN Segment" mode, which does not correspond to any official 9.1 model, is removed from new 9.1 projects (kept as legacy for existing projects, still available in 9.0). In NSX Overlay Segment mode, Fleet Appliance / VCF Mgmt Services Instance / VCF Services Runtime / Identity Broker now correctly stay on the dedicated VLAN (Day-0), while VCF Operations, VCF Automation and License Server correctly move to the overlay segment (Day-2), per Broadcom documentation — fixes a gap where all these components incorrectly shared a single VLAN. New validation rules (stretched/L2 consistency, Federation reminder, legacy model warning) |
| v1.12.0 | Jul 2026 | New Feedback button in the header, opens a pre-filled GitHub issue (title, app version, current tab, VCF version, user-agent) in a new tab — no data is sent without explicit user confirmation on GitHub |
| v1.11.1 | Jul 2026 | Fix: Remote Collector and Cloud Proxy (VCF Operations) never appeared without one another in the export — Remote Collector is a vestige of Aria Operations ≤8.15, deprecated since 8.16 and absent from VCF 9.x. Remote Collector is now restricted to VCF 9.0 (legacy), Cloud Proxy exclusively to VCF 9.1, per Broadcom documentation; UI fields and appliance/validation notes updated accordingly |
| v1.11.0 | Jun 2026 | Extended AZ1/AZ2/Witness modeling to Workload Domains (previously only available for the Management Domain): any Workload Domain can now be configured as a vSAN Stretched Cluster, with its own AZ1/AZ2 Host Count fields (AZ1→AZ2 auto-sync), per-AZ VLAN rows (ESXi Management, vMotion, vSAN, NSX Host TEP), and its own independent Witness (shared vmk0 or dedicated vmk1) — not shared with the Management Domain or other Workload Domains. New per-domain validation rules (AZ1/AZ2 symmetry blocker, min-1-host-per-AZ blocker, Witness latency tier info). No behavior change in Single Site / Partially Stretched mode |
| v1.10.1 | Jun 2026 | Reduced friction on AZ1/AZ2 input (Stretched Cluster): the AZ1 Host Count field now auto-syncs AZ2 to the same value (symmetry by default, per Broadcom's requirement), while AZ2 remains freely editable afterward to test an intentionally asymmetric setup — the existing AZ1/AZ2 symmetry blocker remains the safety net |
| v1.10.0 | Jun 2026 | Full modeling of AZ1, AZ2, and the Witness for the Management Domain in vSAN Stretched Cluster (an audit confirmed AZ2 had no distinct representation): new AZ1/AZ2 Host Count fields replace the single host count field in Stretched mode (auto-synced total); ESXi Management, vMotion, vSAN, and NSX Host TEP VLAN rows now split per AZ; new vSAN Witness section/VLAN/appliance with a shared-vmk0 (1 IP, default) vs dedicated-vmk1 (2 IPs) choice, modeled as a distinct entity rather than a symmetric 3rd site; new validation rules (AZ1/AZ2 symmetry blocker, min-1-host-per-AZ blocker, Witness latency tier info). No behavior change in Single Site / Partially Stretched mode |
| v1.9.1 | Jun 2026 | Multi-agent audit of IP/FQDN prerequisites against official Broadcom VCF 9.1 documentation, followed by targeted corrections: **NSX Edge Nodes** corrected from 2 to 1 IP/FQDN per node (reference table didn't match the actual code calculation, which already counted only the management IP — TEP/uplink subnets are counted separately via dedicated VLAN pools); **SSP** recalibrated to Broadcom's documented minimum of 4 workers (instead of the assumed 5-10), with exact pool figures (Node Pool 13 IPs, Service Pool 7 IPs — total of 21 IPs unchanged) and an FQDN name fix ("SSP Ingress" → "SSP Instance"); **License Hub**: confirmed the FQDN count (1) remains an undocumented Broadcom assumption, wording clarified to rule out a mix-up with SSP's FQDNs (no value change) |
| v1.9.0 | Jun 2026 | Added two missing VCF 9.1 components to the VCF Components tab: **SSP (Security Services Platform)** (vDefend host, 1:1:1 with an NSX Manager cluster, ~21 IPs/3 FQDNs per instance, opt-in toggle at Management Domain and per Workload Domain, no double-count on shared NSX clusters) and **License Hub (vDefend + Avi)** (distinct from License Server, 9 IPs/1 FQDN, deployed once per Fleet, auto-enabled when SSP or Avi is in use). Both components are also reflected in the detailed per-appliance allocation table (`core/appliances.js`). App renamed from "VCF 9 Network Planner" to "**VCF 9.1 Network Planner**" across the UI (title, header, About, footer) |
| v1.8.0 | Jun 2026 | Header banner now shows the app version, a **BETA** badge (tooltip reminding to cross-check values against the official Broadcom VCF 9.1 documentation), and the currently selected VCF version (9.0/9.1), updating live as soon as it's changed on the Overview tab. Added a **Disclaimer** box at the top of the About tab: "This tool is a community conversion of the official Broadcom workbook. Always cross-check values against the official VCF 9.1 documentation before deployment." |
| v1.7.2 | Jun 2026 | Deploy reliability fix: every internal ES module import (`core/index.js` and each `core/*.js` file) now carries a `?v=1.7.2` cache-busting query string, forcing the browser to fetch fresh JS on every release instead of risking a stale cached module after a deploy (the HTML updates immediately, but JS modules served by the GitHub Pages CDN could stay cached for up to 10 minutes, causing "I tested it and it's still broken" reports right after shipping a fix). The v1.7.1 per-domain ESXi/vCenter/NSX/VKS/Avi breakdown on the VCF Components tab was re-verified live in production with Playwright and confirmed working correctly — this release is infra-only, no logic change |
| v1.7.1 | Jun 2026 | VCF Components tab corrected to match VCF 9.1 network design (Broadcom TechDocs): each Workload Domain is its own Layer-2 network domain/network pool, so ESXi host, vCenter, NSX Manager/Edge and VKS Supervisor figures are now broken down **per domain** (Management Domain + each Workload Domain) instead of one global total shared across all domains; fixed Avi Service Engines to be driven by each workload domain's own "Avi enabled" flag (per-domain dedicated SE pool, consistent with the VLAN Design/Appliances tabs) instead of the management-domain Avi Controller flag; clicking a card now shows the selected domain in the detail panel |
| v1.7.0 | Jun 2026 | Architectural refactor: all business logic (VLANs, appliances, VIPs, validation, Excel export, i18n) moved into pure ES modules under `core/` (testable in isolation, reusable outside the UI — e.g. a future MCP server/CLI); `index.html` becomes a thin UI/Alpine layer importing `core/index.js` via `<script type="module">`; added Tailwind CDN (`tw-` prefix to avoid collisions with the existing CSS design system). New **VCF Components** tab: clickable component grid grouped by domain, showing IPs/FQDNs required per VCF component, computed dynamically from the project configuration and based on the VCF 9.1 IP/FQDN prerequisites reference figures |
| v1.6.1 | Jun 2026 | Multi-agent 9.1 audit corrections (TechDocs re-verification, IP/FQDN model): VCF Management Services = 4 Day-0 FQDNs (Fleet, Instance, Services Runtime, Identity Broker) — License Server is a separate component (1 FQDN, Mgmt VM Network); Identity Broker IP now allocated from the Services Runtime block (no separate VIP/IP, no longer double-counted); Log Management 9.1 IPs (6 base + 2/replica) now allocated from the Services Runtime block, removed from Mgmt VM Network/Fleet VLAN counts and VIP list; VCF Automation 9.1 corrected to 1 dedicated FQDN + 1 dedicated Services Runtime FQDN + /29 (3 node IPs + 2 buffer for redeploy/rolling updates), defaults to Management VM Network, independent from the Services Runtime block; new Info validation rule on the Automation /29 block separation; updated bilingual FR/EN help boxes (fleet, platform, logs, automation, identity broker) and appliance/VIP notes accordingly |
| v1.6.0 | Jun 2026 | New "Consolidated / 3-Node vSAN ESA (Compact)" scenario (Management + VI Workload Domains share a 3-host vSAN ESA cluster, resource-pool isolation; 3-host minimum, 4 recommended for N+1; reworked validation engine + scenario-specific checks; bilingual Broadcom TechDocs help box). Multi-agent audit corrections (TechDocs VCF 9.1): VCF Automation /29 reworded to "4 node IPs (3 active + 1 buffer for redeployment)"; NSX Manager VIP reframed as VCF IP Allocation Workbook best practice (removed unverifiable internal reference); vSAN Stretched Cluster/vMSC L2/L3 requirement reversal fixed (VM Management Network mandatory L2, vSAN VMkernel L2/L3) + two-tier Witness latency (KB417356); VKS "5 consecutive IPs" softened to "5 IPs, recommended contiguous block" with separate workload/AVI/ingress-egress/pod CIDR note |
| v1.5.1 | Jun 2026 | Multi-agent 9.1 audit (TechDocs re-verification): 5th Day-0 FQDN (License Server, in Mgmt VM Network); /28→/27 reworded as Day-N scale-out ceiling (Log Mgmt, Real-time Metrics, replicas) instead of a hard threshold; Real-time Metrics reclassified as Day-2 via Build/Lifecycle (not automatic); VCF Operations for Networks cert-SAN FQDN/IP note; AVI Controller cluster VIP renamed "Avi Load Balancer"; new Info validation rule recommending /27 for Services Runtime when Log Management is enabled |
| v1.5.0 | Jun 2026 | Bilingual FR/EN: language toggle in header, localStorage persistence, `translations` object with ~120 keys, all UI/engine strings switch language (topology, fleet, platform, appliances, VLANs, validation) |
| v1.4.0 | Jun 2026 | TechDocs 9.1 corrections (14 fixes, agent-reviewed): NSX VIP mandatory Simple mode; VCF Automation dedicated FQDN + /29 always 5 IPs; Identity Broker 9.1 = 1 external IP (Services Runtime service, no VM); Log Management 9.1 (1 FQDN VIP + 6 IPs CIDR); Real-time Metrics 9.1 documented; /28→/27 guidance; HA IB hidden 9.1; Remote Collectors → Cloud Proxies 9.x |
| v1.3.0 | Jun 2026 | VCF 9.0/9.1 dual support: VCF version selector; VCF Management Services 4 FQDNs + /28-/27 block + CIDR 198.18.0.0/15; Shared VLAN / Dedicated VLAN models; Cloud Proxy + License Server appliances; auth fully commented out (free access) |
| v1.1.0 | Apr 2026 | UX & features: topology explanations (vSAN Stretched, Partially Stretched), Storage Type (NFS/VMFS/vSAN), 4 Fleet network models (NSX Overlay/VLAN Segment), Broadcom TechDocs prerequisites, Platform Services fleet indicator, FQDN Suffix/Prefix, IP prefix from VLAN CIDR, 2 Remote Collectors default |
| v1.0.0 | Apr 2026 | Initial release — full HTML, Alpine.js, Supabase auth, VCF-DD design |

## License

Internal use only.
