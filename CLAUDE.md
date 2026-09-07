# CLAUDE.md — Nada Gurukulam Website & Academic Portal

This file is the onboarding document for any future Claude session (or human developer) picking up this project. It captures the original instructions, every decision made so far, the data model, the design system, the code patterns used across all deliverables, and where everything lives. Read this before touching any artifact or file in this project.

---

## 1. Project summary

**Nada Gurukulam** is an Indian classical performing arts institution operating under **Sri Sathya Sai University for Human Excellence**, founded/guided by **Sadguru Sri Madhusudan Sai**, embodying the **"One World One Family"** mission. It teaches six disciplines: **Carnatic Vocal, Hindustani Vocal, Bharatanatyam, Mridangam, Tabla, Flute**. The institution runs **entirely free of cost**, funded by donations — this single fact drives nearly every architecture and tooling decision below (always default to the free/lowest-cost option that doesn't weaken security).

The client is **Srinivas** (srinivas.viswanadha9@gmail.com), who will be the sole **Super Admin**.

**The ask:** rebuild the existing informational site (reference: nadagurukulam.org) into a fully dynamic, modern, interactive public website, **plus** a complete role-based academic-management portal behind login — one platform, one codebase, one content database for both layers. Nothing on the public site should be hardcoded once launched; everything is a Super-Admin-editable record.

**Design source of truth:** an uploaded "Interim Branding Guidelines" PDF (colors, type, brand elements) — strictly followed, not reinterpreted. See §7.

---

## 2. Process so far — the 8-phase roadmap

Agreed structure: outline → detail each layer → data model → visual design → build → migrate/QA → launch. Status as of this writing:

| Phase | What | Status |
|---|---|---|
| 1 | Outline & sign-off | **Done** |
| 2 | Public site detail (page-by-page spec) | **Done** |
| 3 | Portal module detail (field spec + permission matrix) | **Done** |
| 3.5 | Live clickable prototype (added mid-process, see §9) | **Done** |
| 4 | Data model (Postgres + MongoDB schema) | **Done** |
| 5 | Visual design (apply design system to real screens) | Not started |
| 6 | Build (real backend/frontend on the real stack) | Not started — **needs Srinivas's own cloud accounts** |
| 7 | Content migration & QA | Not started |
| 8 | Launch & handover | Not started |

**Critical process instruction, stated explicitly by the client and binding for all future work on this project:** *"I want to get things to be editable later... better give me clickable from now onwards. Live at every step with frontend and backend running."* — From Phase 3.5 onward, deliverables must be interactive/clickable with a working (even if scoped/prototype) backend, not just static spec documents. Static specs are still useful for the detailed field/permission-matrix work, but should be paired with or followed by something the client can actually click through.

---

## 3. Roles & permission model

Seven roles. Super Admin creates every account — **no self-registration** on the staff side. Students are enrolled by Staff/Admin, or self-convert from an Enquiry.

| Role | Created by | Scope |
|---|---|---|
| Super Admin | — (Srinivas) | Everything: all content, all 13 modules, creates every other account, only one who can create an Admin |
| Admin | Super Admin | Day-to-day ops across most modules; cannot touch design settings or create Admin/Super Admin accounts |
| Teacher / Faculty | Super Admin / Admin | Own batches: lesson plans, live classes, assignments, feedback; view curriculum/timetable |
| Guest Faculty | Super Admin / Admin | Same shape as Teacher, scoped only to specifically assigned batches/sessions |
| Staff | Super Admin / Admin | Enquiries, Jobs, Events, Activities (admin-side, not academic) |
| Student | Staff / Admin (enrollment) | Own timetable, assignments, live-class links, feedback, results — a separate, lighter portal, no admin sidebar |
| Public visitor | none | Browses site, submits enquiries, applies to jobs, views public events/docs |

### The seven access levels (used uniformly across all 13 modules)
- **Full** — create, edit, delete, change module-wide settings
- **Manage** — day-to-day create/edit, not structural settings
- **Own** — Manage rights, but only on records assigned to them (their batch/session)
- **Submits** — can create/submit, but needs Admin/Super Admin approval before it counts
- **View** — read-only
- **Self** — sees/acts only on their own record
- **—** — module doesn't appear in that role's sidebar at all

### Full permission matrix (13 modules × 6 roles)

| Module | Super Admin | Admin | Teacher | Guest Faculty | Staff | Student |
|---|---|---|---|---|---|---|
| Overview | Full | View | — | — | — | — |
| Users | Full | Manage* (not Admin/SA accounts) | — | — | — | — |
| Curriculum | Full | Manage | View | View* (own discipline) | — | Self* (own syllabus) |
| Timetable & Schedules | Full | Manage | View* (own schedule) | View* (own sessions) | — | Self |
| Batches | Full | Manage | View* (own batch) | View* (own batch) | — | — |
| Lesson Plans | Full | Approves | Own* (submits) | Own* (submits) | — | — |
| Live Classes | Full | Manage | Own* (own batches) | Own* (own batches) | — | Self (join) |
| Assignments | Full | View | Own* (own batches) | Own* (own batches) | — | Self (submit) |
| Feedback | Full | View | Own* (own batches) | Own* (own batches) | — | Self |
| Events | Full | Manage | — | — | Drafts* (Admin publishes) | Self (RSVP) |
| Jobs | Full | Manage | — | — | Drafts* (Admin publishes) | — |
| Enquiries | Full | Manage | — | — | Manage | — |
| Activities | Full | View | Own* (own batch) | Own* (own batch) | Manage | Self (view) |

This matrix is the single source of truth for the access-control layer built in Phase 6. It is enforced two different ways depending on which database a module's data lives in — see §6.

---

## 4. The 13 (+3.5) portal modules — one-line purpose each

1. **Overview** — Super Admin/Admin landing dashboard; no data of its own, reads from everything else.
2. **Users** — the only source of truth for every account; Admin can create Teacher/Guest Faculty/Staff/Student but never Admin/Super Admin (privilege-escalation boundary).
3. **Curriculum** — discipline structure + syllabus; **hybrid record** (see §6) — structured fields in Postgres, syllabus body in MongoDB.
4. **Timetable & Schedules** — recurring class schedule with conflict detection; feeds Live Classes' auto-generated room links.
5. **Batches** — cohorts: roster, capacity, faculty assignment; the scoping anchor almost every other module reads from.
6. **Lesson Plans** — Teacher/Guest Faculty draft → submit → Admin approves/returns. Draft→Review→Publish pattern #1.
7. **Live Classes** — built around the Jitsi Meet decision (§5); auto attendance on join/leave, recordings archived.
8. **Assignments** — supports file/text/**audio-video** submission types (important: Bharatanatyam/Mridangam assignments are often "record and upload," not text).
9. **Feedback** — structured, scheduled cycles (student↔faculty, peer), optionally anonymous, aggregated for Admin.
10. **Events** — Staff drafts → Admin/Super Admin publishes to the public Events page. Draft→Review→Publish pattern #2.
11. **Jobs** — same publish gate as Events; a hire auto-creates the account in Users.
12. **Enquiries** — inbox for the two public forms (Admission/General); "converted" status can auto-create a Student record.
13. **Activities** — co-curricular log (competitions, performances); evidence files reference Postgres `documents` rows.

**3.5 — Live Prototype** (added mid-process, not one of the original 13): a clickable demo of this whole system. See §9.

---

## 5. Architecture decisions & rationale

All decisions below default to whatever keeps running cost at or near zero, because the institution is 100% donation-funded and free to attend.

| Layer | Choice | Why |
|---|---|---|
| Frontend hosting | **Vercel** (changed from originally-proposed Netlify) | Public site needs SSR/incremental regen for fresh content (new events, live counts) — Next.js does this natively, Vercel runs it on the free Hobby tier with zero extra config (100GB bandwidth/mo, serverless functions, auto preview links). Netlify needs an adapter and gates SSR/edge features behind paid tiers sooner. Runner-up if unlimited bandwidth matters more: **Cloudflare Pages** (needs `next-on-pages` adapter). |
| Backend | **Render.com** | Node.js API service — auth, roles, business logic for all 13 modules. |
| Structured/permissioned data | **Supabase (Postgres)** | Users/roles/auth, batches, timetable, enrollments, enquiries, jobs, file storage. Row-Level Security enforces the permission matrix at the database layer. |
| Flexible/content-shaped data | **MongoDB (Atlas)** | CMS page blocks, lesson plans, feedback forms, activity logs, notifications. Enforced at the API layer (no native RLS equivalent). |
| Source control / CI-CD | **GitHub** | Pushes trigger Vercel + Render deploys. |
| Auth | **Supabase Auth** (confirmed in Phase 4, not a custom JWT layer) | |
| Live classes | **Jitsi Meet**, embedded via iframe API (default) | Free, open-source, no time/participant caps, no one leaves the portal; self-hostable later at zero licence cost. In-house video was rejected — running media/TURN-STUN servers is an ongoing cost this institution shouldn't carry. For large one-to-many events: apply for **Google for Nonprofits** (likely eligible as a registered charitable mission) → free Google Workspace + Meet, higher caps, Drive recording — treat as "open in new tab" for assemblies/guest lectures, not the everyday classroom tool. Zoom free tier (40-min cap) is the fallback, not the default. |
| Document storage | **Supabase Storage** (files) + **MongoDB** (metadata/access rules), for now | At scale: **Cloudflare R2** or **Backblaze B2** (~$0.015/GB-mo, S3-compatible, **no download/egress fees** — unlike AWS S3, which matters since students/staff pull documents constantly). Backend always issues short-lived signed URLs regardless of where bytes live, so this swap is invisible to the access-control model. |
| Sensitive-document safety | Encrypted "hot" copy online + periodic **encrypted offline backup** (external drive/NAS at the institution) | For ID proof, medical notes, anything involving minors. Plus: encryption at rest/in transit, per-document access log, minimal data collection, extra care for minors' data per India's data-protection expectations. |
| Languages | **English only at launch** | CMS content blocks carry a `locale` field from day one so Kannada/Hindi/Sanskrit can be added per page/section later without restructuring. Portal itself (admin/teacher/student UI) stays English-only unless told otherwise. |
| Domain | Free subdomains now (`*.vercel.app` / `*.onrender.com`), move to **nadagurukulam.org** later | Neither `nadagurukulam.org` nor `srinisir.vikaspatel.in` is currently in Srinivas's control. Demo/approval happens on the free subdomains; moving to the real domain later is a one-time DNS change, no rebuild. **Open action item on Srinivas:** track down who holds registrar/DNS access for nadagurukulam.org and get it restored. |

---

## 6. Data model (Phase 4)

### The hybrid-record rule
Any record with both structured, queryable fields **and** a long, richly-formatted body is split: the structured half is a **Postgres row** with a reference column pointing to a **MongoDB document** holding the flexible body. Applied first to Curriculum: a `disciplines` Postgres row carries a `syllabus_content_id` pointing to a `curriculum_content` MongoDB document. Apply this same pattern to any future module that mixes structured metadata with a long-form body.

### Postgres tables (16) — Supabase, RLS-enforced
Identity & access: `roles`, `users`.
Academic structure: `disciplines`, `batches`, `batch_faculty`, `enrollments`.
Scheduling & live classes: `timetable_slots`, `live_sessions`, `session_attendance`.
Documents: `documents`, `document_access_log`.
Public engagement: `events`, `event_rsvps`, `jobs`, `job_applicants`, `enquiries`.

### MongoDB collections (7) — Atlas, API-layer-enforced
`cms_blocks` (every editable public-site section from Phase 2 — one doc per block), `curriculum_content` (flexible half of Curriculum), `lesson_plans` (draft→submitted→approved), `feedback_forms` + `feedback_responses` (split so responses don't bloat the form doc), `activities` (evidence files are Postgres `documents` rows referenced by id), `notifications` (in-app/email queue).

### Sensitive-document security, four rules
1. **Every file is a row, not a loose object** — nothing is ever linked to directly by URL. The API checks `documents.visibility` against the requester's role, then issues a short-lived signed URL. Moving bytes from Supabase Storage to R2/B2 later never breaks a bookmarked link.
2. **Visibility is a value, not a folder** — `documents.visibility` ∈ {`public`, `students`, `staff`, or a specific role list}, checked on every read.
3. **`is_sensitive` triggers extra handling** — ID proof, medical notes, anything involving minors: encrypted at rest, included in the periodic offline backup, every view/download written to `document_access_log`.
4. **The access log is append-only** — `document_access_log` is written to, never edited or deleted by the application.

### Enforcing the permission matrix
- **Postgres tables → Row-Level Security policies.** E.g. a policy on `batches` literally encodes "a Teacher may SELECT this row only if their `user_id` appears in `batch_faculty` for this `batch_id`" — the database-level version of the matrix's "Own*" cells. Even a bug in application code can't leak another teacher's batch.
- **MongoDB collections → API-layer checks** in the Render backend (no native RLS equivalent).

Full detail: published artifact "Nada Gurukulam Data Model Spec" (§10).

---

## 7. Design system (from the Interim Branding Guidelines PDF)

### Colors (as CSS custom properties — reused verbatim across every artifact)
```css
--burgundy:#470500;      /* Swami's Burgundy — primary */
--burgundy-ink:#3a0400;
--maroon:#7e2320;        /* hover/active */
--ochre:#c97f1c;         /* Sandalwood — accent */
--manjal:#e0ac27;         /* highlight */
--gold:#a27c3f;           /* Ganges Gold — dividers */
--silk:#e4d5cb;           /* Himalayan Silk, light — cards */
--silk-deep:#d5bdaf;      /* surfaces */
--cream:#fffde9;          /* page background */
--purple:#432250;         /* role color: Staff */
--forest:#1f4b3f;         /* role color: Teacher */
--waters:#123151;         /* role color: Admin */
```
Role colors extend to Guest Faculty (`--ochre`) and Student (`--manjal`); Super Admin uses `--burgundy`.

### Typography
- Display: Futura PT → web fallback **Jost** (weights 400–700)
- Body sans: Gill Sans Nova → web fallback **Nunito Sans**
- Body serif (founder's messages, long-form): Garamond Premier → web fallback **EB Garamond**
- Formal script (certificates): Snell Roundhand
- Informal script (taglines like "One World One Family"): Ameyallinda Signature → web fallback **Petit Formal Script**
- Type scale: body 16px → subheading 20px → heading 24–25px → display 32px (×1.25 scale), line-height ×1.4–1.6.

Fonts are loaded via `@import url('https://fonts.googleapis.com/css2?family=...')` at the top of each `<style>` block.

### Brand elements
Gentle **wave divider** SVG between major page sections (used throughout). **Half-circle accent** is marked secondary/social-media-only in the guidelines — kept out of core portal UI, appears only on public marketing moments. No hard borders. Careful grammar/spelling throughout all copy.

### Three-state dark/light theming pattern (used in every artifact — copy this exactly for new pages)
```css
:root{
  /* light-mode token values, bare */
  --bg:var(--cream); --surface:#fffaf0; --text:#2a1712; /* ...etc */
}
@media (prefers-color-scheme: dark){
  :root:not([data-theme="light"]){
    /* dark-mode token overrides, for system-dark with no explicit override */
  }
}
:root[data-theme="dark"]{
  /* identical dark-mode overrides, for an explicit dark toggle */
}
```
Any rule mixing a plain selector and an `@media` block in one comma-separated list is **invalid CSS** — this bug was hit twice (Phase 1's decision-card mark color, Phase 3's `.perm.full` dark override) and fixed both times by splitting into two separate, valid rules. Don't repeat this mistake.

### Other CSS conventions used throughout
- `[hidden]` attribute (not `style.display`) for show/hide toggling.
- `.decision .body > b` style **direct-child selectors** where a rule must not bleed into nested inline tags (e.g. a `<b>` used for inline emphasis inside a `<p>`, versus a top-level `<b>` title).
- Numbered TOC via CSS counters (`counter-increment`, `content: counter(...)`) — any link that isn't one of the numbered items (e.g. a "cross-cutting rules" intro link) must live **outside** the `<ol>` or it throws off the numbering vs. each section's own kicker label.
- Every published page includes a `<title>` at the top and no `<!DOCTYPE>`/`<html>`/`<head>`/`<body>` tags of its own — the Artifact tool wraps the content at publish time.

---

## 8. Artifact-tool code patterns (how every deliverable in this project is actually built/shipped)

All planning documents and the live prototype are published as **Claude Artifacts** (hosted pages with their own URL, privately owned by Srinivas's account, updatable in place). Key operational patterns learned the hard way:

1. **Publish workflow:** write the page content to a local `.html` file (no doctype/html/head/body — just `<title>` + `<style>` + body content), then call the Artifact tool with that `file_path`. First publish requires a `favicon` (1–2 emoji). To update, call again with the same `file_path` **and** the artifact's `url` — this redeploys in place rather than creating a new artifact.
2. **The "haven't viewed the live version" gate:** if the artifact has been edited by anyone since you last saw it, a publish attempt is refused and the tool hands back the full live HTML inline. You must either merge your edits onto that content, or — if your local file already has the right content — explicitly call `action:"read"` on the same URL first (this "registers" the view) before retrying the publish. Retrying with unchanged content immediately after the first refusal will be rejected again as a duplicate; the explicit `read` call is required.
3. **Live database (`db` capability):** declared via `capabilities:{"db":{}}` on publish. Gives the page a real, shared, persistent JSON document store (5,000 doc cap, 256KiB/doc cap, last-writer-wins, no transactions) via `const db = await claude.use('db')` in the page's own JS. Always code the null-fallback path (`db` resolves `null` if the capability isn't available) — see the prototype's `Data` access-layer pattern below.
4. **Seed real data via `write_db`/`batch` from the authoring session — never hardcode seed-insertion logic in the page's own JS.** The prototype's in-memory fallback (`mem`) has its own seed data purely for the offline/no-`db` code path; the real `db` collections were seeded once via the Artifact tool's `batch` write action, matching the same shape.
5. **Data-access-layer pattern** (see `nada-gurukulam-prototype.html`): every read/write goes through a `Data.xxx()` method that branches on `if (db) { ...db.collection()/doc() calls... } else { ...mem fallback... }`. This is the template to extend when wiring up more modules — add `Data.listCurriculum()`, `Data.addBatch()`, etc. following the exact same shape as the existing `listEvents`/`addEvent`/`updateEvent`/`deleteEvent` methods.
6. **Cross-linking convention:** every phase document links forward and backward to the others (breadcrumb links at the top, a `.cta-band` footer CTA pointing to the next phase). When adding a new phase or updating a URL, update the links in *all* documents that reference it, not just the new one.

---

## 9. The live prototype (Phase 3.5)

**File:** `nada-gurukulam-prototype.html` — a single-file HTML/CSS/JS app (no framework), built as the direct response to the client's "clickable, live, editable" pivot request.

- **Role picker** stand-in for login (not real auth — explicitly disclaimed in-page).
- **Public site view:** hero bound to `cms/home` doc fields (`heroHeading`, `heroTagline`, `heroLede`), a published-events grid reading the `events` collection filtered `status=='published'`.
- **Admin view:** sidebar filtered per-role from a `MODULES` array's `access` map (mirrors the §3 permission matrix exactly).
- **Wired (functional) modules:** `overview` (stat tiles + Super-Admin-only inline CMS editor), `users` (list/add/toggle-active), `events` (list/draft/publish-toggle/delete — draft allowed for super_admin/admin/staff, publish/unpublish restricted to super_admin/admin), `enquiries` (list/status-dropdown/simulate-submission-form).
- **Unwired (placeholder) modules:** curriculum, timetable, batches, lessonplans, liveclasses, assignments, feedback, jobs, activities — each renders "[Module] — speced, not wired up yet" + pointer to the Phase 3 spec. **Next incremental step for this project: wire these up one at a time**, following the `Data` access-layer pattern in §8.
- **Seeded real data:** 3 events, 2 enquiries, 6 users (one per role), 1 `cms/home` doc — written via `write_db`/`batch`, not page JS.

**Important distinction to keep telling the client:** this prototype's backend is the Artifact tool's own database — genuinely live and shared, but scoped to this one page. It is **not** the real Vercel+Render+Supabase+MongoDB stack, and login is a role-picker, not real authentication. It previews what Phase 6 builds for real; Phase 6 itself still needs Srinivas's own Vercel/Render/Supabase/MongoDB Atlas accounts.

---

## 10. Reference files — everything that exists right now

### Published Artifacts (hosted, clickable, cross-linked to each other)
| Phase | Title | URL |
|---|---|---|
| 1 | Nada Gurukulam Platform Outline | https://claude.ai/code/artifact/18b4e5a4-f0a1-4f91-b787-92ac62eb63d8 |
| 2 | Nada Gurukulam Public Site Spec | https://claude.ai/code/artifact/9a471405-a560-4b8e-b0ad-1e275ec3fb80 |
| 3 | Nada Gurukulam Portal Modules Spec | https://claude.ai/code/artifact/77883c79-5a98-4142-9264-5d11aaaa51ca |
| 3.5 | Nada Gurukulam Prototype (live, has `db` capability) | https://claude.ai/code/artifact/c87e2c1b-daee-4369-848f-d8c97da9c9b4 |
| 4 | Nada Gurukulam Data Model Spec | https://claude.ai/code/artifact/475fe154-017c-4645-a6cc-70029d5351d9 |

### Local source files (cloud workspace, `/home/claude/outline_project/`)
- `nada-gurukulam-outline.html` — Phase 1 source (published above)
- `nada-gurukulam-public-site-spec.html` — Phase 2 source (published above)
- `nada-gurukulam-portal-modules-spec.html` — Phase 3 source (published above)
- `nada-gurukulam-prototype.html` — Phase 3.5 source (published above) — **the file to keep editing as more modules get wired up**
- `nada-gurukulam-data-model-spec.html` — Phase 4 source (published above)
- `CLAUDE.md` — this file
- `preview*.html` — scratch/intermediate design-QA files, not canonical, safe to ignore or delete

### Project docs (`claude/` namespace in this Claude Project — durable across sessions)
- `claude/nada-gurukulam-platform-outline.md` — Phase 1 summary + status tracker (kept up to date with links to all published artifacts — check this first in any new session)
- `claude/nada-gurukulam-public-site-spec.md` — Phase 2 summary
- `claude/nada-gurukulam-portal-modules-spec.md` — Phase 3 summary (permission matrix + module detail)

---

## 11. Open items / decisions still pending

- **Domain access (action on Srinivas):** find out who holds registrar/DNS access for `nadagurukulam.org` (likely whoever set up `srinisir.vikaspatel.in`, or the mission's IT contact) and get it restored.
- **Admissions eligibility criteria + confirmed fee/cost line** — needed before the Admissions/About pages can ship with accurate copy (flagged in Phase 2, still TBD).
- **Institution phone number** for the Contact page (flagged in Phase 2, still TBD).
- **Two-factor authentication for Super Admin/Admin login** — deferred explicitly to Phase 6 build.
- **Wiring the remaining 9 prototype modules** (Curriculum, Timetable, Batches, Lesson Plans, Live Classes, Assignments, Feedback, Jobs, Activities) — planned as incremental follow-up work, per the client's "editable at every step" direction. Do this one module at a time, not all at once.
- **Phase 5 (visual design)** and **Phase 6 (real build)** haven't started. Phase 6 requires Srinivas to create and share access to real Vercel, Render, Supabase, and MongoDB Atlas accounts before any real backend/frontend work can begin — this is a hard external dependency, not something that can be worked around.

---

## 12. How to resume work on this project

1. Read `claude/nada-gurukulam-platform-outline.md` from this Claude Project first — it's kept current with links to every published artifact and a status summary.
2. Re-read this file (`CLAUDE.md`) for the full detail behind that summary.
3. If continuing the prototype, open `/home/claude/outline_project/nada-gurukulam-prototype.html`, follow the `Data` access-layer pattern (§8.5) to wire up the next module, test locally with Playwright against the in-memory fallback path first, then publish and seed real data via `write_db`/`batch` (§8.4) — never hardcode seed data into the page's JS.
4. Any time a new artifact is published or an existing one's URL changes, update the cross-links in *every* other phase document (§8.6) and refresh the links table in §10 of this file and in the project doc.
