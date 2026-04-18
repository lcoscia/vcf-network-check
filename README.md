# VCF 9 Network Planner

> **Architecture Edition** — Pre-Deployment Network Planning Tool for VMware Cloud Foundation 9

**Author:** Leonardo Coscia — Senior VMware Cloud Foundation Architect  
**Version:** v1.0.0 — April 2026

---

## Overview

The VCF 9 Network Planner replaces manual spreadsheet-based network design with a self-consistent, browser-based planning tool. From a handful of configuration choices, it automatically derives the complete VLAN inventory, appliance IP allocation, VIP list, and runs architectural validation — all exportable to Excel or JSON.

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
| **Authentication** | Supabase-backed multi-user login with username + password |

---

## Project Structure

```
vcf-network-check/
├── vcf-planner-html/        # ★ Main deliverable — standalone HTML app
│   ├── index.html           # Single-file application (Alpine.js + custom CSS)
│   ├── config.js            # Supabase credentials (not committed)
│   └── config.example.js    # Template for config.js
│
├── vcf-planner/             # Next.js prototype (reference implementation)
│
└── VCF 9 VLAN Verification/ # Original VCF-DD validation report tool
```

---

## Quick Start

### HTML App (recommended)

```bash
# 1. Copy and fill in your Supabase credentials
cp vcf-planner-html/config.example.js vcf-planner-html/config.js

# 2. Open in browser — no build step required
open vcf-planner-html/index.html
```

Or serve with any static file server:

```bash
cd vcf-planner-html
npx serve .
# → http://localhost:3000
```

### Configuration (`config.js`)

```js
window.APP_CONFIG = {
  supabaseUrl: 'https://<your-project>.supabase.co',
  supabaseKey: '<your-anon-key>'
};
```

> `config.js` is excluded from git via `.gitignore` — never commit credentials.

---

## Supabase Setup

The app expects two objects in your Supabase project:

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

## Technology Stack

| Layer | Technology |
|---|---|
| Frontend | Vanilla HTML5 + [Alpine.js v3](https://alpinejs.dev) |
| Styling | Custom CSS — VCF-DD Design System |
| Authentication | [Supabase](https://supabase.com) Auth |
| Excel Export | [SheetJS](https://sheetjs.com) (xlsx.full.min.js) |
| Runtime | Browser-only, zero build step |

---

## Supported Scenarios

- **VCF Standard** — Management Domain + Workload Domains
- **VCF Automation** — includes VCF Automation (vRA) + vRO
- **VCF Automation + VKS** — adds Kubernetes Supervisor VLANs
- **Private AI** — AI Workload Domain role
- **Custom** — free-form configuration

---

## License

Private — © 2026 Leonardo Coscia. All rights reserved.
