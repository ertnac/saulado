# Saulado

> Learn in Context. Remember for Life.

A study app built on **context-based active recall**: you highlight words inside your own
paragraphs, and Saulado turns them into fill-in-the-blank questions that keep the
surrounding sentence intact.

**Status: Phase 0 complete** (walking skeleton). See [`IMPLEMENTATION_PLAN.md`](./IMPLEMENTATION_PLAN.md)
for scope analysis, architecture decisions, and the full phased roadmap.

**Live:** the staging deploy is Vercel (frontend) + Render (API) + Neon (Postgres).
[`docs/PHASE_0.md`](./docs/PHASE_0.md) documents every setup step, all four environment
variables, and the five bugs hit along the way.

---

## Requirements

| Tool           | Version | Notes                                      |
| -------------- | ------- | ------------------------------------------ |
| Node           | ≥ 20    | Developed on 22                            |
| pnpm           | ≥ 10    | `npm install -g pnpm`                      |
| Docker Desktop | latest  | Runs local Postgres — **required for dev** |

---

## Getting started

```bash
pnpm install                 # installs all workspaces, builds shared/
cp backend/.env.example backend/.env

pnpm db:up                   # start Postgres 16 (needs Docker Desktop running)
pnpm db:migrate              # create the schema
pnpm dev                     # frontend :5173 + backend :3000
```

Open <http://localhost:5173>. A green **"Database connected"** panel means the full
browser → API → Postgres → browser path is working.

If you see amber **"Database unreachable"**, the API is up but Postgres isn't —
run `pnpm db:up`. This is a deliberate degraded state, not a crash.

---

## Layout

```
shared/     Types and pure logic used by both sides. The cloze engine lands here in Phase 1.
backend/    Express + Prisma. API only.
frontend/   Vite + React + Tailwind.
```

`shared/` is the contract between the two. Changing a type there breaks both sides at
compile time — which is the point.

---

## Commands

| Command           | Does                                   |
| ----------------- | -------------------------------------- |
| `pnpm dev`        | Run frontend + backend together        |
| `pnpm verify`     | typecheck → lint → test (what CI runs) |
| `pnpm typecheck`  | `tsc --noEmit` across all workspaces   |
| `pnpm lint`       | ESLint, type-aware                     |
| `pnpm format`     | Prettier write                         |
| `pnpm test`       | Vitest across all workspaces           |
| `pnpm build`      | Production build of all three          |
| `pnpm db:up`      | Start Postgres                         |
| `pnpm db:down`    | Stop Postgres                          |
| `pnpm db:migrate` | Create/apply a migration               |
| `pnpm db:studio`  | Prisma Studio GUI                      |

Run `pnpm verify` before pushing. A pre-commit hook runs ESLint + Prettier on staged
files automatically.

---

## Conventions

- **TypeScript strict**, plus `noUncheckedIndexedAccess`. No `any` — enforced by lint.
- **Prettier** owns formatting. Don't argue with it.
- Every feature ships with loading, empty, and error states (plan §4.4).
- Two skills encode the project's UI and performance rules — invoke `/saulado-ux` before
  building UI, `/saulado-perf` before writing queries or adding dependencies.

---

## Endpoints

| Method | Path          | Purpose                                   | DB down |
| ------ | ------------- | ----------------------------------------- | ------- |
| `GET`  | `/api/health` | Real `SELECT 1` against Postgres + uptime | **200** |
| `GET`  | `/api/ready`  | Readiness probe — gates deploys           | **503** |

The split is deliberate. `/health` returns 200 even when degraded, so monitors can tell
"process dead" apart from "DB unreachable" — alert on `status` in the body, not the HTTP
code. `/ready` returns 503 instead, so a container that can't reach Postgres fails its
healthcheck and never takes traffic.

---

## Next

**Phase 1 — the cloze engine.** Pure functions in `shared/src/cloze/`, no React, no
Express, no database. It's the core IP of the product and the place a bug becomes
corrupted user data six weeks later, so it gets built and tested in isolation first.

Before starting, resolve the five scope questions in plan §1.3 — roughly 30 minutes.
