# CreatorHub — Creator Portal

A creator-management portal where video creators upload content, set a price, publish it for paid access, and track sales. Built as a take-home assessment.

**Much of this is deliberately simulated** (no real video storage, payments, or identity provider). The README and UI say so where it matters.

| Document | What it covers |
|---|---|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | **Part 1:** demo stack · **Part 2:** production video architecture (upload → paid playback) · **Part 3:** `cost-model` scenarios |
| [docs/PRODUCT.md](docs/PRODUCT.md) | **Part Six:** three product improvements (#1 publish-when-ready **built**) |
| [AI-USAGE.md](AI-USAGE.md) | How AI tools were used |

## Table of contents

- [Architecture](#architecture)
- [Product (Part Six)](#product-part-six)
- [Tech stack](#tech-stack)
- [Setup and run](#setup-and-run)
- [Environment variables](#environment-variables)
- [Demo accounts and seed data](#demo-accounts-and-seed-data)
- [Demo controls](#demo-controls)
- [Resetting demo data](#resetting-demo-data)
- [Does data persist?](#does-data-persist)
- [What is simulated](#what-is-simulated)
- [Publication rule](#publication-rule)
- [Running tests](#running-tests)
- [Scope against the assignment](#scope-against-the-assignment)
- [Engineering judgment](#engineering-judgment)
- [Assumptions and known limitations](#assumptions-and-known-limitations)
- [Time spent](#time-spent)
- [Git and submission](#git-and-submission)

## Architecture

Video upload, transcoding, CDN delivery, paid-content protection, failure paths, and scale/cost are **not implemented** in this repo. The full write-up (with diagrams) is in **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)**:

- **Part 1** — What is actually built (Next.js API, JSON store, simulated upload).
- **Part 2** — Production design: presigned multipart upload, queue + HLS, signed cookies, popularity-tiered cost.
- **Part 3** — Reproducible monthly cost scenarios (`npm run cost-model`).

## Product (Part Six)

The brief’s **product challenge**: three improvements beyond the minimum scope. Full write-up in **[docs/PRODUCT.md](docs/PRODUCT.md)**.

| # | Recommendation | Status |
|:--:|---|:---:|
| 1 | Publish automatically after verification (explicit, cancellable intent) | **Built** |
| 2 | Net earnings and payout clarity (gross, fees, net, payout holds) | Documented |
| 3 | Creator performance insights (actionable prompts from existing metrics) | Documented |

Try #1: sign in as **Sam**, publish with **Verify later, publish when approved**, then approve from demo controls.

## Tech stack

| Layer | Choice |
|---|---|
| Framework | Next.js 16 App Router (pages, layouts, API route handlers) |
| UI | React 19, TypeScript, Tailwind CSS |
| Data fetching | SWR (cache, dedupe, `keepPreviousData` on lists) |
| Validation | Zod (shared schemas in browser and API) |
| Charts | Recharts (lazy-loaded on dashboard) |
| Tests | Vitest (unit + API), Playwright scripts in `e2e/` (manual) |
| Storage | JSON file behind a `Store` interface (`.data/db.json`) |

## Setup and run

Requires **Node.js 20.9+**.

```bash
git clone https://github.com/Abani-kumar/creatorhub
cd creatorhub
npm ci
npm run dev        # http://localhost:3000 — demo mode on automatically
```

Open the app. Pick **Maya** or **Sam** on sign-in, or **register** a new creator.

**Other commands**

```bash
npm run build      # production build
npm start          # production start (demo OFF unless DEMO_MODE=true)
npm test           # Vitest (124 tests)
npm run typecheck  # TypeScript
npm run reset-demo # rebuild DB from seed — stop the server first
npm run cost-model # infrastructure cost estimate (see docs/ARCHITECTURE.md Part 3)
```

No ESLint in this repo; `npm run typecheck` is the static check.

## Environment variables

Copy `.env.example` to `.env.local` if you want overrides. No secrets required.

| Variable | Default | What it does |
|---|---|---|
| `DEMO_MODE` | `true` under `npm run dev`; **off** under `npm start` | Demo panel and `/api/demo`. Only the string `true` enables it. |
| `CREATORHUB_DB_PATH` | `.data/db.json` | JSON database path. `:memory:` = no disk persistence. |

`.env.development` applies only to `next dev`, so production cannot accidentally leave demo mode on.

## Demo accounts and seed data

| Account | State | Good for showing |
|---|---|---|
| **Maya Okafor** | Verified. **14** content items (9 published, 3 draft, 2 scheduled). **420+** purchases. | Full dashboard, chart, filters, sort, pagination, revenue |
| **Sam Rivera** | Unverified. **3** drafts. No purchases. | Publishing gate, publish-when-ready dialog, empty states |
| **Register your own** | Unverified, empty dashboard | First-run flow, verification wizard |

**Seed totals (all creators):** 17 content records, 426 purchases (see assignment minimums in [Scope](#scope-against-the-assignment)).

**Authentication is simulated.** No password, no email proof. Anyone can register an unused email. There is no “log in with existing email” (that would allow impersonation). Seeded creators are only via labelled demo shortcuts. The sign-in page explains this.

## Demo controls

Pink **Demo** pill (header). Only when `DEMO_MODE=true`.

| Control | What it does |
|---|---|
| Switch account | Maya ↔ Sam |
| Approve / Reject verification | Simulates reviewer; reject can include a reason |
| Latency | Off / 0.8 s / 2.5 s — loading states |
| Force API errors | 503 on data routes — error UI + Retry |
| Interrupt next upload | Drops ~55%, resumable |
| Fail next processing | Upload OK, processing fails — publish blocked |
| Run scheduled jobs | Runs scheduler once (due scheduled publishes) |
| Load empty data | Clears content, purchases, uploads for current account |
| Reset demo | Restores full seed |

All actions: `POST /api/demo` with a server allowlist. Unknown actions → 400. Hiding the panel grants nothing.

## Resetting demo data

- **Running app:** Demo → **Reset demo**
- **Server stopped:** `npm run reset-demo` (rebuilds `.data/db.json`)

Do not run `reset-demo` while the server is up — the process holds an in-memory copy and may overwrite the file on the next write.

## Does data persist?

**Yes** across refresh and restart (default `.data/db.json`).

- Creators, content, uploads, verification, purchases, demo settings survive restart.
- Verification wizard **in progress** is in **localStorage** (per browser, not per device).
- `CREATORHUB_DB_PATH=:memory:` disables persistence.

## What is simulated

| Area | In this build |
|---|---|
| Video upload | File stays in browser; server stores metadata only. UI states this. |
| Processing | ~6 s timer after complete |
| Playback | Not implemented; placeholder on details page |
| Identity verification | No provider; approve/reject from demo controls |
| Auth | Demo sessions only |
| Purchases | Seeded synthetic data; no storefront |
| Scheduler | `runDueJobs` on writes + demo action — not a real worker |
| Database | Single JSON file, single instance |

Production design: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Publication rule

Drafts and edits are always allowed. **Going live** is enforced in one place: `canPublish` in `src/server/domain/publishing.ts`.

> Publish when **verified** + **content complete** + **video ready**.

All paths use it: `POST /api/content/:id/publish`, scheduler, publish-after-approval. The form **saves a draft first**, then calls publish. Server returns `403` / `409` with structured **blockers** — UI is not the only gate.

**Publish when ready:** explicit per-item intent; cancellable; approval does **not** publish every draft.

| Machine | States |
|---|---|
| Content | `draft`, `scheduled`, `published` |
| Upload | `uploading`, `processing`, `ready`, `failed` |
| Verification | `unverified`, `pending_review`, `verified`, `rejected` |

## Running tests

### Unit and API (Vitest)

```bash
npm test
```

**124 tests** in **10 files**. In-memory store, frozen clock. Publishing gate (all paths), isolation (404 for others’ IDs), demo fail-closed, verification, GET purity (file bytes), atomic writes, upload reducer, thumbnails/save-before-publish, publish intent.

### Browser (Playwright)

Not part of `npm test`. Playwright is already in `package.json`. Needs a running server:

```bash
npm run build && DEMO_MODE=true CREATORHUB_DB_PATH=/tmp/e2e.json npm start &
curl -X POST localhost:3000/api/demo -H 'content-type: application/json' -d '{"action":"reset"}'

node e2e/creator-journey.mjs
node e2e/verification-rejection.mjs
# reset again, then:
node e2e/verified-creator-flows.mjs
BASE_URL=http://localhost:3000 node e2e/thumbnail-and-dev-mode.mjs
```

Scripts change Sam’s verification — **reset between runs**.

## Scope against the assignment

| Brief section | Status |
|---|---|
| Dashboard (overview, chart, content list, purchases, search/filter/sort/pagination) | Implemented |
| Create/publish (fields, validation, progress) | Implemented; upload **simulated** |
| Verification (4 steps, drafts without verify, blocked publish UX) | Implemented; KYC **simulated** |
| Application states + responsive layouts | Implemented |
| Backend enforces publish rule | Implemented |
| Part 5 video architecture + scale/cost | **Design** in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md); `npm run cost-model` |
| Part Six product challenge | [docs/PRODUCT.md](docs/PRODUCT.md); #1 **built** |
| Seed: 12+ content, 20+ purchases | **17** content, **426** purchases |

## Engineering judgment

**Structure:** Browser → SWR → route handler → service → domain (pure) → store → JSON. Rules never live only in React. `Store` is the seam for PostgreSQL.

**Scale:** JSON store breaks first (one instance, rewrite per write). Then: Postgres, real queue/worker, direct-to-storage upload + transcode, CDN, entitlement cache, rate limits. See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

**Security (demo):** HttpOnly session, creator ID from session only, 404 for others’ resources, shared Zod, thumbnails only as `/thumbs/...` paths (SVG route). Gaps: no real auth, CSRF, rate limits, audit log.

**Performance:** SWR cache/dedupe; server paginated lists; poll only during processing or publish intent; lazy-loaded cover images via `/thumbs/...` (paths in DB, not image bytes). First click on a new filter is a new API query (by design).

**Reliability:** Interrupted upload (simulated resume); processing fail blocks publish and drops intent with reason; SWR keeps last data + Retry on errors (demo “force errors”).

**Next steps (priority):** Postgres + real worker → real upload pipeline → real auth → net earnings model → Playwright in CI + a11y.

## Assumptions and known limitations

- Revenue = **gross** completed purchases; no fees/payouts.
- Seed dates relative to “now”; chart numbers shift daily (deterministic per day).
- Delete content keeps purchase history.
- Covers: `/thumbs/<seed>` in JSON; SVG from app route — not uploaded files or data URLs.
- Blocked publish still saves draft + cover reference first.
- Orphan `initiated` uploads if browser closes mid-upload; no cleanup job.
- Publish actions duplicated between list and details (candidate shared hook).
- No video-frame thumbnail extraction (optional in brief).

## Time spent

_To be completed by the author: approximate hours and breakdown._

## Git and submission

**Repository:** [github.com/Abani-kumar/creatorhub](https://github.com/Abani-kumar/creatorhub)

`.gitignore` excludes `node_modules`, `.next`, and `.data`.
