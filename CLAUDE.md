# Nada Gurukulam — Directory Reference

## Core facts
- **Client**: Srinivas (srinivas.viswanatha9@gmail.com) — Super Admin
- **Stack**: Next.js 16 App Router · Express :10000 · Supabase Postgres + Auth (JWT) · MongoDB (CMS)
- **Design**: Maroon/Saffron/Cream, two-side-rounded corners
- **Deploy**: Render (backend) + Vercel (frontend)

## Status (2026-10-04)
- **Portal shell**: Authenticated view rendering correctly for all roles.
- **Overview Layout**: Unified grid with dynamic order-agnostic packing.
- **Customization**: Widgets have user-toggleable [Stat]/[Section] kinds in Edit Mode.
- **Verification**: Build passes (npm run build). Visuals logic-verified via assertions.

## Codebase map
```
frontend/app/page.js        # Main portal/login/public client component
frontend/app/globals.css    # NDG tokens + portal/dashboard classes
frontend/app/layout.js      # RootLayout
backend/server.js           # Express API, authMiddleware, Super Admin CRUD
backend/auth-system.js      # OTP / password logic
specs/                      # HTML specs + SQL migrations
carnatic.md, course_index.md # Curriculum source content
render.yaml                 # Render blueprint
```

## Dashboard (activeModule === 'overview')
- Unified 4-column widget grid (`.ndg-widget-grid`).
- **Dynamic Row-Packing**: 4 units/line. Stat=1 unit, Section=2+ units (auto-fills row).
- **User Choice**: Toggle [Stat] (compact) vs [Section] (expanding) per widget in Edit Mode.
- **Edit Mode**: Statistics vs Sections separation visible for layout management.

## Key helpers (page.js)
- `packOverviewWidgets(list)` — Calculates dynamic spans based on widget `kind`.
- `isSectionWidget(w)` — `kind === 'section'`.
- `perm(m)`, `canCreate(m)`, `canAdmin(m)` — Permission gates.

## Roles & permissions
- 7 Levels: None(0) < View(1) < Self(2) < Submits(3) < Own(4) < Manage(5) < Full(6).
- Sidebar module visibility depends on `perm(m.key)`.

## Design tokens
`--primary` (maroon), `--accent` (saffron), `--bg` (cream), `--surface`, `--radius-xl`.

## Verification
```bash
cd frontend && npm run build
```
