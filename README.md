# VCF 9 Network Planner — v1.1.0

Single-page network design tool for VMware Cloud Foundation 9 pre-deployment planning.

## Features

### Planning tabs
- **Overview** — global config, FQDN suffix/prefix, domain summary cards
- **Management Domain** — hosts, NSX, storage type, topology mode, Fleet/Platform network model
- **Platform Services** — VCF Operations, Logs, Networks, Automation, Identity Broker
- **Workload Domains** — per-domain config with storage type, NSX, VKS, domain roles
- **VLAN Design** — auto-generated VLAN table with VLAN ID and CIDR input (IP prefix pre-fill)
- **Appliances** — full appliance list with IP/FQDN fields and FQDN suffix auto-placeholder
- **VIPs** — virtual IP allocation with IP prefix pre-fill from VLAN CIDRs
- **Validation** — architectural rules with Blocker / Warning / Info severity
- **Export / Import** — Excel workbook (5 sheets) + JSON save/restore

### Network models
- **4 Fleet/Platform network models**: Shared Management VM Network, Dedicated Fleet VLAN, NSX VLAN Segment, NSX Overlay Segment (Edge required)
- **Storage types**: vSAN ESA (VCF 9 default), vSAN OSA, NFS, VMFS
- **Topology modes**: Single-Site, vSAN Stretched Cluster (Broadcom prerequisites), Stretched vMSC, Partially Stretched

### VCF 9 design rules
- vSAN Stretched Cluster prerequisites from Broadcom TechDocs (latency ≤ 5 ms RTT, 10 Gbps, Witness Host)
- Fleet Network routing — collectors always in Management VM Network
- VKS 5-consecutive-IP requirements
- VCF Automation 4-node HA (3 active + 1 upgrade)
- NSX TEP calculation per host
- Remote Collectors (≠ Cloud Proxy) — 2 by default for enterprise mode
- Identity Broker Embedded → N/A IP (disabled field)
- Workload Domain min 2 hosts when using NFS storage

### UX
- Topology explanations with L2/L3 rules per network (vSAN Stretched, Partially Stretched, vMSC)
- Domain Role descriptions (Runtime Kubernetes = VKS Supervisor cluster)
- Fleet model indicator in Platform Services tab
- FQDN Suffix/Prefix → auto-placeholder in Appliances and VIPs
- IP prefix pre-fill from VLAN CIDR (e.g. `10.0.1.0/24` → placeholder `10.0.1.`)

### Authentication
- Supabase username/password login
- Integrated access request modal (Supabase `access_requests` table + EmailJS notification)

## Authentication

Uses the same Supabase project and `profiles` table as VCF-DD. Users must have `active = true` in their profile to access the tool. Login is by username via the `get_email_by_username` RPC function.

Access requests are stored in the `access_requests` table and trigger an EmailJS notification to the administrator.

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Vanilla HTML5 + Alpine.js v3 |
| Styling | Custom CSS — VCF-DD Design System |
| Authentication | Supabase Auth (email + username) |
| Access Requests | Supabase `access_requests` + EmailJS |
| Excel Export | SheetJS (xlsx.full.min.js) |
| Runtime | Browser-only, no build step |
| Compatibility | Chrome, Edge, Firefox, Safari |

## Version History

| Version | Date | Notes |
|---|---|---|
| v1.1.0 | Apr 2026 | UX & features: topology explanations (vSAN Stretched, Partially Stretched), Storage Type (NFS/VMFS/vSAN), 4 Fleet network models (NSX Overlay/VLAN Segment), Broadcom TechDocs prerequisites, Platform Services fleet indicator, FQDN Suffix/Prefix, IP prefix from VLAN CIDR, access request modal, 2 Remote Collectors default |
| v1.0.0 | Apr 2026 | Initial release — full HTML, Alpine.js, Supabase auth, VCF-DD design |

## License

Internal use only.
