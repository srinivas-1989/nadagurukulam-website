# CLAUDE.md — Nada Gurukulam

Directory. Where things are, how they wire. Not docs.

## 1. Core facts
- Client: Srinivas (srinivas.viswanadha9@gmail.com), sole Super Admin.
- Ask: public site + role-based academic portal.
- Design: `NDG_Design Guidelines_V1_20260609.pdf`.

## 2. Status (2026-09-24)
- **Portal Shell Redesign Complete**: Shared authenticated portal shell now renders for ALL roles (not just admin). `view` state changed from `'admin'` to `'portal'`.
- **Dashboard Overhaul**: Replaced simple 3-card overview with full dashboard: dark burgundy welcome hero, 4 metric cards, CSS bar activity chart, quick actions panel, live classes section.
- **Sidebar & Top Nav**: Burgundy sidebar (`var(--primary-deep)`) with white module buttons, NDG rounded active states, fixed top nav bar with role label, user name, and logout.
- **Permission Preservation**: All `perm()`, `canCreate()`, `canAdmin()`, `isFull()` gates intact. Module visibility still filtered by `currentModules`. Super-admin-specific logic unchanged.
- **CSS Added**: `globals.css` updated with `.portal-shell`, `.portal-sidebar`, `.portal-topbar`, `.ndg-hero`, `.ndg-metric-card`, `.ndg-activity-bar`, `.ndg-quick-action`, `.ndg-live-class-item`, responsive `@media (max-width: 768px)` rules.
- **Build Verified**: `npm run build` passes (0 errors).
- Core: Phases 1–6 (Auth, Users, Curriculum, Timetable, Logs, Assignments, Projects, Certs) Done.
- Next: Production stability, Student Analytics, Educator Lesson Plans.

## 3. Roles & permissions
- `super_admin` (Full, 17 modules): fixed, seeded, enforced.
- Levels: —(0)<View(1)<Self(2)<Submits(3)<Own(4)<Manage(5)<Full(6).

## 4. Architecture
| Layer | Choice |
|---|---|
| Frontend | Next.js 16 App Router (Vercel) |
| Backend | Express :10000 (Render) |
| Postgres | Supabase (`yucoydfekjmbiinvfhzg`) |
| Auth | Supabase Auth (JWT) |

## 5. Codebase map
```
frontend/app/page.js              THE app: public+login+portal (all roles)
frontend/app/globals.css          NDG design tokens + portal dashboard classes
frontend/app/layout.js            RootLayout
backend/server.js                 Express: CRUD factory, authMiddleware, super_admin endpoints
specs/*.sql                       Migrations
```

## 6. Admin Endpoints
- `POST /api/admin/users/:id/reset-password`: `super_admin` only, triggers temp password update via Supabase Auth, sets `must_change_password=true`, generates and sends OTP with temp password (email only in non-production or if email fails), invalidates prior OTPs.
- `POST /api/admin/users/:id/generate-otp`: `super_admin` only, generates OTP, invalidates prior OTPs, emails user (OTP only, no temp password).

## 7. Portal Shell Architecture (Updated 2026-09-24)

### View States
- `view === 'public'` — Public academy site (unchanged).
- `view === 'login'` — Sign-in + first-login OTP password change (unchanged).
- `view === 'portal'` — Shared authenticated shell for ALL roles (was `'admin'`). Backward compatible: `'admin'` also renders shell during transition.

### Shell Layout
- **Top bar** (`header`): Brand "Nada Gurukulam", role label, user name, Logout button. Burgundy `var(--primary-deep)`, sticky, z-index 50.
- **Sidebar** (`nav`): Fixed left, `var(--primary-deep)` background, white module buttons filtered by `perm(m.key)`. Permission badge chips. Timetable shortcut.
- **Main** (`main`): Scrollable content area, padded, `max-width: 940px`.

### Dashboard (overview module)
- Dark burgundy welcome hero with name and role.
- Four metric cards: Users, Disciplines, Courses, Live Sessions.
- Activity bar: CSS-only visualization of 6 metrics.
- Quick actions: filtered by `canCreate(m.key)`, top 5 modules.
- Live classes: up to 3 active/scheduled sessions from `dbData.live_sessions`.

### Key Functions & Helpers (in page.js)
- `fetchData()` — loads all `dbData` from API endpoints.
- `perm(m)`, `canCreate(m)`, `canAdmin(m)`, `isFull(m)` — permission gates.
- `roleCategory(roleKey)` — categorizes role (student/staff/system).
- `apiCall(url, options)` — authenticated fetch with JWT, handles 401/403.

## 8. Code Quality Notes
- `frontend/app/page.js`: ~4,792 lines single client component. No duplicate declarations. Braces balanced (6626/6626).
- `backend/server.js`: 1,609 lines. Braces balanced (711/711). Syntax valid.
- ESLint: uses Next.js built-in `next lint`. No explicit config files.
- CSS: `frontend/app/globals.css` has all NDG design tokens and new dashboard classes.
