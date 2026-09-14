# CLAUDE.md — Nada Gurukulam

Working directory map. Not docs — where things are, how they wire.

## 1. Core facts

- School: Indian classical arts, Sri Sathya Sai University, Sadguru Sri Madhusudan Sai. Free, donation-funded.
- Client: Srinivas (srinivas.viswanadha9@gmail.com), sole Super Admin.
- Ask: public site + role-based academic portal. One codebase, one DB.
- Directives: nothing hardcoded (editable data); Super Admin fixed; live at every step.
- Design: `NDG_Design Guidelines_V1_20260609.pdf` → tokens in `frontend/app/globals.css` (§6).

## 2. Status (2026-09-14)

| Phase | Status |
|---|---|
| 1–4 Planning | Done |
| 5 Visual design | In progress |
| 6 Build | Done — Express+Supabase+MongoDB, auth+RLS. Phase 1 slice shipped: expanded users, expanded courses, OTP |
| 7 Content migration | Not started |
| 8 Launch | Not started |

Security 2026-09-11 hardening done. Every `/api/*` behind `authMiddleware` + `role_permissions` (View/Self/Submits/Own/Manage/Full) + Own/Self scoping + publish gates. RLS 47+ policies idempotent (`node backend/scripts/apply-rls.js`). Anon key frontend only, service_role backend only. `.env` gitignored.

## 3. Roles & permissions

- `roles` rows; `super_admin` seeded. No self-registration. `guard()` in `server.js` — super_admin key/name/permissions locked (403).
- `roles.category`: `staff` | `student` | `both` | `system` (super_admin=`system`). Drives form visibility + validation, not hardcode.
- Levels: `—`(0) < View(1) < Self(2) < Submits(3) < Own(4) < Manage(5) < Full(6). Thresholds: list 1, create 3, update 4, delete 6.
- Modules (14): `overview, users, curriculum, timetable, batches, lessonplans, liveclasses, assignments, feedback, events, jobs, enquiries, activities, roles`.
- Matrix: `role_permissions(role_key, module_key, access_level)` — Super Admin = Full×14 seeded.
- Frontend: `perm/canCreate/canAdmin/isFull` over `permsMap`. No `role ===` checks except super_admin anchor.

## 4. Architecture

| Layer | Choice | Note |
|---|---|---|
| Frontend | Next.js 16 App Router, React 18 → Vercel | `frontend/app/page.js` is THE app |
| Backend | Express :10000 → Render (`render.yaml`, `rootDir: backend`, `/health`) | `backend/server.js` CRUD factory |
| Postgres | Supabase `yucoydfekjmbiinvfhzg` | `DATABASE_URL` pooler; service_role backend |
| MongoDB | Atlas `cluster0.e6leqhx.mongodb.net` (`mongodb://` multi-host, NOT `mongodb+srv://`) | Optional — down → `/api/cms/*` 503 |
| Auth | Supabase Auth | JWT → `users.auth_user_id`; Bearer; 401→login. `must_change_password` gates to `403 PASSWORD_CHANGE_REQUIRED` |
| Live | Jitsi Meet | `https://meet.jit.si/NADA-<TITLE>-<DATE>` |
| Files | Supabase Storage + signed URLs | Swap to R2/B2 later |
| Domain | Free subdomains now; nadagurukulam.org later | DNS = Srinivas open item |

Hybrid rule: structured → Postgres row + FK; flexible → Mongo doc. First: `disciplines.syllabus_content_id → curriculum_content`.

Postgres (23): `roles, users, user_otps, role_permissions, disciplines, courses, course_modules, course_module_topics, course_types, examination_types, batches, batch_faculty, enrollments, timetable_slots, live_sessions, session_attendance, documents, document_access_log, events, event_rsvps, jobs, job_applicants, enquiries`

Key recent tables: `user_otps(id, user_id→users, otp_code, expires_at, consumed)` RLS; `examination_types(id, name unique)` seeded Theory/Practical/Viva/Project; `course_module_topics(id, module_id→course_modules, topic, sort_order)`.

Expanded columns:
- `roles.category` default `staff`; `users`: `employee_id`/`roll_no` (partial unique), `designation`, `program_id→disciplines`, `date_of_joining`, `year_of_commencement(2000–2100)`, `must_change_password`
- `disciplines`: `structure_mode(yearly/semester/yearly_semester)`, `year_count`, `semesters_per_year`
- `courses`: `teaching_periods`, `teaching_hours numeric(6,2)` (derived `periods*45/60`), `examination_type` (legacy text) + `examination_type_id→examination_types`, `examination_hours_cie/see`, `cie_duration/see_duration`, `year_label/number`, `pedagogy`, `objectives_json/outcomes_json jsonb`, semester nullable

Migrations: `node backend/scripts/apply-schema.js` (9 files: phase4 + courses + course_types + roles + auth-link + program-structure + users-expansion + examination-types + courses-expansion), `node backend/scripts/apply-rls.js` (RLS). All idempotent. SQL in `specs/`.

Mongo: `cms_blocks(key unique, home→hero)`, later `curriculum_content, lesson_plans, feedback_forms/responses, notifications`.

Env: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`, `MONGODB_URI`; SMTP optional `SMTP_HOST/PORT/USER/PASS/FROM` (OTP email — deferred to end; dev returns OTP in JSON).

## 5. Codebase map

```
frontend/app/page.js       # THE app: public + login + 14 modules (~2000 lines)
frontend/app/globals.css   # NDG V1 tokens
frontend/lib/supabase.js   # anon client only
backend/server.js          # Express: crud() factory + authMiddleware + guard + cmsReady + OTP
backend/scripts/apply-schema.js  # apply SQL in order
backend/scripts/apply-rls.js     # apply RLS
specs/*.sql                # migrations (idempotent)
```

Backend: `crud(table, orderCol)` → list/create/update/delete. Maps: `TABLE_FOR`, `ORDER_FOR`, `TABLES_WITH_UPDATED_AT`, `API_TO_MODULE`, `TABLE_TO_MODULE`, `OWN_BATCH_TABLES`, `modules[]`. New module = add table + maps entry + `modules` key — no per-module route. `guard()` locks super_admin. CMS: `GET /api/cms`, `GET /api/cms/:key`, `PUT /api/cms/:key` (gated `cmsReady`). Helpers: `deriveHours(periods)=periods*0.75`, `genTempPassword()` (12-char base64url), `genOTP()` (6-digit, 10m), `sendOTPEmail()` (nodemailer if `SMTP_HOST`, else dev JSON), `checkOtpRate()` (5–10/min). `authMiddleware` selects `must_change_password` → 403 allowlist `/api/auth/*,/health,GET /api/cms`. OTP: `POST /api/auth/request-otp|verify-otp|first-password-change` (public, rate-limited). `users` create whitelists columns, category-validates (student needs `roll_no+program_id+year`), creates `auth.users` then `public.users` (rollback on fail). `courses` auto-derives `teaching_hours`; jsonb normalized. `roles` custom: category on create/update. File edits need exact string match — normalize before patching.

Frontend: `view` = `public|login|admin`; `fetchData()` parallel Bearer `GET /api/<module>`; `apiCall()` handles `403 PASSWORD_CHANGE_REQUIRED` → OTP mode; `perm/canCreate/canAdmin/isFull` over `permsMap`; sidebar filters `MODULES` by `perm`. `frontend/app/page.js` is single-file — search state/handler names to locate modules (Users, Roles, Curriculum, etc.). Styling `style={{}}` + CSS tokens; radius `--radius-xl:26px 6px 26px 6px`. `view` + `permsMap` drive visibility; CMS copy via `PUT /api/cms/home` inline editor.

## 6. Design system — NDG V1

Tokens in `globals.css`. Light-only — no dark mode, no `prefers-color-scheme`.
Colors: `--primary:#81171a`, `--primary-deep:#591b17`, `--accent:#dd9f3c`, `--accent-deep:#c58539`, `--accent-light:#f5b759`, `--bg:#fdf3e0`, `--bg-saffron:#fbf0d7`, `--surface:#fffdf6`, `--border:#e6d6c4`, `--text:#3c3c3b`.
Fonts: Jost (display), Nunito Sans (body), Amita (Devanagari display), Tiro Devanagari Sanskrit, Gentium Basic Italic (IAST), Petit Formal Script (taglines). Scale body 15.5–16px, sub 20px, heading 24–25px, display 32–48px, lh 1.4–1.6.
Brand: Nataraja `#81171a` as-is never recolor; watermark `.ndg-watermark` 10–15%; radius `--radius-xl-sm:14px 3px 14px 3px`; `.ndg-corner` quarter-circles; `.ndg-om-divider` ॐ + hairlines; hairlines only (`--border`/`--divider`), no black borders.
CSS: tokens on `:root`; `[hidden]` for hide; never mix plain selector + `@media` in one comma list.

## 7. Planning artifacts

Phase 1–4 specs: https://claude.ai/code/artifacts — reference only, matrix now live data.

## 8. Run & verify

```bash
cd backend && npm install && node server.js    # :10000
cd frontend && npm install && npm run dev       # :3000
node backend/scripts/apply-schema.js && node backend/scripts/apply-rls.js
curl localhost:10000/health
curl localhost:10000/api/cms/home
```

## 9. Open items

- Deploy env on Render+Vercel: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`, `MONGODB_URI`, `FRONTEND_URL`; SMTP (`SMTP_HOST/PORT/USER/PASS/FROM`) when OTP email wired at end
- Content audit: footer/contact sign-off; admissions criteria, fee line, phone — TBD
- Domain: restore registrar/DNS for nadagurukulam.org (Srinivas)
- 2FA for Super Admin/Admin: deferred; OTP first-login now covers temp-password rotation
