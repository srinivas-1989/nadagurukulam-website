# Nada Gurukulam — Directory Reference

Where things are and how they wire. Not docs, not onboarding. Read before editing anything.

## Core facts
- **Client**: Srinivas (srinivas.viswanatha9@gmail.com) — sole Super Admin
- **Stack**: Next.js 16 App Router (Vercel) · Express :10000 (Render) · Supabase Postgres + Auth (JWT) · MongoDB (CMS/curriculum content)
- **Design**: `NDG_Design Guidelines_V1_20260609.pdf` — maroon/saffron/cream, two-side-rounded corners
- **Deploy**: `render.yaml` (backend blueprint) + Vercel root dir `frontend`. See `DEPLOY.md`.

## Status (2026-09-26)
- Portal shell renders for **all authenticated roles** (`view === 'portal'`)
- Dashboard: burgundy hero, 4 metric cards, CSS activity bars, quick actions, live classes
- Sidebar (fixed, maroon) + top bar (sticky) + main (max-width 940px)
- Permission gates `perm()/canCreate()/canAdmin()/isFull()` preserved
- Build passes (`npm run build` exit 0, no warnings after `turbopack.root` pinned)
- Phases 1–6 complete; next: production stability, student analytics, lesson plans
- **Unverified**: the `</nav>` + topbar fixes render only inside the authenticated shell — build-verified, not browser-verified (needs a login)

## Codebase map
```
frontend/app/page.js        # 4802 lines, one client component: public + login + portal (all roles)
frontend/app/globals.css    # NDG tokens + portal/dashboard classes
frontend/app/layout.js      # RootLayout
frontend/lib/supabase.js    # browser Supabase client (NEXT_PUBLIC_* env)
frontend/public/            # logo-landscape.png, logo-mark.png
frontend/next.config.mjs    # pins turbopack.root to frontend/ (stops parent-dir inference)
backend/server.js           # 1608 lines, Express CRUD factory, authMiddleware, super_admin endpoints
backend/auth-system.js      # OTP / password auth logic
backend/scripts/            # apply-schema, apply-rls, seed-cms, mongo probes (fix-mongo-uri, probe-mongo)
backend/test-auth.js
specs/                      # phase1–5 HTML specs + 22 supabase-*.sql migrations, apply in filename order
carnatic.md, hindustani.md, course_index.md, dynamic-tools.md   # curriculum source content (~2k lines)
render.yaml                 # Render blueprint: rootDir backend, node server.js, /health
DEPLOY.md, README.md, plan_of_action.md
```

## Environment
- `frontend/.env.local` — `NEXT_PUBLIC_API_URL` (falls back to `http://localhost:10000`, page.js:191), `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `backend/.env` — `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`, `MONGODB_URI`, `PORT`
- Never commit either. Backend loads `backend/.env` explicitly; optional deps (nodemailer, multer, mammoth, pdf-parse, xlsx) are `require`d in try/catch — a missing one silently disables that feature.

## Roles & permissions
- `super_admin` fixed, 17 modules, Full everywhere
- Levels: —(0) < View(1) < Self(2) < Submits(3) < Own(4) < Manage(5) < Full(6)
- Sidebar renders a module only when `perm(m.key)` passes; quick actions filter on `canCreate()`

## Portal shell (view === 'portal')
- **Top bar** (64px, sticky): brand logo → public site, collapse toggle, role badge, user name, logout
- **Sidebar** (260px, fixed, `<nav>`): filtered module buttons, permission chips, timetable shortcut, logout at bottom
- **Main** (`<main className="portal-content">`): scrollable, padded, max-width 940px (`none` on timetable)

## Modules
`overview` `users` `curriculum` `timetable` `batches` `lessonplans` `liveclasses` `assignments` `feedback` `events` `jobs` `enquiries` `activities` `projects` `certificates` `roles` `teachinglogs` — defined once in `MODULES` (page.js:146)

## Dashboard (activeModule === 'overview')
- Dark burgundy hero (`var(--primary-deep)`, `var(--radius-xl)`)
- 4 metric cards: Users, Disciplines, Courses, Live Sessions
- CSS-only activity bar (6 metrics)
- Quick actions: top 5 modules where `canCreate()`
- Live classes: up to 3 active/scheduled from `dbData.live_sessions`

## Key helpers (page.js)
- `fetchData()` — loads all `dbData` from API
- `perm(m)`, `canCreate(m)`, `canAdmin(m)`, `isFull(m)` — role-permission gates
- `roleCategory(roleKey)` — student/staff/system
- `apiCall(url, opts)` — JWT fetch with 401/403 handling

## Backend routes
`/health` `/api/auth` `/api/users` `/api/roles` `/api/curriculum` `/api/curriculum-content` `/api/cms` `/api/admin` `/api/upload` `/api/user-kyc-docs` `/api/public`
- `POST /api/admin/users/:id/reset-password` — super_admin only, temp password + OTP
- `POST /api/admin/users/:id/generate-otp` — super_admin only, OTP only

## Design tokens (globals.css)
`--primary` `--primary-deep` `--primary-light` `--accent` `--accent-deep` `--accent-light` `--bg` `--bg-saffron` `--surface` `--surface-muted` `--text` `--text-soft` `--text-faint` `--border` `--divider` `--radius` `--radius-lg` `--radius-xl` `--radius-xl-sm` `--shadow-sm` `--shadow-md` `--shadow-lg`

## CSS classes
`.portal-shell` `.portal-layout` `.portal-sidebar(.collapsed)` `.portal-topbar(-left/-right)` `.portal-brand` `.portal-role-badge` `.portal-user-name` `.portal-action-btn` `.portal-action-group` `.portal-content` `.portal-settings-menu` `.portal-settings-item` `.portal-settings-anchor` `.ndg-hero` `.ndg-metric-card` `.ndg-activity-bar` `.ndg-quick-action` `.ndg-live-class-item` · responsive `@media (max-width: 768px)`

## Gotchas
- No ESLint is installed and Next 16 removed `next lint`, so there is no lint check. The only automated verification is `npm run build`.
- `page.js` is one ~4800-line client component. A single unclosed JSX tag silently re-parents every later closing tag and surfaces as a parse error thousands of lines from the real defect — read the nesting, not the error line.
- `frontend/AGENTS.md` and `frontend/CLAUDE.md` are generated by `next dev`; they self-re-add if deleted.

## Verification
```bash
cd frontend && npm run build
```
