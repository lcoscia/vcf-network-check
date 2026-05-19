# VCF Network Planner — v1.2.0

Single-page network design tool for VMware Cloud Foundation pre-deployment planning.
Supports **VCF 9.0 and VCF 9.1** — a version selector conditions all available features.

## Features

### Planning tabs
- **Overview** — version selector (9.0 / 9.1), global config, FQDN suffix/prefix, domain summary cards
- **Management Domain** — hosts, NSX, storage type, topology mode, Fleet/Platform network model, teaming policy, EVPN-VXLAN fabric, NSX RTEP
- **Platform Services** — VCF Operations, Logs, Networks, Automation, Identity Broker, VCF Management Services (Services Runtime), VNA
- **Workload Domains** — per-domain config with storage type, NSX, VKS, domain roles, teaming policy, RTEP
- **VLAN Design** — auto-generated VLAN table with VLAN ID and CIDR input (IP prefix pre-fill)
- **Appliances** — full appliance list with IP/FQDN fields and FQDN suffix auto-placeholder
- **VIPs** — virtual IP allocation with IP prefix pre-fill from VLAN CIDRs
- **Validation** — architectural rules with Blocker / Warning / Info severity (version-aware)
- **Export / Import** — Excel workbook (5 sheets) + JSON save/restore

### Network models
- **4 Fleet/Platform network models**: Shared Management VM Network, Dedicated Fleet VLAN, NSX VLAN Segment, NSX Overlay Segment (Edge required)
- **Storage types**: vSAN ESA (default), vSAN OSA, NFS, VMFS
- **Topology modes**: Single-Site, vSAN Stretched Cluster (Broadcom prerequisites), Stretched vMSC, Partially Stretched
- **Network Fabric models**: Standard (VLAN trunk), EVPN-VXLAN Fabric Interoperability — VCF 9.1

### VCF 9.0 / 9.1 design rules

**Common (9.0 & 9.1)**
- vSAN Stretched Cluster prerequisites from Broadcom TechDocs (latency ≤ 5 ms RTT, 10 Gbps, Witness Host)
- Fleet Network routing — collectors always in Management VM Network
- VKS 5-consecutive-IP requirements
- VCF Automation 4-node HA (3 active + 1 upgrade)
- NSX TEP calculation per host × interfaces
- Remote Collectors (≠ Cloud Proxy) — 2 by default for enterprise mode
- NSX RTEP (Route TEP) VLAN for NSX Federation
- Workload Domain min 2 hosts with NFS storage

**VCF 9.1 only**
- **EVPN-VXLAN Fabric Interoperability** — Arista UCN, Cisco Nexus ONE, SONiC (generates dedicated VLAN)
- **LACP teaming policy** — supported on Management and Workload Domains
- **VCF Management Services (Services Runtime)** — Kubernetes runtime cluster (Simple / HA):
  - Generates VM node IPs in Management VM Network (1 or 3 control planes + N workers)
  - Generates dedicated **Services Runtime IP Range** (minimum 12 IPs for pod/service CIDR)
  - Generates 5 FQDNs: Services Runtime · Fleet Component · Instance Component · Identity Broker · License Server
  - Fleet-level services (Fleet Lifecycle, Salt RaaS, Log Management) on first VCF instance only
- **VNA — Virtual Network Appliance Cluster** — stateful NAT/LB/DHCP for distributed VPC architectures
- **VKS Multi-NIC** — secondary NIC VLAN for traffic separation in VKS clusters
- Validation blockers if a 9.1-only feature is enabled while version is set to 9.0

### UX
- Dynamic header, title, and About page reflecting the selected VCF version
- Topology explanations with L2/L3 rules per network (vSAN Stretched, Partially Stretched, vMSC)
- Domain Role descriptions (Runtime Kubernetes = VKS Supervisor cluster)
- Fleet model indicator in Platform Services tab
- FQDN Suffix/Prefix → auto-placeholder in Appliances and VIPs
- IP prefix pre-fill from VLAN CIDR (e.g. `10.0.1.0/24` → placeholder `10.0.1.`)
- 9.1 feature badges throughout the UI

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Vanilla HTML5 + Alpine.js v3 |
| Styling | Custom CSS — VCF-DD Design System |
| Excel Export | SheetJS (xlsx.full.min.js) |
| Runtime | Browser-only, no build step |
| Compatibility | Chrome, Edge, Firefox, Safari |
| VCF Versions | VMware Cloud Foundation 9.0 and 9.1 |

## Version History

| Version | Date | Notes |
|---|---|---|
| v1.2.0 | May 2026 | VCF 9.0 / 9.1 version selector. VCF 9.1: EVPN-VXLAN Fabric, LACP teaming, VCF Management Services (Services Runtime, Simple/HA, 12-IP range, 5 FQDNs), VNA cluster, VKS Multi-NIC, NSX RTEP. Suppression authentification (accès public direct). Sources: Broadcom TechDocs VCF 9.1, VMware Blog. |
| v1.1.0 | Apr 2026 | UX & features: topology explanations (vSAN Stretched, Partially Stretched), Storage Type (NFS/VMFS/vSAN), 4 Fleet network models (NSX Overlay/VLAN Segment), Broadcom TechDocs prerequisites, Platform Services fleet indicator, FQDN Suffix/Prefix, IP prefix from VLAN CIDR, 2 Remote Collectors default |
| v1.0.0 | Apr 2026 | Initial release — full HTML, Alpine.js, VCF-DD design |

## License

Internal use only.
