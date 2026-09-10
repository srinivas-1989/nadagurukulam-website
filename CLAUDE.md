# CLAUDE.md — Nada Gurukulam Website & Academic Portal

This file is the onboarding document for any future Claude session (or human developer) picking up this project. It captures the original instructions, every decision made so far, the data model, the design system, the code patterns, and where everything lives. Read this before touching any artifact or file in this project.

---

## 1. Project summary

**Nada Gurukulam** is an Indian classical performing arts institution operating under **Sri Sathya Sai University for Human Excellence**, founded/guided by **Sadguru Sri Madhusudan Sai**, embodying the **"One World One Family"** mission. The institution runs **entirely free of cost**, funded by donations — this single fact drives nearly every architecture and tooling decision below (always default to the free/lowest-cost option that doesn't weaken security).

The client is **Srinivas** (srinivas.viswanadha9@gmail.com), who will be the sole **Super Admin**.

**The ask:** rebuild the existing informational site (reference: nadagurukulam.org) into a fully dynamic, modern, interactive public website, **plus** a complete role-based academic-management portal behind login — one platform, one codebase, one content database for both layers.

**Standing directives from the client (binding on all future work):**
1. **Nothing is hardcoded** — roles, users, courses, curricula, course types, disciplines, permissions, public-site copy: all of it is editable data the Super Admin can add, edit, or delete from the UI. The portal starts **empty** (no seed data — the client explicitly declined seeding the discipline/course list; they will add Diploma/Certificate/etc. themselves).
2. **Super Admin is the one fixed role** — every other role and the entire permission matrix is data.
3. **Live at every step** — *"better give me clickable from now onwards. Live at every step with frontend and backend running."* Deliverables are working software, not static specs.

**Design source of truth:** the **NDG Design Guidelines V1** PDF (`NDG_Design Guidelines_V1_20260609.pdf`, client's iCloud → Nadagurukulam → Imp Docs → Nada Gurukulam → Art Works) — colors, type, logo files, brand elements — strictly followed, not reinterpreted. See §7. (Supersedes the earlier "Interim Branding Guidelines" draft.)

---

## 2. Where the project actually is (2026-09)

The project moved from planning artifacts (Phases 1–4, see §9) to a **real running build** in this repo:

| Phase | What | Status |
|---|---|---|
| 1–4 | Outline, public-site spec, portal spec, data model | **Done** (published artifacts, §10) |
| 3.5 | Clickable prototype (artifact, pre-repo) | **Done** — historical, superseded by the real build |
| 5 | Visual design — NDG V1 applied to the real app | **In progress** — globals.css tokens, hero brand elements, radii, fonts, real logos done; remaining: rest of public pages / portal polish |
| 6 | Build on the real stack | **In progress** — Express+Supabase+MongoDB backend and Next.js frontend run locally against the client's real cloud accounts; **no auth yet** |
| 7 | Content migration & QA | Not started (data entry is the client's, via the UI) |
| 8 | Launch & handover | Not started |

**Security state (important):** the backend has **no authentication** — every `/api/*` route is open to whoever can reach port 10000. Supabase RLS is enabled on all tables but **no policies exist yet** (the backend uses the service_role key, which bypasses RLS). **Do not deploy or expose the backend publicly until the auth/RLS hardening pass.** Credentials live only in gitignored `backend/.env` and `frontend/.env.local` — never echo them into chat, never commit them, keep the service_role key backend-only.

---

## 3. Roles & permissions (as built)

Roles are **rows in the `roles` table**, not code. Only `super_admin` exists initially; Srinivas creates every other role (Admin, Teacher, Guest Faculty, Staff, Student, …) from the **Roles & Permissions** module and sets its access level per module. There is no self-registration.

**Server-enforced invariants (backend `guard()` in `server.js`):** the Super Admin role can't be deleted or renamed, and its `role_permissions` rows can't be edited — it is the fixed anchor of the whole chain (403 with an explanatory message).

### The seven access levels (values of `role_permissions.access_level`, enforced as data)
- **Full** — create, edit, delete, module-wide settings
- **Manage** — day-to-day create/edit, not structural settings
- **Own** — Manage rights, but only on records assigned to them (their batch/session)
- **Submits** — can create/submit, needs Admin/Super Admin approval before it counts
- **View** — read-only
- **Self** — sees/acts only on their own record
- **—** — module doesn't appear in that role's sidebar at all

### Permission matrix — design target, now stored as data
The §3-per-era matrix (13 modules × 6 roles, in the Phase 3 artifact) remains the **design reference** for what levels to grant each new role. In the running system it lives entirely in the `role_permissions` table (seeded only with Super Admin = Full across all 14 modules); the Super Admin edits every other cell in the UI. The frontend reads it into `permsMap` and gates UI with `perm(m)` / `canCreate(m)` / `canAdmin(m)` / `isFull(m)` — there are **no hardcoded role checks in the UI** (grep for `role ===` should find only the super_admin CMS-editor anchor). Per-user record scoping ("Own", "Self") still needs real auth to enforce; today the picker is trusted.

### The 14 modules (keys used by `role_permissions.module_key` and the sidebar)
`overview, users, curriculum, timetable, batches, lessonplans, liveclasses, assignments, feedback, events, jobs, enquiries, activities, roles`

Module purposes: as in the Phase 3 artifact — curriculum is the hybrid record (Postgres structured fields, later MongoDB syllabus bodies); timetable feeds Jitsi room links (`https://meet.jit.si/NADA-<TITLE>-<DATE>`); assignments support audio/video submission; events/jobs carry the draft→publish gate (currently just a status field); enquiries "converted" will auto-create students.

---

## 4. Architecture

All decisions default to whatever keeps running cost at or near zero (donation-funded institution).

| Layer | Choice | Why / state |
|---|---|---|
| Frontend | **Next.js 16 (App Router, React 18)** locally; **Vercel** later | Free Hobby tier, SSR/ISR natively. NOTE: this Next version may differ from training data — read `frontend/node_modules/next/dist/docs/` before nontrivial framework work. |
| Backend | **Express** (Node) locally on :10000; **Render.com** later | One `server.js` with a generic CRUD factory + registry; no auth yet. |
| Structured data | **Supabase Postgres** (project `yucoydfekjmbiinvfhzg`, ap-southeast-1) | Backend uses the **service_role** key. RLS enabled, no policies yet (see §2 security note). |
| Flexible data | **MongoDB Atlas** (cluster0.e6leqhx.mongodb.net, db `nadagurukulam`) | CMS blocks first (`cms_blocks`); lesson plans, feedback forms, notifications later. API-layer enforcement. **Gotcha:** Node's c-ares rejects Atlas's DNS SRV response (`querySrv EBADRESP`) even though the OS resolves it — use the standard `mongodb://` multi-host URI (hosts `ac-fcvmszr-shard-00-0[0-2]`, replicaSet `ac-fcvmszr-shard-0`, `tls=true`, `authSource=admin`) instead of `mongodb+srv://`. Connection is optional at boot: if Mongo is down, Postgres modules keep working and `/api/cms/*` returns 503. |
| Auth | **Supabase Auth** — **not wired yet** | The "login" is a role picker over the `roles` table; fine for build/preview, must be replaced before any real use. |
| Live classes | **Jitsi Meet** | Free, no caps, self-hostable later. Room links generated from timetable slots. |
| Files | Supabase Storage + short-lived signed URLs (design in §6-era Phase 4 spec) | Swap to R2/B2 later without breaking links. |
| Languages | English only at launch; CMS blocks carry `locale` from day one | |
| Domain | Free subdomains now, `nadagurukulam.org` later | Registrar/DNS access for nadagurukulam.org is still an **open item on Srinivas**. |

### The hybrid-record rule
Any record with both structured, queryable fields **and** a long, richly-formatted body splits: structured half = Postgres row with a reference column, flexible half = MongoDB document. First applied to Curriculum (`disciplines.syllabus_content_id` → `curriculum_content`).

### Postgres tables (20) — `specs/phase4-supabase-schema.sql` + migrations
Identity & access: `roles`, `users`, `role_permissions` (unique(role_key, module_key), access_level check constraint).
Academic: `disciplines`, `courses` (has `course_type` text), `course_modules`, `course_types` (name unique, `semester_count`), `batches`, `batch_faculty`, `enrollments`.
Scheduling/live: `timetable_slots`, `live_sessions` (`start_time` nullable, `room_link`), `session_attendance`.
Documents: `documents`, `document_access_log`.
Public: `events`, `event_rsvps`, `jobs`, `job_applicants`, `enquiries`.
Migration SQL files (idempotent, run via Supabase SQL Editor or `backend/scripts/apply-schema.js` once the DB password is reset — a ** Supabase DB password reset is still pending**, `postgres` role password auth fails): `specs/phase4-supabase-schema.sql`, `specs/supabase-courses-migration.sql`, `specs/supabase-course-types-migration.sql`, `specs/supabase-roles-migration.sql`.

### MongoDB collections — Atlas, API-layer-enforced
`cms_blocks` (one doc per public-site section; `key` unique, `content` Mixed; `home` holds heroHeading/heroTagline/heroLede/disciplinesHeading/disciplinesSub), then later `curriculum_content`, `lesson_plans`, `feedback_forms`/`feedback_responses`, `notifications`.

---

## 5. Codebase map & patterns

```
nadagurukulam-website/
├── frontend/                 # Next.js 16 App Router, React 18, port 3000
│   ├── app/page.js           # THE app: public site + login picker + all 14 admin modules (~900 lines)
│   ├── app/globals.css       # NDG V1 design tokens (see §7-era design system doc below)
│   ├── app/icon.png          # favicon (Nataraja square crop)
│   ├── public/logo-landscape.png  # header badge (Nataraja + wordmark)
│   ├── public/logo-mark.png       # Nataraja mark crop — watermarks
│   └── .env.local            # NEXT_PUBLIC_API_URL=http://localhost:10000 (gitignored)
├── backend/
│   ├── server.js             # Express API (see patterns below), port 10000
│   ├── scripts/apply-schema.js   # applies specs/*.sql via DATABASE_URL (needs DB password reset)
│   ├── scripts/seed-cms.js   # one-time cms/home seed (hero copy) — the ONLY seed, client-approved
│   └── .env                  # SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, MONGODB_URI (gitignored)
└── specs/                    # SQL migrations (see §4)
```

### Backend patterns (`server.js`)
- **Generic CRUD factory** `crud(table, orderCol)` → list/create/update/delete; mounted for every key in `modules` via `TABLE_FOR` (module→table renames: curriculum→disciplines, timetable→timetable_slots, liveclasses→live_sessions, lessonplans→lesson_plans), `ORDER_FOR` (tables whose order column isn't created_at — e.g. role_permissions has **no created_at** and must order by module_key), `TABLES_WITH_UPDATED_AT` (only tables with that column get a timestamp on update).
- **`guard(table, id, body)`** returns a 403 message string for Super-Admin-protected writes; called by update/delete.
- **CMS endpoints** `/api/cms` (list), `/api/cms/:key` (get, returns `{key, content: null}` when absent), `PUT /api/cms/:key` (upsert). Gated on `cmsReady` (503 if Mongo down).
- Add a new module = add its table + register the key in `modules` (+ maps) — no per-module route code.

### Frontend patterns (`app/page.js`)
- One client component; `view` state: `public | login | admin`.
- All data through `fetchData()` against `${apiUrl}/api/<module>`; `dbData` holds one array per collection.
- Permissions: `perm/canCreate/canAdmin/isFull` helpers over `permsMap` (from `role_permissions`); the sidebar filters `MODULES` by `perm(m.key)`.
- Everything user-facing is data: roles, permissions, disciplines, courses, course types (with `semester_count` driving roman-numeral semester selects), CMS copy (Super Admin inline editor, PUT `/api/cms/home`).
- Styling: inline `style={{}}` objects referencing globals.css tokens; NDG signature radius via `var(--radius-xl)` / `var(--radius-xl-sm)`.
- Next.js 16 caveat: read `frontend/node_modules/next/dist/docs/` before framework-level changes (AGENTS.md warning — APIs may differ from training data).

### Running it
```bash
cd backend  && npm install && node server.js        # :10000 — watch for "MongoDB connected (cms_blocks)"
cd frontend && npm install && npm run dev           # :3000
```
Verify: `curl http://localhost:10000/api/roles` (supabase), `curl http://localhost:10000/api/cms/home` (mongo).

---

## 6. Design system — NDG Design Guidelines V1 (2026-06-09 PDF)

Source of truth: `NDG_Design Guidelines_V1_20260609.pdf` (client's iCloud, Art Works folder). Implemented in `frontend/app/globals.css` as CSS custom properties — new pages/screens must reuse these tokens, never re-derive colors.

### Colors (as implemented)
```css
--primary:#81171a;        /* Maroon — primary brand, buttons, active nav */
--primary-deep:#591b17;   /* Deep Maroon — headings/text on light grounds */
--primary-light:#9c2428;
--accent:#dd9f3c;         /* Saffron — accents, highlights, CTA */
--accent-deep:#c58539;    /* Deep Saffron — accent text on light grounds */
--accent-light:#f5b759;
--bg:#fdf3e0;             /* Cream — page background */
--bg-saffron:#fbf0d7;     /* Cream + saffron @25% — hero/band background */
--surface:#fffdf6;        /* cards */
--surface-muted:#f8eee0;
--border:#e6d6c4;  --divider:#d9c5b2;
--text:#3c3c3b; --text-soft:#4a4949; --text-faint:#575756;  /* bodycopy greys */
```

### Typography (Google Fonts fallbacks for the guidelines' licensed faces)
- Display/headings: Futura ND → **Jost** (400–700)
- Body: Gill Sans → **Nunito Sans**
- Devanagari: **Amita** for display (`font-devanagari-display`), **Tiro Devanagari Sanskrit** for body (`font-devanagari`)
- IAST / romanised shloka: **Gentium Basic Italic** (`.font-iast`)
- Informal script (taglines): **Petit Formal Script** (`.font-script`)
- Type scale: body 15.5–16px, subheading 20px, heading 24–25px, display 32–48px; line-height 1.4–1.6.

### Logo & brand elements
- **Logo files (source):** client's iCloud → `Administration/Nadagurukulam/Logo` — portrait + landscape variants in AI/PDF/PNG/JPG. Web derivatives in the repo: `frontend/public/logo-landscape.png` (header badge), `frontend/public/logo-mark.png` (watermarks), `frontend/app/icon.png` (favicon). The mark is maroon `#81171a` with the saffron Sanskrit tagline — use as-is on cream/saffron grounds; never recolor the mark.
- **Watermark:** Nataraja mark or ॐ at **10–15% opacity** (`.ndg-watermark`), behind content, `pointer-events:none`.
- **Signature shape:** two-side-rounded radius — `--radius-xl: 26px 6px 26px 6px` (cards/hero), `--radius-xl-sm: 14px 3px 14px 3px` (buttons/pills).
- **Quarter-circle corner accents** (`.ndg-corner`): large maroon/saffron circles bleeding off section corners.
- **ॐ divider** (`.ndg-om-divider`): centered glyph with flanking hairlines between public-site sections.
- Hairlines only (`--border`/`--divider`), no hard black borders. Careful grammar/spelling in all copy.

### Theming: light-only, by design
The guidelines define only the cream/maroon/saffron light world. **Do not add dark mode** — no `prefers-color-scheme` overrides, no theme toggle. Every element sets explicit token colors; `body` has an explicit background so the viewer's theme never shows through.

### CSS conventions
- Colors as tokens on bare `:root`; never a color's only definition inside a media/query block.
- `[hidden]` attribute for show/hide in React (`el.hidden`), not display toggles.
- A rule mixing a plain selector and `@media` in one comma list is invalid CSS — split into two rules.

---

## 7. Planning artifacts (Phases 1–4, historical but still the design reference)

| Phase | Title | URL |
|---|---|---|
| 1 | Nada Gurukulam Platform Outline | https://claude.ai/code/artifact/18b4e5a4-f0a1-4f91-b787-92ac62eb63d8 |
| 2 | Nada Gurukulam Public Site Spec | https://claude.ai/code/artifact/9a471405-a560-4b8e-b0ad-1e275ec3fb80 |
| 3 | Nada Gurukulam Portal Modules Spec (permission matrix detail) | https://claude.ai/code/artifact/77883c79-5a98-4142-9264-5d11aaaa51ca |
| 3.5 | Nada Gurukulam Prototype (superseded by this repo) | https://claude.ai/code/artifact/c87e2c1b-daee-4369-848f-d8c97da9c9b4 |
| 4 | Nada Gurukulam Data Model Spec | https://claude.ai/code/artifact/475fe154-017c-4645-a6cc-70029d5351d9 |

Phase 2's page-by-page public-site spec (About, Admissions, Events, Jobs, Contact, etc.) is still the backlog for the public site beyond the homepage. When the module/permission design is consulted, Phase 3 is the reference — but remember the **matrix is now editable data**, not a spec to hardcode.

---

## 8. Open items

- **Auth + RLS hardening (blocks any public deployment):** wire Supabase Auth, enforce role_permissions server-side, write RLS policies, add the Admin-approves gates server-side. The backend must not be exposed publicly before this.
- **Supabase DB password reset** — `apply-schema.js` can't connect (`password authentication failed for user "postgres"`); migrations have been run manually via the Supabase SQL Editor so far. Reset the password to re-enable scripted migrations.
- **Deployment (Vercel + Render + CI)** — blocked behind auth hardening.
- **Per-user scoping ("Own"/"Self")** needs real auth identities; today the role picker grants whole-role access.
- **Remaining hardcoded-content audit (client sign-off pending):** timetable conflict detection is client-side only (should move server-side); public site beyond the homepage is still static Phase-2-era design; footer/contact details.
- **Domain access (action on Srinivas):** restore registrar/DNS control of `nadagurukulam.org`.
- **Content TBD from client:** admissions eligibility criteria, fee/cost line, institution phone number.
- **Two-factor auth for Super Admin/Admin** — deferred to the auth pass.

---

## 9. How to resume work on this project

1. Read this file end to end — it reflects the repo as of its last update (check `git log` for anything newer).
2. Boot both servers (§5 "Running it"), confirm `/api/roles` and `/api/cms/home` respond.
3. Honor the standing directives in §1 — nothing hardcoded, Super Admin the only fixed role, live at every step.
4. Before committing: `frontend/.env.local` and `backend/.env` are gitignored — verify with `git status` that they (and `node_modules`) never appear; commit messages end with `Co-Authored-By: Claude Code <noreply@anthropic.com>`.
5. The next big work items are listed in §8 — auth hardening first, then deployment.
