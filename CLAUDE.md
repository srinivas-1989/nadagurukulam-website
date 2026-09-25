# Nada Gurukulam — Directory Reference

## Core
- **Client**: Srinivas (srinivas.viswanadha9@gmail.com), sole Super Admin
- **Stack**: Next.js 16 App Router (Vercel) · Express :10000 (Render) · Supabase Postgres · Supabase Auth (JWT)
- **Design**: NDG_Design Guidelines_V1_20260609.pdf (maroon/saffron/cream, two-side-rounded corners)

## Status (2026-09-24)
- Portal shell renders for **all authenticated roles** (`view === 'portal'`)
- Dashboard: burgundy hero, 4 metric cards, CSS activity bars, quick actions, live classes
- Sidebar (fixed, maroon) + top bar (sticky) + main (max-width 940px)
- Permission gates `perm()/canCreate()/canAdmin()/isFull()` preserved
- Build passes (`npm run build` 0 errors)
- Phases 1–6 complete; next: production stability, student analytics, lesson plans

## Roles & Permissions
- `super_admin` fixed, 17 modules, Full everywhere
- Levels: —(0) < View(1) < Self(2) < Submits(3) < Own(4) < Manage(5) < Full(6)

## Codebase Map
```
frontend/app/page.js        # single client component: public + login + portal (all roles)
frontend/app/globals.css    # NDG tokens + portal/dashboard classes
frontend/app/layout.js      # RootLayout
backend/server.js           # Express CRUD factory, authMiddleware, super_admin endpoints
specs/*.sql                 # migrations
```

## Portal Shell (view === 'portal')
- **Top bar** (64px, sticky): brand logo → public site, role badge, user name, logout
- **Sidebar** (260px, fixed): filtered module buttons via `perm(m.key)`, permission chips, timetable shortcut, logout at bottom
- **Main**: scrollable, padded, max-width 940px

## Dashboard (activeModule === 'overview')
- Dark burgundy hero (`var(--primary-deep)`, `var(--radius-xl)`)
- 4 metric cards: Users, Disciplines, Courses, Live Sessions
- CSS-only activity bar (6 metrics)
- Quick actions: top 5 modules where `canCreate()`
- Live classes: up to 3 active/scheduled from `dbData.live_sessions`

## Key Helpers (page.js)
- `fetchData()` — loads all `dbData` from API
- `perm(m)`, `canCreate(m)`, `canAdmin(m)`, `isFull(m)` — role-permission gates
- `roleCategory(roleKey)` — student/staff/system
- `apiCall(url, opts)` — JWT fetch with 401/403 handling

## Admin Endpoints
- `POST /api/admin/users/:id/reset-password` — super_admin only, temp password + OTP
- `POST /api/admin/users/:id/generate-otp` — super_admin only, OTP only

## CSS Classes (globals.css)
`.portal-shell`, `.portal-sidebar(.collapsed)`, `.portal-topbar`, `.ndg-hero`, `.ndg-metric-card`, `.ndg-activity-bar`, `.ndg-quick-action`, `.ndg-live-class-item`, responsive `@media (max-width: 768px)`

## Verification
```bash
cd frontend && npm run build  # production build succeeds
```