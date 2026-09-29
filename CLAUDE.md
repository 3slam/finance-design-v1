# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repository is

An interactive simulation of PantherExpress's "Level 2 Finance Design" (shipping
finance without a double-entry ledger): a pure TypeScript domain engine + REST API +
React frontend that walks through a shipment's real financial lifecycle (delivery →
courier cash reconciliation → seller/courier settlement → payout) and a company
expenses/revenue story, using the exact worked examples from the source design doc.
See `README.md` for the full write-up (architecture, business rules extracted from the
source document, assumptions made, and how to extend it) — this file only covers the
commands and orientation needed to work in the code.

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

Run a single test: `cd shared && npx vitest run -t "<test name substring>"`, or
`npx vitest run src/engine.test.ts` for the whole suite (there's only one test file
today — all business-logic tests live there).

If you edit `shared/src/*`, re-run `npm run build -w shared` (or `npm run dev -w shared`
to watch) before the change shows up in `backend`/`frontend` — see the module
resolution note above.

## Architecture

```
shared/    Pure TS, no I/O: domain types, ERD schema metadata, the action catalog,
           FinanceEngine (all business logic + the in-memory "database"), seed data,
           the engine-level scenario runner, and engine.test.ts.
backend/   Thin Express REST API around one FinanceEngine instance (backend/src/server.ts).
frontend/  React + Vite. A single guided, linear "story" UI (NOT a dashboard — see
           README's "What this actually demonstrates") built on Zustand + Framer Motion.
docker/    nginx config serving the built frontend and proxying /api to the backend.
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

Every business rule, table, and action in `shared/` traces to a section of the source
finance-design document; if you add or change business logic, check README's "Business
Rules Extracted From Source File" and "Assumptions" sections first so you don't
duplicate or contradict something already resolved there.
