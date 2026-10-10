# NDG Project Status & Roadmap

**ONE reference file.** See "Current task" → finish it → tick its checkbox → next task. Never re-derive project state from scratch; read this first. Keep ≤300 lines; update every session.

Last updated: 2026-10-10

---

## Core facts
- Client: Srinivas (srinivas.viswanatha9@gmail.com) — Super Admin.
- Stack: Next.js 16 App Router · Express :10000 · Supabase Postgres + Auth (JWT) · MongoDB (CMS).
- Design: Maroon/Saffron/Cream (`--primary` #81171a, `--accent` #dd9f3c, `--bg` #fbf0d9, `--text` #3c3c3b, `--text-faint` #575756, `--border` #e8d5b7). NOTE: `--text-secondary` does NOT exist — use `--text-faint`.
- Deploy: Render (backend) + Vercel (frontend).
- Repo: https://github.com/srinivas-1989/nadagurukulam-website
- Curriculum sources: `carnatic.md`, `course_index.md`, `specs/`.

## Non-negotiable rules (accumulated instructions)
1. **Verification**: every change → `cd frontend && npm run build` must pass.
2. **Commit & push proactively** after each completed task (ask/confirm-style, but do it).
3. **Never add attribution lines** (no Co-Authored-By, no "Generated with Claude Code") to commits/PRs.
4. **Roles are data.** Only `super_admin` is seeded in SQL; every other role & permission is portal-managed. Never hardcode a role/field in app code.
5. **New module = 2-part registration** or it's invisible + 403 even for Super Admin:
   (a) seed `super_admin` → `'Full'` row (see `specs/supabase-roles-migration.sql` / projects-certificates pattern),
   (b) add key to `const modules = [...]` + `TABLE_TO_MODULE`/`API_TO_MODULE`/`ORDER_FOR` in `backend/server.js` (~line 1449).
6. **Permission module keys ≠ table names.** `getAccessLevel()` needs a seeded `module_key` (e.g. `lms`, `curriculum`, `notifications`); a wrong key 403s everyone. Master maps: `API_TO_MODULE` (~367), `TABLE_TO_MODULE` (~399).
7. **Business rules live server-side** in `backend/server.js` (capacity/duplicate/ownership/status transitions), never computed in the React page.
8. **Idempotent SQL hides collisions**: grep `specs/*.sql` for a table name before writing migration/seed; `create table if not exists` no-ops yet reports success.
9. **RLS never guards the API** — `server.js` uses the service-role key; caller id is `req.auth.user.id` (profile is `req.auth.profile`).
10. **Frontend**: read `frontend/AGENTS.md` (this is NOT standard Next.js; breaking API changes). Big app in `frontend/app/page.js` (`activeModule` state) + standalone routes (`/notifications`, `/finance`, `/hr`, `/lms`, … 21 routes).
11. **Manual is the spec** (LMS manual, §numbers referenced in tasks). Extract with pandoc to `/tmp/lms-manual.txt` when needed.

## Data model (connected, how it fits together)
- `roles` → `role_permissions(role_key, module_key, access_level)` → `users(role_key, program_id→disciplines, level_values jsonb, employee_id/roll_no, auth_user_id→auth.users)`.
- `program_categories` (UG/PG/Diploma/Certificate) → `disciplines`(=programmes/streams; `structure_mode` yearly|semester|yearly_semester, `year_count`) → `courses`(code unique, semester, credits, cie/see) → `course_offerings`(course+term+batch+lead `faculty_id`) → `faculty_assignments`(full teaching team: teacher/guest_guru/accompanist/assistant/visiting).
- `academic_years` → `terms` → offerings/registrations. `batches`(discipline, faculty_id) → `enrollments(student,batch,status)`. `course_registrations` = student ↔ offering.
- `user_categories`.`category_level_values` = Department → Designation tree (portal Role & Categories editor); `users.level_values` holds picks.
- Modules wired: overview/users/curriculum/timetable/batches/lessonplans/liveclasses/assignments/feedback/events/jobs/enquiries/performances/lms/organisation/admissions/roles/mentorship/assessment/residential/dossiers/hr/finance/documents/media/notifications.

## Program structure (Srinivas, 2026-10-10)
- **UG**: University UG → BPA (Bachelors of Performing Arts), **semester-based**.
- **PG**: Masters of Performing Arts, semester-based.
- Streams today: Bharatanatyam, Carnatic Vocal, Hindustani Vocal, Tabla, Mridangam, Carnatic Flute, Hindustani Flute, Carnatic Violin, Hindustani Violin.
- Future expansion (may/may-not be UGC degree): Visual Arts, Folk Arts, other streams.
- **Diploma** + **Certificate** courses: yearly-based; some certificate courses only a few months.
- All kept in seed data; Srinivas will give inputs / add / change / delete seeded rows as needed.

## Execution plan
### Phase 1–6 (DONE — base portal)
- [x] Auth + roles + permission system (7 levels None<View<Self<Submits<Own<Manage<Full; thresholds list:1/create:3/update:4/delete:6).
- [x] Portal shell, roles-based sidebar + overview dashboard + widget grid (`dashboard_widgets.kind`, `/api/dashboard-widgets`).
- [x] Self-service profile (`PUT /api/me`, `SELF_EDITABLE = {name, phone, designation}`, avatar upload via Supabase Storage bucket `attachments`, custom initials).
- [x] Curriculum (programmes=disciplines/courses/modules/topics), batches, enrollments, timetable, lesson plans, live classes, LMS resources/lessons/outcomes.
- [x] Organisation/admissions, events/performances/productions, enquires/jobs, projects/certificates, mentorship/dossiers, residential/hostels.
- [x] Roles & permissions editor (portal-managed; staff tree in `category_level_values`).

### Phase 7 — Finance/HR/Documents/Notifications (near done)
- [x] Finance & Fees (`fee_structures`,`fee_items`,`fee_payments`,`salary_slips`); sponsorship tracking + fee nullification.
- [x] Staff & HR (`employees`, designations/departments via category tree, salary slips).
- [x] Documents & media modules (`document_folders`, `documents`, `media`).
- [x] Notifications engine (LMS §20/§187-200): auto-notify enrolled students on assignment publish, recipient-scoped listing, mark-as-read, topbar bell. (commit e2bcf6a).
- [x] Permission grants `specs/supabase-notifications-permissions.sql` applied 2026-10-10 (all roles View).
- [x] `notifications` / `notification_templates` tables now exist (documents-notifications spec applied 2026-10-10); auto-notify insert no longer fails silently.
- [ ] Optional: notification templates (`notification_templates`) + domain-event triggers.

### Phase 7B — Sample data (in progress)
- [x] `specs/supabase-seed-sample-data.sql` — roles (admin/teaching_faculty/non_teaching_faculty/guest_faculty/student), staff + students, UG/PG/Diploma/Certificate programmes, courses/offerings, batches, enrollments, faculty team, bootstrap permissions. Pure data, editable/deletable, similarity to how admin creates via UI. CLEANUP block included.
- [x] **Applied to live Supabase 2026-10-10.** 5 roles, 16 staff-tree nodes, 11 programmes, 4 batches, 9 sample users, 3 courses + 3 offerings, 2 faculty assignments, 94 permission rows. Re-run verified idempotent.
- [x] Applied `specs/supabase-notifications-permissions.sql` (all roles get notification View).
- [x] **Auth rows created + linked 2026-10-10** via `backend/scripts/create-sample-auth-users.js` (idempotent). All 9 sample users can log in; first login forces a password change (`must_change_password`), then modules unlock. Login verified end-to-end (auth → `public.users` link → `/api/my-permissions`).
- [x] **Table gap fixed 2026-10-10** — `apply-schema.js` FILES now lists finance-hr, documents-notifications, password-resets; applied (94→104 tables). finance-hr's stale `designation_id` FK repointed from dropped `public.designations` to `category_level_values`.
- [x] **Drift guard added** — `backend/scripts/check-schema-drift.js` (`npm run check-schema`) diffs every `create table ... public.X` in `specs/` against the live DB and exits non-zero on any miss, so a written-but-unapplied spec can never fail silently again (the exact class of the notifications bug). Currently: 95/95 present.
- [ ] Reconcile `category_level_values`: live has only `student` + a stray `test` category; seed added `staff` (16 nodes). Decide whether to re-run admin/teacher tree or edit in portal.

### Phase 8 — LMS manual Phase 1 (next feature work)
- [x] Assessment submission tracking (§201-205): `assessment_submissions` — due dates, late/submitted/evaluated states, file/video-link/text answers. Server-side gates (self-create at View, ownership on update, Manage for evaluate, duplicate + draft-publish checks) + standalone `/assessment` page. (2026-10-10)
- [x] Attendance (§206-208): `class_sessions`, `attendance_records`, `attendance_states` — session create (duplicate guard, created_by/taught_by), Manage-only markdown with state + registration checks, idempotent re-mark, and derived rollup endpoint `GET /api/attendance-summary` (present/total server-side). Standalone `/attendance` page: teacher session + roster marking, student own percentage. (2026-10-10)
- [x] Results / evaluation publication (§219-226): `evaluations`, `results`, `result_corrections`, `grading_schemes`/`rubrics`. Evaluation records marks/feedback (Manage-only, marks ≤ assessment max, 409 on double-evaluate, flips submission to evaluated); `POST /api/results/generate` derives each student's result from their evaluations (weighted by `weight_percent`, raw-marks fallback when unweighted), grades against the scheme's data-driven `bands`, and never touches a published row; `POST /api/results/:id/publish` publishes deliberately; result edits require a reason and write a `result_corrections` audit row. Standalone `/results` page: generate → publish → correct; students see only their own published results. (2026-10-10)
- [x] **Module-visibility gap fixed** (2026-10-10): `attendance` had no `role_permissions` seed, so its sidebar entry was hidden for every role but Super Admin. Applied `specs/supabase-attendance-results-permissions.sql` (attendance + results, all roles) and seeded a default grading scheme `specs/supabase-grading-scheme-default.sql`; both added to `apply-schema.js` FILES.

### Phase 9 — The 8 (analytics / integrations / mobile / etc.)
- [ ] Analytics & dashboards (enrolment/fee/attendance/result aggregates).
- [ ] Integrations (payment gateway, email/SMS providers).
- [ ] Mobile app / PWA.
- [ ] Accreditation-ready records & exports.
- (4 more items to be enumerated with Srinivas as they arise — mirror of "8 of Phase 8".)

## Current task
**Phase 8 — LMS manual features.** Assessment (§201-205), Attendance (§206-208), Results (§219-226) done. Next: enumerate the remaining Phase 8 items with Srinivas, or start Phase 9 (analytics/dashboards is the natural first: it aggregates the enrolment/fee/attendance/result data now all in place).

## Verification checklist (every task)
- [ ] `cd frontend && npm run build`
- [ ] Backend boots (`node backend/server.js`) — check for route/module errors
- [ ] SQL migrations/seeds idempotent (grep specs/ for table first, per rule 8)
- [ ] `cd backend && npm run check-schema` — no table in specs/ missing from the live DB
- [ ] New module? registered in server routes loop + super_admin seed
- [ ] Commit + push (no attribution lines)
- [ ] Update THIS file (dates, checkboxes, current task)