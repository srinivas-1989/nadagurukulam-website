# CLAUDE.md — Nada Gurukulam

Directory. Where things are, how they wire. Not docs.

## 1. Core facts
- School: Indian classical arts, Sri Sathya Sai University, Sadguru Sri Madhusudan Sai. Free, donation-funded.
- Client: Srinivas (srinivas.viswanadha9@gmail.com), sole Super Admin.
- Ask: public site + role-based academic portal. One codebase, one DB.
- Directives: nothing hardcoded; Super Admin fixed; live at every step.
- Design: `NDG_Design Guidelines_V1_20260609.pdf` → tokens `frontend/app/globals.css` §6.

## 2. Status (2026-09-15)
Phases 1–4 Done. 5 In progress. 6 Done — Express+Supabase+Mongo, auth+RLS, expanded users/courses, OTP first-login, assignments v2, projects+certs, Storage uploads, timetable fixed grid + multi-subject + XLSX, teaching logs. 7–8 Not started.
Security 2026-09-11: every `/api/*` behind `authMiddleware` + `role_permissions` (View/Self/Submits/Own/Manage/Full) + Own/Self scoping + publish gates. RLS 47+ idempotent (`node backend/scripts/apply-rls.js`). Anon frontend only, service_role backend only. `.env` gitignored.

## 3. Roles & permissions
- `roles` rows; `super_admin` seeded. No self-registration. `guard()` in `server.js` locks super_admin key/name/perms (403). One super_admin user enforced.
- `roles.category`: `staff`|`student`|`both`|`system` (`super_admin`=`system`). Drives form + validation.
- Levels: `—`(0)<View(1)<Self(2)<Submits(3)<Own(4)<Manage(5)<Full(6). Thresholds list1/create3/update4/delete6.
- Modules (17): `overview, users, curriculum, timetable, batches, lessonplans, liveclasses, assignments, feedback, events, jobs, enquiries, activities, projects, certificates, roles, teachinglogs`.
- Matrix: `role_permissions(role_key,module_key,access_level)` — Super Admin Full×17 seeded. Frontend `perm/canCreate/canAdmin/isFull` over `permsMap`. No `role===` except super_admin anchor.

## 4. Architecture
| Layer | Choice | Note |
|---|---|---|
| Frontend | Next.js 16 App Router → Vercel | `frontend/app/page.js` THE app (~3600 lines) |
| Backend | Express :10000 → Render (`render.yaml`, `rootDir:backend`, `/health`) | `backend/server.js` CRUD factory (~1400 lines) |
| Postgres | Supabase `yucoydfekjmbiinvfhzg` | `DATABASE_URL` pooler; service_role backend |
| MongoDB | Atlas `cluster0.e6leqhx.mongodb.net` | Optional — down → `/api/cms/*` 503 |
| Auth | Supabase Auth | JWT→`users.auth_user_id`; Bearer; 401→login; `must_change_password`→`403 PASSWORD_CHANGE_REQUIRED` |
| Live | Jitsi | `https://meet.jit.si/NADA-<TITLE>-<DATE>` |
| Files | Supabase Storage `attachments` + signed URLs | `POST /api/upload` base64 JSON (15 MB); swap to R2/B2 later |
| Domain | Subdomains now; nadagurukulam.org later | DNS Srinivas open |

Hybrid: structured→Postgres+FK; flexible→Mongo doc. First: `disciplines.syllabus_content_id→curriculum_content`. Postgres ~34: `roles, users, user_otps, role_permissions, program_categories, disciplines, courses, course_syllabi, course_modules, course_module_topics, course_types, examination_types, batches, batch_faculty, enrollments, timetable_slots, timetable_periods, live_sessions, session_attendance, documents, document_access_log, events, event_rsvps, jobs, job_applicants, enquiries, class_entries, class_confirmations, assignment_submissions, projects, certificates`.
Columns:
- `timetable_slots`: `subjects jsonb`+`course_ids uuid[]` (backfilled from `subject`); `period_number` legacy; `room` nullable
- `timetable_periods`: dynamic grid; fallback `FIXED_TT` in `page.js:612` (P1 08:15-09:00 … STUDY 14:30-16:00)
- `class_entries`: `is_conducted`, `l/th/p_count`, `remarks`, `period_label`
- `roles.category` default `staff`; `users`: `employee_id`/`roll_no` partial unique, `designation`, `program_id→disciplines`, `date_of_joining`, `year_of_commencement(2000–2100)`, `must_change_password`
- `disciplines`: `structure_mode(yearly/semester/yearly_semester)`, `year_count`, `semesters_per_year`, `category_id→program_categories`, `period_minutes(10–120, default 45)`, `period_effective_from date`, `description`
- `program_categories(id,name unique,sort_order)` seeded UG/PG
- `courses`: `teaching_periods`, `teaching_hours numeric(6,2)` (`periods*mins/60` via `deriveHours(periods,mins)`), `examination_type` legacy + `examination_type_id→examination_types`, `examination_hours_cie/see`, `cie_duration/see_duration`, `year_label/number`, `pedagogy`, `objectives_json/outcomes_json jsonb`, semester nullable
- `course_syllabi(id,course_id FK cascade, version_number, academic_year e.g.2024-25, status draft/published/archived, notes)` unique(course_id,version_number)
- `course_modules`: `syllabus_id→course_syllabi`, `rbt_levels jsonb default []`, `methodology_list jsonb default []` (legacy `rbt_level/methodology` kept)
- `course_module_topics(id,module_id FK, topic, sort_order, description text)`
- `examination_types(id,name unique)` Theory/Practical/Viva/Project

Teaching logs: `teachinglogs`→`class_entries`+`class_confirmations`, weekly Mon–Sat + XLSX via `exceljs`.
Migrations: `node backend/scripts/apply-schema.js` (19 files: phase4 … timetable-periods, roles-rename, curriculum-rebuild) + `node backend/scripts/apply-rls.js`, idempotent, SQL in `specs/`. Mongo: `cms_blocks(key unique, home→hero)` + `curriculum_content`; later `lesson_plans, feedback_forms/responses, notifications`.
Env: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`, `MONGODB_URI`, `FRONTEND_URL`, `STORAGE_BUCKET`; SMTP `SMTP_HOST/PORT/USER/PASS/FROM` (OTP email; dev returns OTP in JSON).
Deps: backend `multer`+`mammoth`+`pdf-parse`+`xlsx`; frontend `exceljs`. Syllabus parse: `bufferToText` now handles docx/pdf/xlsx/csv/html/txt/md/pptx (best-effort); `splitSyllabusChunks`+`parseSyllabusText` → papers→drafts. Template: `GET /api/curriculum/template` (auth Manage) returns XLSX Courses+Modules_Topics. Public: `GET /api/public/disciplines` now joins `program_categories` → `category_name`.

## 5. Codebase map
```
frontend/app/page.js              THE app: public+login+17 modules (grep MODULES/activeModule)
frontend/app/globals.css          NDG V1 tokens
frontend/lib/supabase.js          anon client only
backend/server.js                 Express: crud() factory + authMiddleware + guard + cmsReady + OTP + public + upload + curriculum parse/template
backend/scripts/apply-schema.js   apply SQL in order (19 files)
backend/scripts/apply-rls.js      apply RLS
specs/*.sql                       migrations (idempotent)
```
Backend: `crud(table,orderCol)`→list/create/update/delete. Maps `TABLE_FOR`, `ORDER_FOR`, `TABLES_WITH_UPDATED_AT`, `API_TO_MODULE`, `TABLE_TO_MODULE`, `OWN_BATCH_TABLES`, `modules[]`. New module = table + maps entry + `modules` key. `guard()` locks super_admin. CMS `GET/PUT /api/cms/:key` gated `cmsReady`. Public `GET /api/public/events|jobs|disciplines`, `POST /api/public/enquiries`, `GET /api/curriculum/template`. Helpers `deriveHours(periods,mins)`, `derivePeriods(hours,mins)`, `effMinutes(disc)`, `genTempPassword()`, `genOTP()`, `sendOTPEmail()`, `checkOtpRate()`. `authMiddleware` checks `must_change_password`→403 allowlist `/api/auth/*,/health,GET /api/cms,/api/public/*,/api/curriculum/template`. OTP `POST /api/auth/request-otp|verify-otp|first-password-change` public+rate-limited. `users` create whitelists columns, category-validates, creates `auth.users` then `public.users` (rollback). `courses` derives `teaching_hours` via program `period_minutes`; jsonb normalized; `course_modules` normalizes `rbt_levels/methodology_list`; `disciplines` validates `category_id/period_minutes`; `program_categories`+`course_syllabi` version auto-increment. File edits need exact string match.

Frontend: `view`=public|login|admin; `fetchData()` parallel Bearer `GET /api/<module>`; `apiCall()` handles `403 PASSWORD_CHANGE_REQUIRED`→OTP; `perm/canCreate/canAdmin/isFull` over `permsMap`; sidebar filters `MODULES`. `FIXED_TT/FIXED_TEACH/FIXED_MAP/TT_SEGMENTS/slotCoversCol` drive timetable. Single-file — search state/handler names. Styling `style={{}}`+tokens; radius `--radius-xl:26px 6px 26px 6px`. `view`+`permsMap` drive visibility; CMS via `PUT /api/cms/home`.

## 6. Design system — NDG V1
Tokens in `globals.css`. Light-only, no dark. Colors `--primary:#81171a`, `--primary-deep:#591b17`, `--accent:#dd9f3c`, `--accent-deep:#c58539`, `--accent-light:#f5b759`, `--bg:#fdf3e0`, `--bg-saffron:#fbf0d7`, `--surface:#fffdf6`, `--border:#e6d6c4`, `--text:#3c3c3b`. Fonts Jost, Nunito Sans, Amita, Tiro Devanagari, Gentium Italic, Petit Formal Script. Body 15.5–16, sub 20, heading 24–25, display 32–48, lh 1.4–1.6. Brand Nataraja `#81171a` never recolor; `.ndg-watermark` 10–15%; radius `--radius-xl-sm:14px 3px 14px 3px`; `.ndg-corner`; `.ndg-om-divider` ॐ+hairlines; hairlines only (`--border`/`--divider`). Tokens on `:root`; `[hidden]` hide; never mix plain+`@media` in one comma list.

## 7. Planning artifacts
Phase 1–4 specs: https://claude.ai/code/artifacts (ref only). Curriculum rebuild plan: `program_categories` + `course_syllabi` versioning + period per program + RBT/topic desc/methodology filter + import template.

## 8. Run & verify
```bash
cd backend && npm install && node server.js    # :10000
cd frontend && npm install && npm run dev       # :3000
node backend/scripts/apply-schema.js && node backend/scripts/apply-rls.js
curl localhost:10000/health; curl localhost:10000/api/cms/home
```

## 9. Open items
- Curriculum rebuild verify: program create/edit with category/period/date; Add Course collapsible; table click→syllabus; Add Module RBT/methodology/topics/CO; upload bulk + template download; elsewhere dropdowns; `npm run build` + `node --check`
- Deploy env Render+Vercel: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`, `MONGODB_URI`, `FRONTEND_URL`, `STORAGE_BUCKET`; SMTP at end
- Content audit footer/contact, admissions/fee/phone — TBD; Domain nadagurukulam.org (Srinivas); 2FA deferred (OTP covers)
