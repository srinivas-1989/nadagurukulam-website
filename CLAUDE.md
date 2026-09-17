# CLAUDE.md — Nada Gurukulam

Directory. Where things are, how they wire. Not docs.

## 1. Core facts
- Client: Srinivas (srinivas.viswanadha9@gmail.com), sole Super Admin.
- Ask: public site + role-based academic portal.
- Design: `NDG_Design Guidelines_V1_20260609.pdf`.

## 2. Status (2026-09-17)
- Admin: added `/api/admin/users/:id/reset-password` (temp password + OTP) and `/api/admin/users/:id/generate-otp` (OTP only), protected by `super_admin` role.
- Auth: first-login password change flow active.
- Core: Phases 1–6 Done.

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
frontend/app/page.js              THE app: public+login+17 modules
backend/server.js                 Express: CRUD factory, authMiddleware, super_admin endpoints
specs/*.sql                       Migrations
```

## 6. Admin Endpoints
- `POST /api/admin/users/:id/reset-password`: `super_admin` only, triggers temp pwd update, `must_change_password=true`, generates OTP, invalidates prior OTP, emails user.
- `POST /api/admin/users/:id/generate-otp`: `super_admin` only, generates OTP, invalidates prior OTP, emails user.
