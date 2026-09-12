# CLAUDE.md — Nada Gurukulam

Onboarding doc. Read before touching artifacts.

## 1. Core facts

- Institution: Indian classical arts, Sri Sathya Sai University, Sadguru Sri Madhusudan Sai. Runs free, donation-funded.
- Client: Srinivas (srinivas.viswanadha9@gmail.com), sole Super Admin.
- Ask: dynamic public site + role-based academic portal behind login. One codebase, one DB.
- Standing directives: nothing hardcoded (all editable data); Super Admin is the fixed role; live at every step.
- Design source: `NDG_Design Guidelines_V1_20260609.pdf` (client iCloud). See §6.

## 2. Status (2026-09)

| Phase | Status |
|---|---|
| 1–4 Planning | Done |
| 5 Visual design | In progress |
| 6 Build | Done — Express+Supabase+MongoDB, auth+RLS wired |
| 7 Content migration | Not started (client data entry) |
| 8 Launch | Not started |

Security: auth hardening DONE (2026-09-11). Every `/api/*` gated by `authMiddleware` + `role_permissions` + `Own`/`Self` scoping + publish gates. RLS 47 policies (idempotent via `node backend/scripts/apply-rls.js`). Anon key frontend only, service_role backend only. `.env` files gitignored.

## 3. Roles & permissions

Roles = rows in `roles` table. Super Admin exists initially; Srinivas creates others via UI. No self-registration.

**Server invariants:** `guard()` in `server.js` — Super Admin can't be deleted/renamed, its `role_permissions` can't be edited (403).

7 access levels: **Full** (CRUD+settings), **Manage** (day-to-day), **Own** (Manage + record scope), **Submits** (needs approval), **View**, **Self** (own record only), **—** (module hidden).

14 modules: `overview, users, curriculum, timetable, batches, lessonplans, liveclasses, assignments, feedback, events, jobs, enquiries, activities, roles`

Permission matrix lives in `role_permissions` table (seeded Super Admin = Full × 14 modules). Frontend: `perm/canCreate/canAdmin/isFull` over `permsMap`. No hardcoded role checks (grep `role ===` finds only super_admin anchor).

## 4. Architecture

Cost: zero-default (donation-funded).

| Layer | Choice | Key detail |
|---|---|---|
| Frontend | Next.js 16 App Router, React 18, Vercel later | Read `frontend/node_modules/next/dist/docs/` before framework work |
| Backend | Express :10000, Render later | `server.js` CRUD factory + authMiddleware + guard + cmsReady gate |
| Postgres | Supabase `yucoydfekjmbiinvfhzg` | service_role backend; RLS 47 policies |
| MongoDB | Atlas `cluster0.e6leqhx.mongodb.net` | `mongodb://` multi-host URI (NOT `mongodb+srv://` — c-ares rejects SRV). Optional: down → `/api/cms/*` 503 |
| Auth | Supabase Auth | JWT → `auth_user_id` lookup; Bearer token; 401→login |
| Live | Jitsi Meet | Room links `https://meet.jit.si/NADA-<TITLE>-<DATE>` |
| Files | Supabase Storage + signed URLs | Swap to R2/B2 later |
| Domain | Free subdomains now; nadagurukulam.org later | DNS access = open item for Srinivas |

**Hybrid record rule:** structured half → Postgres row + reference; flexible half → MongoDB doc. First applied: Curriculum (`disciplines.syllabus_content_id` → `curriculum_content`).

**Postgres tables (20):** `roles, users, role_permissions, disciplines, courses, course_modules, course_types, batches, batch_faculty, enrollments, timetable_slots, live_sessions, session_attendance, documents, document_access_log, events, event_rsvps, jobs, job_applicants, enquiries`

**Migrations:** `node backend/scripts/apply-schema.js` (schema), `node backend/scripts/apply-rls.js` (RLS+auth link). SQL files in `specs/`.

**MongoDB collections:** `cms_blocks` (key unique, home→hero copy), later `curriculum_content, lesson_plans, feedback_forms/responses, notifications`.

## 5. Codebase patterns

```
frontend/app/page.js       # THE app: public site + login + 14 modules (~900 lines)
frontend/app/globals.css   # NDG V1 tokens
backend/server.js          # Express API: crud(table, orderCol) factory + guard + CMS endpoints
```

**Backend patterns:** `crud(table, orderCol)` → list/create/update/delete; `TABLE_FOR`/`ORDER_FOR`/`TABLES_WITH_UPDATED_AT` maps; `guard()` for Super Admin writes; CMS: `/api/cms`, `/api/cms/:key`, `PUT /api/cms/:key` (gated on `cmsReady`). New module = table + `modules` key + maps, no per-module route code.

**Frontend patterns:** `view` state `public|login|admin`; `fetchData()` against `${apiUrl}/api/<module>`; `perm/canCreate/canAdmin/isFull` over `permsMap`; sidebar filters `MODULES` by `perm(m.key)`. Everything data-driven: roles, permissions, disciplines, courses, CMS copy (Super Admin inline editor → PUT `/api/cms/home`). Styling via `style={{}}` + CSS tokens; NDG radius `--radius-xl`/`--radius-xl-sm`.

**Run:**
```bash
cd backend && npm install && node server.js    # :10000
cd frontend && npm install && npm run dev       # :3000
```
Verify: `curl localhost:10000/api/roles`, `curl localhost:10000/api/cms/home`.

## 6. Design system — NDG V1

Source: `NDG_Design Guidelines_V1_20260609.pdf`. Tokens in `globals.css`.

**Colors:** `--primary:#81171a` (maroon), `--primary-deep:#591b17`, `--accent:#dd9f3c` (saffron), `--accent-deep:#c58539`, `--accent-light:#f5b759`, `--bg:#fdf3e0`, `--bg-saffron:#fbf0d7`, `--surface:#fffdf6`, `--border:#e6d6c4`, `--text:#3c3c3b`.

**Fonts:** Jost (display), Nunito Sans (body), Amita (Devanagari display), Tiro Devanagari Sanskrit (body), Gentium Basic Italic (IAST), Petit Formal Script (taglines). Scale: body 15.5–16px, subheading 20px, heading 24–25px, display 32–48px, lh 1.4–1.6.

**Brand elements:** Nataraja mark `#81171a` — use as-is, never recolor. Watermark `.ndg-watermark` 10–15% opacity. Radius `--radius-xl: 26px 6px 26px 6px`, `--radius-xl-sm: 14px 3px 14px 3px`. `.ndg-corner` quarter-circles, `.ndg-om-divider` ॐ with hairlines. Hairlines only (`--border`/`--divider`), no hard black borders.

**Theming:** light-only. No dark mode, no `prefers-color-scheme`.

**CSS conventions:** tokens on `:root`; `[hidden]` for show/hide; never mix plain selector + `@media` in one comma list.

## 7. Planning artifacts (historical reference)

Phase 1–4 specs: https://claude.ai/code/artifacts — design reference only, matrix now editable data.

## 8. Open items

- Deployment (Vercel+Render+CI): unblocked, needs env vars on both platforms
- Content audit: footer/contact details (client sign-off pending)
- Domain: restore registrar/DNS for nadagurukulam.org (action for Srinivas)
- Content TBD: admissions criteria, fee line, phone number
- 2FA for Super Admin/Admin: deferred
