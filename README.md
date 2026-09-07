# Nada Gurukulam — Website & Academic Portal

Planning, spec, and prototype materials for the Nada Gurukulam public website + role-based academic portal rebuild.

**Start here:** [`CLAUDE.md`](./CLAUDE.md) — full project onboarding doc: original instructions, architecture decisions, permission model, data model, design system, code patterns, and links to every published artifact. Read this before touching anything else in this repo.

## What's in this repo

- `CLAUDE.md` — the project's living reference document (read this first, in Claude Code or otherwise)
- `specs/phase1-platform-outline.html` — Phase 1: structure, roles, modules, stack, design system
- `specs/phase2-public-site-spec.html` — Phase 2: page-by-page public site spec
- `specs/phase3-portal-modules-spec.html` — Phase 3: field-by-field module spec + full permission matrix
- `specs/phase3.5-live-prototype.html` — Phase 3.5: clickable prototype with a live shared database (built to run as a Claude Artifact — see CLAUDE.md §8 for how to keep publishing/updating it)
- `specs/phase4-data-model-spec.html` — Phase 4: Supabase (Postgres) + MongoDB data model

Each spec file is also live and clickable at its own hosted URL — the links are in `CLAUDE.md` §10.

## Status

Phases 1–4 done. Phase 5 (visual design) and Phase 6 (real build on Vercel/Render/Supabase/MongoDB) haven't started — Phase 6 needs real cloud accounts before it can go further than scaffolding. Full status and open items: `CLAUDE.md` §2 and §11.
