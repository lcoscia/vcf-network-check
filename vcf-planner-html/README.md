# VCF 9 Network Planner — v1.4.0

Single-page network design tool for VMware Cloud Foundation 9 pre-deployment planning. No login required — open `index.html` directly in a browser.

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

### VCF 9.0 / 9.1 dual support

#### VCF 9.1
- **VCF Management Services** — 4 mandatory FQDNs (Fleet, Instance, VCF Services Runtime, Identity Broker) + IP block /28–/27
- **2 network models**: VCF Management Shared VLAN Network Model (Day 0) / VCF Management Dedicated VLAN Network Model (Day 2 via API)
- **VCF Automation (cloud-native)**: 1 dedicated FQDN (endpoint/VIP) + /29 block (5 IPs: 3 active + 2 buffer) — no separate VA VMs
- **Identity Broker**: containerized service in Services Runtime — 1 external IP/FQDN, HA native
- **Log Management** (Day-N): Aria Operations for Logs 8.18 integrated in Management Services — 1 FQDN + 6 IPs (internal CIDR)
- **Real-time Metrics** (Day-N): new 9.x component — 0 FQDN + 6 IPs (internal CIDR 198.18.0.0/15)
- **NSX Manager VIP**: mandatory in all modes including Simple (VCF-NSX-LM-REQD-CFG-002)
- **Cloud Proxy**: replaces Remote Collectors in 9.x — 1 FQDN per VCF instance

#### VCF 9.0
- Fleet Appliance (1 FQDN), classic platform service VM architecture
- Identity Broker appliance mode with HA (3 nodes + VIP)
- VCF Automation VA nodes (Standalone / HA 4-node)
- VCF Operations for Logs: master + workers architecture

### Network models
- **4 Fleet/Platform network models**: Shared Management VM Network, Dedicated Fleet VLAN, NSX VLAN Segment, NSX Overlay Segment (Edge required)
- **Storage types**: vSAN ESA (VCF 9 default), vSAN OSA, NFS, VMFS
- **Topology modes**: Single-Site, vSAN Stretched Cluster (Broadcom prerequisites), Stretched vMSC, Partially Stretched

### VCF 9.x design rules (per Broadcom TechDocs)
- NSX Manager VIP mandatory in Simple and HA modes (req. VCF-NSX-LM-REQD-CFG-002)
- VCF Services Runtime: /28 min (12 IPs) — /27 recommended when Log Management + Real-time Metrics deployed
- VCF Automation /29 block (5 IPs) independent from Services Runtime node block
- vSAN Stretched Cluster prerequisites (latency ≤ 5 ms RTT, 10 Gbps, Witness Host)
- Fleet Network routing — collectors always in Management VM Network
- VKS 5-consecutive-IP requirements
- NSX TEP calculation per host
- Workload Domain min 2 hosts when using NFS storage

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
cd vcf-network-check/vcf-planner-html
open index.html   # or serve with any static HTTP server
```

No configuration required. Authentication is disabled — the tool is accessible directly.

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Vanilla HTML5 + Alpine.js v3 |
| Styling | Custom CSS — VCF-DD Design System |
| Excel Export | SheetJS (xlsx.full.min.js) |
| Runtime | Browser-only, no build step |
| Compatibility | Chrome, Edge, Firefox, Safari |

> Authentication (Supabase + EmailJS) is fully commented out in the source and can be re-enabled by searching for `AUTH DISABLED` markers.

## Version History

| Version | Date | Notes |
|---|---|---|
| v1.4.0 | Jun 2026 | TechDocs 9.1 corrections (14 fixes, agent-reviewed): NSX VIP mandatory Simple mode; VCF Automation dedicated FQDN + /29 always 5 IPs; Identity Broker 9.1 = 1 external IP (Services Runtime service, no VM); Log Management 9.1 (1 FQDN VIP + 6 IPs CIDR); Real-time Metrics 9.1 documented; /28→/27 guidance; HA IB hidden 9.1; Remote Collectors → Cloud Proxies 9.x |
| v1.3.0 | Jun 2026 | VCF 9.0/9.1 dual support: VCF version selector; VCF Management Services 4 FQDNs + /28-/27 block + CIDR 198.18.0.0/15; Shared VLAN / Dedicated VLAN models; Cloud Proxy + License Server appliances; auth fully commented out (free access) |
| v1.1.0 | Apr 2026 | UX & features: topology explanations (vSAN Stretched, Partially Stretched), Storage Type (NFS/VMFS/vSAN), 4 Fleet network models (NSX Overlay/VLAN Segment), Broadcom TechDocs prerequisites, Platform Services fleet indicator, FQDN Suffix/Prefix, IP prefix from VLAN CIDR, 2 Remote Collectors default |
| v1.0.0 | Apr 2026 | Initial release — full HTML, Alpine.js, Supabase auth, VCF-DD design |

## License

Internal use only.
