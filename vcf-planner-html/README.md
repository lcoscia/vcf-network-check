# VCF 9 Network Planner

Single-page network design tool for VMware Cloud Foundation 9 pre-deployment planning.

## Features

- **9 planning tabs**: Overview, Management Domain, Platform Services, Workload Domains, VLAN Design, Appliances, VIPs, Validation, Export/Import
- **Automatic CIDR sizing** with configurable growth buffer
- **VCF 9 design rules**: Fleet Network routing, collector placement, VKS 5-consecutive-IP requirements, VCF Automation 4-node HA
- **NSX VPC planning** for VKS deployments (Private / Public / Isolated subnets)
- **Excel export** (5 sheets: Domain Summary, VLANs, Appliances, VIPs, Validation)
- **JSON import/export** for state persistence
- **Authentication required** — Supabase username/password login

## Setup

1. Clone the repository:
   ```bash
   git clone https://github.com/rusherleo/vcf-network-check.git
   cd vcf-network-check
   ```

2. Create your config file from the example:
   ```bash
   cp config.example.js config.js
   ```

3. Edit `config.js` and fill in your Supabase project URL and anon key.

4. Open `index.html` in a browser (or serve with any static HTTP server):
   ```bash
   npx serve .
   # or
   python3 -m http.server 8080
   ```

5. Log in with your Supabase-managed username and password.

## Authentication

Uses the same Supabase project and `profiles` table as VCF-DD. Users must have `active = true` in their profile to access the tool. Login is by username via the `get_email_by_username` RPC function.

## Tech Stack

- [Alpine.js v3](https://alpinejs.dev/) — reactivity
- [Tailwind CSS](https://tailwindcss.com/) — styling (CDN)
- [Supabase JS v2](https://supabase.com/docs/reference/javascript) — authentication
- [SheetJS (xlsx)](https://sheetjs.com/) — Excel export

## License

Internal use only.
