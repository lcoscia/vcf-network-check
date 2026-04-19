# VCF 9 Network Planner

> **Architecture Edition** — Pre-Deployment Network Planning Tool for VMware Cloud Foundation 9

**Author:** Leonardo Coscia — Senior VMware Cloud Foundation Architect  
**Version:** v1.0.2 — April 2026

---

## Overview

Browser-based network planning tool for VMware Cloud Foundation 9 deployments. From a handful of configuration choices, it automatically derives the complete VLAN inventory, appliance IP allocation, VIP list, and runs architectural validation — exportable to Excel or JSON.

---

## Features

| Feature | Description |
|---|---|
| **VLAN Engine** | Auto-generates all VLANs for Management & Workload Domains (ESXi, vMotion, vSAN, TEP, Edge Uplinks, Fleet, Platform Services) |
| **Appliance Allocation** | Full inventory with IP / FQDN fields for SDDC Manager, vCenter, NSX Managers, AVI, Fleet, VCF Suite |
| **VIP Inventory** | Auto-lists all cluster VIPs (NSX, AVI, VCF Operations, Automation, Identity Broker, VKS) |
| **Validation Engine** | Architectural checks with Blocker / Warning / Info severity and remediation guidance |
| **Excel Export** | 5-sheet workbook: Domain Summary · VLAN Summary · Appliance Allocation · VIPs · Validation Report |
| **JSON Save/Load** | Full planner state persistence including user-entered IPs and FQDNs |
| **Authentication** | Supabase-backed multi-user login — credentials embedded in `index.html` |

---

## Quick Start

Open `index.html` directly in a browser — no build step, no external config file required.

Supabase credentials are embedded directly in `index.html` inside a `<script>` block at the top of `<head>`. To point to a different Supabase project, edit `window.APP_CONFIG` there.

---

## Supabase Setup

**Table: `profiles`**

| Column | Type | Notes |
|---|---|---|
| `id` | uuid (PK) | References `auth.users.id` |
| `username` | text | Display name used for login |
| `active` | boolean | Inactive accounts are blocked at login |

**RPC function: `get_email_by_username`**

```sql
create or replace function get_email_by_username(p_username text)
returns text language sql security definer as $$
  select email from auth.users u
  join public.profiles p on p.id = u.id
  where p.username = p_username
  limit 1;
$$;
```

---

## Supported Scenarios

- **VCF Standard** — Management Domain + Workload Domains
- **VCF Automation** — includes VCF Automation (vRA) + vRO
- **VCF Automation + VKS** — adds Kubernetes Supervisor VLANs
- **Private AI** — AI Workload Domain role
- **Custom** — free-form configuration

---

## Security

| Control | Status |
|---|---|
| CDN Subresource Integrity (SRI) | All 3 scripts pinned with `integrity` + `crossorigin` |
| Dependency versions | Fully pinned (Supabase 2.103.3, xlsx 0.18.5, Alpine 3.14.9) |
| XSS — Alpine `x-html` | Eliminated — all dynamic content uses `x-text` |
| Supabase profile fetch | Minimal columns only (`id, username, active`) |
| Supabase anon key | Publishable by design — safe to embed in client HTML |

---

## License

Private — © 2026 Leonardo Coscia. All rights reserved.
