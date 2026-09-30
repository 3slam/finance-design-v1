# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repository is

An interactive simulation of PantherExpress's shipping finance, in two designs the app
lets you switch between as tabs:

1. **"What We Did"** — the "Level 2 Finance Design" (shipping finance *without* a
   double-entry ledger): flat, per-table running-balance fields.
2. **"The Second Approach"** — the same story (same Ahmed, same Seller A, same
   PN001-PN003) rebuilt on a real double-entry ledger (chart of accounts + balanced
   FinanceTransactions/Entries), per a second reference document.

Both are pure TypeScript domain engines + REST APIs + one React frontend that walks
through a shipment's real financial lifecycle (delivery → courier cash reconciliation →
seller/courier settlement → payout) and a company expenses/revenue story, using the
exact worked examples from each source document. See `README.md` for the full write-up
(architecture, business rules extracted from both source documents, assumptions made,
and how to extend either design) — this file only covers the commands and orientation
needed to work in the code.

## Commands

```bash
npm install                  # installs all three workspaces
npm run build -w shared      # REQUIRED before dev/build of backend or frontend —
                              # they import shared/dist (compiled JS), not shared/src,
                              # so a plain `node` runtime resolves it in production too
npm run dev -w backend       # http://localhost:4000, tsx watch (picks up shared/dist changes on rebuild, not live)
npm run dev -w frontend      # http://localhost:5173, vite (proxies /api to :4000)
npm test                     # runs shared/src/engine.test.ts via vitest
npm run build                # builds shared, backend, frontend in order
docker compose up --build    # full stack at http://localhost:8090 (override with FRONTEND_PORT/BACKEND_PORT env vars)
```

Run a single test: `cd shared && npx vitest run -t "<test name substring>"`. Two test
files: `src/engine.test.ts` (the flat design) and `src/ledger/engine.test.ts` (the
ledger design, including a trial-balance-stays-balanced check after every action).

If you edit `shared/src/*`, re-run `npm run build -w shared` (or `npm run dev -w shared`
to watch) before the change shows up in `backend`/`frontend` — see the module
resolution note above.

## Architecture

```
shared/          Pure TS, no I/O: the flat design's domain types, ERD schema metadata,
                  action catalog, FinanceEngine, seed data, scenario runner, engine.test.ts.
shared/ledger/    The second approach's own domain types, chart-of-accounts seed,
                  calculations (account balances / trial balance, computed not stored),
                  LedgerEngine, and its own engine.test.ts. Self-contained — imports only
                  a handful of generic types from `../domain.ts` (ActorRole, MoneyFlow,
                  AuditLogEntry) and reuses `ValidationError` from `../engine.ts`.
backend/          Thin Express REST API around one FinanceEngine instance AND one
                  LedgerEngine instance (backend/src/server.ts) — `/api/*` for the flat
                  design, `/api/ledger/*` for the ledger design. Two engines, two
                  histories, never shared state.
frontend/         React + Vite, one app with a two-tab shell (App.tsx): FlatDesignView
                  (the original guided story + DatabasePeek) and LedgerDesignView (the
                  ledger story + LedgerPeek — the real raw tables: Finance Accounts,
                  Finance Transactions, Finance Entries, Courier Reconciliations (+
                  Lines), Cash Deposits, Settlements (+ Lines), Payouts). StoryCard /
                  Controls / ActivityFeed / CompletionCard are shared by both tabs —
                  StoryCard and ActivityFeed take structural prop types (not the flat
                  design's concrete ActionExecutionResult) specifically so both engines'
                  result shapes fit.
docker/           nginx config serving the built frontend and proxying /api to the backend.
```

Key thing to know before touching `shared/src/engine.ts`: every action follows the
same shape — validate preconditions (throwing `ValidationError` before any mutation),
then run named `step()`s whose `insert()`/`update()` calls record `{table, op, before,
after}` mutations, `emitEvent()` records a typed domain event, `audit()` appends a
plain-English audit-log entry, and `moneyFlow()` records one money movement. The
action's return value (`ActionExecutionResult`) bundles all of that — it's what both
the backend response and every bit of frontend UI (the money-flow diagram, the audit
lines, the database peek) render directly, nothing is re-derived or faked.

The frontend's own story (`frontend/src/story/storySteps.ts` — `SHIPMENT_STORY` and
`COMPANY_STORY`) is a separate, much smaller thing from the engine's own scenario
runner (`shared/src/scenarios.ts` + `FinanceEngine.runScenario`, still exposed over the
API); the frontend story is what the UI actually walks people through today.

Frontend styling uses a specific brand palette + type scale (Tailwind tokens in
`frontend/tailwind.config.js`: `brand`, `ink`, `text-{secondary,tertiary,muted}`,
`bg-{canvas,surface,field}`, `border`, `success`, `warning`, `danger`, and the
`display-l`/`heading-*`/`body-*` font-size scale) — reuse these tokens rather than
introducing new ad hoc colors/sizes.

Every business rule, table, and action in `shared/` traces to a section of the flat
design's source document; every account code, transaction type, and table in
`shared/ledger/` traces to a section of the ledger design's own reference document (see
`shared/ledger/domain.ts`'s file header for exactly what's implemented vs. what that
document covers as reference material only). If you add or change business logic, check
README's "Business Rules Extracted From Source File" / "The Ledger Design" and
"Assumptions" sections first so you don't duplicate or contradict something already
resolved there.
