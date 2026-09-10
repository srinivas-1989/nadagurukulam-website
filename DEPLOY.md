# Deploy — Vercel (frontend) + Render (backend)

## One-time setup

### 1. Backend → Render (render.yaml blueprint)

Dashboard: https://dashboard.render.com → New → Blueprint → select this repo.

Blueprint `render.yaml` is already committed (rootDir `backend`, start `node server.js`, health `/health`).

Set env vars in Render dashboard (never committed):

| Key | Value (copy from `backend/.env`) |
|-----|----------------------------------|
| `SUPABASE_URL` | `https://yucoydfekjmbiinvfhzg.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role key (Project Settings → API) |
| `DATABASE_URL` | Supabase pooled connection URI |
| `MONGODB_URI` | `mongodb://ac-fcvmszr-shard-00-*.../nadagurukulam?tls=true&...` (non-SRV multi-host) |
| `FRONTEND_URL` | Vercel URL(s), comma-separated. Example: `https://nadagurukulam.vercel.app,https://nadagurukulam-website.vercel.app` — previews `*.vercel.app` are auto-allowed via CORS wildcard, so you can also just set the main URL. |

Render assigns a URL like `https://nadagurukulam-api.onrender.com` — note it for the next step.

### 2. Frontend → Vercel

Dashboard: https://vercel.com/new → Import `srinivas-1989/nadagurukulam-website`.

**Important:** Project Settings → General → Root Directory = `frontend` (the Next app lives in `frontend/`, not repo root). Build command `npm run build` and output `.next` are auto-detected once root dir is set.

Env vars (Vercel → Settings → Environment Variables — Production + Preview):

| Key | Value |
|-----|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | same `SUPABASE_URL` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon public key (Project Settings → API → anon) |
| `NEXT_PUBLIC_API_URL` | Render backend URL, e.g. `https://nadagurukulam-api.onrender.com` |

No `FRONTEND_URL` on Vercel — that's a backend var.

### 3. Verify

```bash
curl https://<render-url>/health        # {"ok":true}
curl https://<render-url>/api/health    # {"ok":true,"cms":"up"}
curl https://<vercel-url>               # 200, hero heading, Sign In button
curl https://<render-url>/api/users -H "Authorization: Bearer <JWT>" # 200 as Super Admin
```

Log in at the Vercel URL: `srinivas.viswanadha9@gmail.com` / `Sri.loving*1989` → header shows `Role: Super Admin`, sidebar 14 modules.

## Why this layout

- Repo is monorepo (root has no `package.json`): Vercel root dir `frontend` + Render `rootDir: backend` is the standard setup.
- Backend `GET /health` and `GET /api/health` are public (no auth) — Render health checks and uptime monitors hit them.
- CORS allows `http://localhost:3000` + every URL in comma-separated `FRONTEND_URL` + any `*.vercel.app` preview (needed while Vercel assigns new preview URLs).
- `frontend/public/` logos were untracked until `18b2604` — if header still 404 on Vercel, hard-refresh and verify the latest commit is deployed.

## Updating

Push to `master` → Vercel and Render auto-deploy (if connected). Rotate `FRONTEND_URL` on Render whenever the Vercel production domain changes.

## Domain (later)

Registrar for `nadagurukulam.org` → point to Vercel (frontend) and add backend as `api.nadagurukulam.org` (CNAME to Render) → update `FRONTEND_URL` on Render to `https://nadagurukulam.org` and `NEXT_PUBLIC_API_URL` on Vercel to `https://api.nadagurukulam.org` → add both to Supabase Auth → URL Configuration → Site URL / Redirect URLs.
