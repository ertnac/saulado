# Phase 0 — Setup & Deployment Guide

> Everything built and configured to complete Phase 0, and how to reproduce it.
>
> **Completed:** 2026-08-06 · **Commit:** `b054b18` · [Plan §Phase 0](../IMPLEMENTATION_PLAN.md)

---

## Table of contents

1. [What Phase 0 is](#1-what-phase-0-is)
2. [The 10 checkpoints](#2-the-10-checkpoints)
3. [Architecture](#3-architecture)
4. [Local setup](#4-local-setup)
5. [Docker](#5-docker)
6. [GitHub](#6-github)
7. [Neon — Postgres](#7-neon--postgres)
8. [Render — API](#8-render--api)
9. [Vercel — frontend](#9-vercel--frontend)
10. [Environment variables](#10-environment-variables)
11. [Verifying the deployment](#11-verifying-the-deployment)
12. [Problems hit and how they were fixed](#12-problems-hit-and-how-they-were-fixed)
13. [Troubleshooting](#13-troubleshooting)

---

## 1. What Phase 0 is

Phase 0 is the **walking skeleton** — the thinnest possible slice of the real system,
end to end, in production. No features. One HTTP request that travels:

```
browser → API → Postgres → API → browser
```

**Why first.** Deployment problems found in week one are ten-minute fixes. The same
problems found in month four are schedule-destroying, because by then they're tangled
with feature work. Five real bugs surfaced during Phase 0 (§12) — each would have been
significantly worse later.

**The bar:** _a push to `main` auto-deploys a page showing live DB status._

---

## 2. The 10 checkpoints

| #   | Checkpoint                                     | Where it lives                          |
| --- | ---------------------------------------------- | --------------------------------------- |
| 1   | Monorepo: `frontend/`, `backend/`, `shared/`   | `pnpm-workspace.yaml`                   |
| 2   | `shared/` package for cross-cutting types      | `shared/src/health.ts`                  |
| 3   | TypeScript strict + `noUncheckedIndexedAccess` | `tsconfig.base.json`                    |
| 4   | Vite + React + Tailwind + shadcn/ui            | `frontend/`                             |
| 5   | Express + Prisma + Postgres                    | `backend/`, `docker-compose.yml`        |
| 6   | `GET /api/health` → DB check → React page      | `backend/src/routes/health.ts`          |
| 7   | ESLint + Prettier + pre-commit hook            | `eslint.config.js`, `.husky/pre-commit` |
| 8   | Vitest both sides, one passing test each       | `*.test.ts(x)`                          |
| 9   | GitHub Actions on every push                   | `.github/workflows/ci.yml`              |
| 10  | Deployed to staging                            | `render.yaml`, Vercel, Neon             |

### Notes on the non-obvious ones

**#2 — `shared/`** is the contract between frontend and backend. A type changed there
breaks both sides at compile time. That's the point: it makes API drift a build error
instead of a runtime surprise. The cloze engine lands here in Phase 1.

**#3 — `noUncheckedIndexedAccess`** makes `arr[0]` typed `T | undefined` rather than `T`.
Noisy, and correct: array access genuinely can miss. Turning it on later means fixing
hundreds of sites at once, so it goes on at line zero.

**#6 — the health endpoint** runs a real `SELECT 1`, not a config check:

```ts
// backend/src/routes/health.ts
const start = performance.now()
await prisma.$queryRaw`SELECT 1`
const databaseLatencyMs = performance.now() - start
```

There are two routes with deliberately different behaviour:

| Route         | DB down                           | Purpose                                                           |
| ------------- | --------------------------------- | ----------------------------------------------------------------- |
| `/api/health` | **200**, body says `disconnected` | Uptime monitors — distinguishes "process dead" from "DB degraded" |
| `/api/ready`  | **503**                           | Deploy gates and load balancers — must fail loudly                |

Render's healthcheck points at `/api/ready`, so a deploy that can't reach Postgres never
goes live.

---

## 3. Architecture

```
                    ┌──────────────┐
   git push main ──►│    GitHub    │
                    └──────┬───────┘
                           │ webhook
              ┌────────────┼────────────┐
              ▼            ▼            ▼
        ┌─────────┐  ┌─────────┐  ┌──────────┐
        │ Actions │  │ Vercel  │  │  Render  │
        │   CI    │  │frontend │  │   API    │
        └─────────┘  └────┬────┘  └────┬─────┘
                          │  fetch     │ SQL
                          └───────────►│
                                       ▼
                                  ┌─────────┐
                                  │  Neon   │
                                  │ Postgres│
                                  └─────────┘
```

### Why this split

| Piece    | Platform   | Reason                                                                     |
| -------- | ---------- | -------------------------------------------------------------------------- |
| Frontend | **Vercel** | Static Vite bundle. No Dockerfile, no server process needed.               |
| API      | **Render** | Native Dockerfile support, free tier, no card.                             |
| Postgres | **Neon**   | Free tier is **permanent**. Render's own free DB is deleted after 90 days. |

**Railway was the original plan** (per the roadmap) but its free tier no longer exists —
after trial credit it's $5/mo minimum, and trials are fingerprinted per GitHub account.
The swap cost one config file: `backend/Dockerfile` was unchanged. That portability is
the entire argument for containerizing.

### Free-tier limits

- **Render:** sleeps after **15 min idle**; next request takes **30–60 s**. 750 hrs/month.
- **Neon:** 0.5 GB, scale-to-zero with ~500 ms wake. Permanent, no card.

---

## 4. Local setup

### Prerequisites

| Tool           | Version | Install                                                                               |
| -------------- | ------- | ------------------------------------------------------------------------------------- |
| Node           | ≥ 20    | [nodejs.org](https://nodejs.org)                                                      |
| pnpm           | ≥ 10    | `npm install -g pnpm`                                                                 |
| Docker Desktop | latest  | [docker.com/products/docker-desktop](https://www.docker.com/products/docker-desktop/) |
| Git            | latest  | [git-scm.com](https://git-scm.com)                                                    |

### Steps

```bash
git clone https://github.com/ertnac/saulado.git
cd saulado

pnpm install                        # all workspaces + builds shared/
cp backend/.env.example backend/.env

pnpm db:up                          # Postgres 16 in Docker
pnpm db:migrate                     # create the schema
pnpm dev                            # frontend :5173 + backend :3000
```

Open <http://localhost:5173>. Green **"Database connected"** = the full path works.

Amber **"Database unreachable"** means the API is up but Postgres isn't — run
`pnpm db:up`. That's a deliberate degraded state, not a crash.

### Commands

| Command                  | Does                                       |
| ------------------------ | ------------------------------------------ |
| `pnpm dev`               | Frontend + backend together                |
| `pnpm verify`            | typecheck → lint → test (**what CI runs**) |
| `pnpm build`             | Production build, all three packages       |
| `pnpm db:up` / `db:down` | Start / stop Postgres                      |
| `pnpm db:migrate`        | Create + apply a migration                 |
| `pnpm db:studio`         | Prisma Studio GUI                          |

Run `pnpm verify` before pushing — it's exactly what CI runs, so a green local run means
a green pipeline.

---

## 5. Docker

Docker has **two unrelated roles** here. Conflating them causes confusion.

| Role            | Where it runs                                  | Required?              |
| --------------- | ---------------------------------------------- | ---------------------- |
| Local Postgres  | Your machine, via `docker-compose.yml`         | **Yes**, for local dev |
| API image build | **Render's servers**, via `backend/Dockerfile` | No — Render does it    |

**You do not need Docker working locally to deploy.** Render clones from GitHub and
builds the image itself. Local Docker is only useful for catching build errors before
pushing.

### Local Postgres

```yaml
# docker-compose.yml
services:
  db:
    image: postgres:16-alpine
    ports: ['5432:5432']
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: saulado
    volumes: [pgdata:/var/lib/postgresql/data]
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U postgres -d saulado']
```

The named volume `pgdata` persists data across `db:down`. To wipe it:
`docker compose down -v`.

### The API image

`backend/Dockerfile` is a three-stage build. **Build context is the repo root**, not
`backend/` — the build needs `shared/` and the root lockfile:

```bash
docker build -f backend/Dockerfile -t saulado-api .
#                                                 ↑ root, not backend/
```

| Stage     | Does                                                                           |
| --------- | ------------------------------------------------------------------------------ |
| `deps`    | Installs from lockfile only. Cached unless a `package.json` changes.           |
| `build`   | Compiles shared → generates Prisma client → compiles backend → prunes dev deps |
| `runtime` | Copies pruned output, **regenerates Prisma client**, drops to non-root         |

Two non-obvious lines, both the result of bugs (§12):

```dockerfile
# Copies from the store instead of hardlinking — the build layer refuses links.
RUN pnpm --filter @saulado/backend --prod deploy --legacy --node-linker=hoisted /app/pruned

# Must regenerate here: `pnpm deploy` builds /app/pruned as a fresh install,
# so it ships an ungenerated @prisma/client stub.
RUN ./node_modules/.bin/prisma generate
```

### Windows note

Docker Desktop installs per-user, putting `docker` on the **user** PATH only. Some tools
(anything reading the machine PATH) won't see it. Reload both in PowerShell:

```powershell
$env:Path = [Environment]::GetEnvironmentVariable("Path","Machine") + ";" +
            [Environment]::GetEnvironmentVariable("Path","User")
```

---

## 6. GitHub

### Repository

```bash
gh repo create saulado --private --source=. --push
```

### CI

`.github/workflows/ci.yml` runs on every push and PR:

```
checkout → pnpm → node 22 → install → prisma generate → migrate
        → typecheck → lint → format:check → test → build
```

It spins up a **real Postgres 16 service container** with a `pg_isready` healthcheck, so
integration tests hit an actual database rather than a mock.

```yaml
- uses: pnpm/action-setup@v4
  # No `version:` here on purpose — the action reads `packageManager` from
  # package.json. Specifying both is a hard error (ERR_PNPM_BAD_PM_VERSION).
```

### Pre-commit hook

husky + lint-staged run ESLint and Prettier on staged files only:

```
.husky/pre-commit  →  pnpm lint-staged
```

Fast because it touches staged files, not the repo. Full verification is CI's job.

### Authentication gotchas

Two separate problems bit during setup — both covered in §12:

- **Wrong account** → `Repository not found` (GitHub returns 404, not 403, for private
  repos you can't see — deliberate information hiding)
- **Missing `workflow` scope** → pushes touching `.github/workflows/` are rejected

---

## 7. Neon — Postgres

**Why Neon over Render's built-in Postgres:** Render's free database is **deleted after
90 days**. Neon's free tier is permanent. Rebuilding your database in October is not a
tradeoff worth taking.

### Setup

1. [neon.com](https://neon.com) → **Sign up with GitHub** (no card)
2. Create a project named `saulado`, pick the nearest region
3. Dashboard → **Connection string** → **Copy**

```
postgresql://neondb_owner:xxxx@ep-xxx.region.aws.neon.tech/neondb?sslmode=require
```

**Copy the pooled connection string.** `schema.prisma` declares a single `url` with no
`directUrl`, so pooled is correct:

```prisma
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}
```

`?sslmode=require` is mandatory — Neon rejects unencrypted connections. Dropping it
produces `P1001: Can't reach database server`.

Migrations are applied automatically at container boot, so there's nothing to run by hand.

---

## 8. Render — API

### Setup

1. [render.com](https://render.com) → **Sign in with GitHub**
2. **Add new** → **Blueprint** → connect `ertnac/saulado`
3. Render reads `render.yaml` and shows the `saulado-api` service → **Apply**
4. Fill in the two prompted secrets (§10)

`render.yaml` declares the whole service, so there is no manual build configuration:

```yaml
services:
  - type: web
    name: saulado-api
    runtime: docker
    plan: free
    dockerContext: . # repo root — build needs shared/
    dockerfilePath: ./backend/Dockerfile
    healthCheckPath: /api/ready # gates the deploy on a real SELECT 1
    envVars:
      - key: NODE_ENV
        value: production
      - key: DATABASE_URL
        sync: false # prompted, never in git
      - key: CORS_ORIGIN
        sync: false
```

`sync: false` means "prompt me, don't store it in the repo." That keeps the Neon
credentials out of version control.

The database is intentionally **not** declared here — it lives on Neon.

### Where to find settings

Dashboard → **click the service name** → **Settings** tab → scroll to
**Environment Variables**.

If the page header says _Blueprint_, you're one level too high. Click into the service
itself; the header should read `saulado-api` with **Events / Logs / Metrics** tabs.

---

## 9. Vercel — frontend

### Setup

1. [vercel.com](https://vercel.com) → sign in with GitHub → **Add New Project**
2. Import `ertnac/saulado`
3. Configure:

| Field            | Value                                                                                   |
| ---------------- | --------------------------------------------------------------------------------------- |
| Root Directory   | `frontend`                                                                              |
| Framework Preset | Vite                                                                                    |
| Build Command    | `cd .. && pnpm --filter @saulado/shared build && pnpm --filter @saulado/frontend build` |
| Output Directory | `dist`                                                                                  |

The custom build command exists because the frontend imports `@saulado/shared`, which
must compile first.

4. Environment variable: `VITE_API_URL` = your Render URL, **no trailing slash**
5. Deploy, then copy the **production** URL

### Which URL to use

Vercel issues several. Use the shortest — the others change on every deploy and would
break CORS constantly.

| Use                  | Don't use                                        |
| -------------------- | ------------------------------------------------ |
| `saulado.vercel.app` | `saulado-git-main-you.vercel.app` (branch alias) |
|                      | `saulado-a1b2c3-you.vercel.app` (per-deployment) |

### Dev vs production API routing

```ts
// frontend/src/services/config.ts
const API_BASE = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '')
```

**Dev:** empty, so paths stay relative and Vite's proxy forwards `/api` to `:3000`. The
browser stays same-origin, which makes CORS and cookie behaviour match production instead
of being a dev-only special case.

**Prod:** the Render origin, because the frontend is served from a different host.

The `.replace(/\/$/, '')` strips a trailing slash defensively — but the URL still must not
be malformed otherwise.

> ⚠️ `VITE_API_URL` is baked in at **build** time. Changing it requires a **redeploy** —
> editing the variable alone does nothing.

---

## 10. Environment variables

### Backend

Validated by Zod at boot (`backend/src/config/env.ts`). A missing variable crashes with a
readable message rather than surfacing as an obscure error on first request.

| Variable       | Required | Default                 | Notes                                       |
| -------------- | -------- | ----------------------- | ------------------------------------------- |
| `DATABASE_URL` | **yes**  | —                       | Neon pooled string incl. `?sslmode=require` |
| `PORT`         | no       | `3000`                  | **Injected by Render — don't set it**       |
| `NODE_ENV`     | no       | `development`           | `production` when deployed                  |
| `CORS_ORIGIN`  | no       | `http://localhost:5173` | Comma-separated                             |

`CORS_ORIGIN` accepts multiple origins:

```
https://saulado.vercel.app,http://localhost:5173
```

```ts
corsOrigins: parsed.data.CORS_ORIGIN.split(',')
  .map((o) => o.trim())
  .filter(Boolean)
```

Keeping `localhost` in the list lets a local frontend hit the deployed API.

### Frontend

| Variable       | Notes                                                          |
| -------------- | -------------------------------------------------------------- |
| `VITE_API_URL` | Empty locally. Render origin in production, no trailing slash. |

### Order of operations

These have a circular-looking dependency; resolve it in this order:

1. Deploy API to Render → get the Render URL
2. Deploy frontend to Vercel with `VITE_API_URL` = Render URL
3. Set `CORS_ORIGIN` on Render = Vercel URL

Between 2 and 3 the frontend loads but its API calls fail with a CORS error. Expected
mid-sequence, not a bug.

---

## 11. Verifying the deployment

Three independent links. Test in order — each only makes sense if the previous passed.

### Link 1: API → Neon

```
https://YOUR-RENDER-URL/api/ready
```

```json
{
  "status": "ok",
  "database": "connected",
  "databaseLatencyMs": 174.87,
  "uptimeSeconds": 487.95,
  "version": "0.0.0"
}
```

Two things prove it: `"database": "connected"` and a **number** in `databaseLatencyMs`.
That number is a real round-trip — local Postgres is 1–5 ms, so ~175 ms means a genuine
network hop to Neon. Config alone cannot fake it.

`uptimeSeconds` climbing across reloads means no crash loop.

### Link 2: Browser → API

| URL             | Expected                                  |
| --------------- | ----------------------------------------- |
| `/api/health`   | 200, `"status": "ok"`                     |
| `/api/nonsense` | 404, `{"error":{"code":"NOT_FOUND",...}}` |

The 404 matters more than it looks: getting **your** structured error proves you're
hitting your Express app, not a platform placeholder page.

### Link 3: Frontend → API (CORS)

Open the Vercel URL → **F12**.

**Console** — CORS status:

- Clean = working
- `blocked by CORS policy` = `CORS_ORIGIN` doesn't list your Vercel URL

**Network** — check where the request actually goes:

| URL column shows                   | Meaning                                       |
| ---------------------------------- | --------------------------------------------- |
| `your-api.onrender.com/api/health` | ✅ `VITE_API_URL` correct                     |
| `saulado.vercel.app/api/health`    | ❌ empty `VITE_API_URL` — it's calling itself |

### The single strongest check

The Vercel page rendering live DB status proves all three links at once — that _is_ the
Phase 0 bar.

> First request after 15 min idle takes 30–60 s on the free plan. Looks frozen, isn't.

---

## 12. Problems hit and how they were fixed

Five real bugs. This is the return on deploying in week one.

### 1. `Repository not found` on push

`gh repo view` confirmed the repo existed, but push 404'd. Cause:

```
file:C:/Program Files/Git/etc/gitconfig   manager             ← ran FIRST
file:.git/config    !gh auth git-credential                   ← never reached
```

Git **accumulates** credential helpers across system → global → local and runs them in
order. Windows Credential Manager held a different GitHub account, and it won. Setting a
local helper _added_ one rather than replacing it.

An **empty-string entry resets the accumulated list**:

```bash
git config --local --unset-all credential.helper
git config --local --add credential.helper ""              # ← reset
git config --local --add credential.helper "!gh auth git-credential"
```

Scoped to this repo only; the stored credential was left untouched for other projects.

> GitHub returns **404, not 403**, for private repos an account can't access — it won't
> confirm a private repo exists. So "not found" often means "wrong account."

### 2. `workflow` scope missing

```
refusing to allow an OAuth App to create or update workflow
.github/workflows/ci.yml without workflow scope
```

Anything under `.github/workflows/` needs an extra scope:

```bash
gh auth refresh -h github.com -s workflow
```

### 3. CI failed — duplicate pnpm version

```
Multiple versions of pnpm specified:
  - version 11 in the GitHub Action config with the key "version"
  - version pnpm@11.20.0 in package.json with the key "packageManager"
```

`pnpm/action-setup@v4` errors when the version appears in both places. Removed the
`version:` input; `packageManager` is now the single source of truth.

### 4. Docker build failed — EROFS

```
#21 RUN pnpm --filter @saulado/backend --prod deploy --legacy /app/pruned
[ERR_PNPM_EROFS] EROFS: read-only file system,
  mkdir '/app/pruned/node_modules/.pnpm/object-assign@4.1.1/...'
```

`pnpm deploy` hardlinks from the content-addressable store; the build layer won't allow
it. Fixed with `--node-linker=hoisted`, which copies instead:

```
Packages are copied from the content-addressable store to the virtual store.
```

Costs ~20–40 MB of image size.

### 5. Container crash-looped — ungenerated Prisma client

```
Error: @prisma/client did not initialize yet.
Please run "prisma generate" and try to import it again.
```

Subtle. `prisma generate` ran in the build stage and wrote into the workspace virtual
store — then `pnpm deploy` built `/app/pruned` as a **fresh install from the store**,
shipping a clean, ungenerated stub. The build log even warned:

```
@prisma/client postinstall: prisma:warn We could not find your Prisma schema
```

Fixed by regenerating in the runtime stage, after the COPYs (where `schema.prisma` sits
at the default path) and before `USER app` (so it can still write):

```dockerfile
COPY --from=build /app/backend/prisma ./prisma
RUN ./node_modules/.bin/prisma generate
USER app
```

A related bug was fixed alongside it: the original CMD called `npx prisma migrate deploy`.
Since `--prod deploy` strips devDependencies, the pinned CLI was gone and `npx` fetched
**Prisma 7** from the registry, which rejects the datasource block with `P1012`. Moving
`prisma` into `dependencies` and calling the local binary fixed it:

```dockerfile
CMD ["sh", "-c", "./node_modules/.bin/prisma migrate deploy && node dist/server.js"]
```

### 6. Platform swap — Railway → Render + Neon

Railway's free tier no longer exists; trials are fingerprinted per GitHub account. The
migration required **one new file** (`render.yaml`) and **zero changes** to
`backend/Dockerfile`.

---

## 13. Troubleshooting

### Local

| Symptom                                      | Cause                          | Fix                    |
| -------------------------------------------- | ------------------------------ | ---------------------- |
| `Database unreachable` on the page           | Postgres not running           | `pnpm db:up`           |
| `docker: command not found` (Windows)        | Per-user PATH install          | Reload PATH — §5       |
| `ERR_PNPM_ABORTED_REMOVE_MODULES_DIR_NO_TTY` | `node_modules` state disturbed | `CI=true pnpm install` |
| Pre-commit hook fails                        | Stale deps                     | `pnpm install`, retry  |

### Deployment

| Symptom                             | Cause                           | Fix                         |
| ----------------------------------- | ------------------------------- | --------------------------- |
| Build can't find `shared/`          | Wrong build context             | `dockerContext: .` (root)   |
| `DATABASE_URL is required`          | Zod caught a missing var        | Add it in Render → Settings |
| `P1001 Can't reach database`        | Missing SSL                     | Append `?sslmode=require`   |
| `@prisma/client did not initialize` | Client not generated in runtime | §12.5                       |
| Deploy stuck "in progress"          | Healthcheck failing             | Check `/api/ready` in logs  |
| First request takes 60 s            | Free plan cold start            | Expected                    |

### Frontend

| Symptom                                | Cause                  | Fix                         |
| -------------------------------------- | ---------------------- | --------------------------- |
| CORS error in console                  | Vercel URL not allowed | Set `CORS_ORIGIN` on Render |
| Requests go to `vercel.app/api/...`    | `VITE_API_URL` empty   | Set it, **redeploy**        |
| Changed the var, nothing happened      | Baked in at build time | Redeploy                    |
| Build fails, `@saulado/shared` missing | Shared not built first | Use the build command in §9 |

---

## What's next

**Phase 1 — the cloze engine.** Pure functions in `shared/src/cloze/`: no React, no
Express, no database. It's the core IP, and the place where a bug becomes corrupted user
data six weeks later — so it gets built and tested in isolation first.

Before starting, resolve the **five scope contradictions** in
[plan §1.3](../IMPLEMENTATION_PLAN.md). One of them — forgot-password — needs an email
provider provisioned during Phase 1, so deciding it late blocks work.
