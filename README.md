# PantherExpress Finance Simulator

An interactive, working simulation of PantherExpress's shipping finance — in **two
designs**, presented as two tabs in the same app:

1. **"What We Did"** — the **Level 2 Finance Design** (shipping finance *without* a
   double-entry ledger): flat, per-table running-balance fields.
2. **"The Second Approach"** — the exact same story rebuilt on a **real double-entry
   ledger** (a chart of accounts + balanced FinanceTransactions/Entries), per a second
   reference document. See [The Second Approach](#the-second-approach--a-double-entry-ledger-design)
   below.

Neither tab is a static ERD or a mockup — each is a real in-memory database, a real
business-rule engine, and a REST API, fronted by one React app that lets you execute the
actual business actions from each source document and watch the resulting database and
money movements happen step by step.

Each source document is the single source of truth for its own tab's business rules.
Nothing here invents actors, tables, statuses, fees, or money movements that aren't in
the relevant document — see [Assumptions](#assumptions) for the flat design's handful of
places a number or a minor rule had to be filled in and exactly why, and the ledger
design's own section for the same.

## Quick start

```bash
docker compose up --build
```

Then open:

- **App:** http://localhost:8090
- **API:** http://localhost:4000/api/health

If either port is already taken on your machine (or, on Windows, falls inside a
Hyper-V/WSL2 "excluded port range" — you'll see a `bind: An attempt was made to
access a socket in a way forbidden by its access permissions` error), override it
without editing any file:

```bash
# Windows PowerShell
$env:FRONTEND_PORT=8091; $env:BACKEND_PORT=4001; docker compose up --build

# macOS / Linux
FRONTEND_PORT=8091 BACKEND_PORT=4001 docker compose up --build
```

> This repository was built and its Docker build steps were verified stage-by-stage
> (`npm ci`, `tsc` builds, running the compiled backend and the production frontend
> build) in an environment without a Docker daemon available, so `docker compose up`
> itself could not be executed end-to-end here. Every command inside the Dockerfiles
> was run manually and confirmed to work; if `docker compose up --build` surfaces
> anything environment-specific, it will be a Docker/networking detail, not an
> application bug — the app itself has been exercised extensively (unit tests + a real
> browser) in its non-containerized form.

### Local development (without Docker)

```bash
npm install
npm run build -w shared      # shared is consumed as compiled JS by both apps
npm run dev -w backend       # http://localhost:4000
npm run dev -w frontend      # http://localhost:5173 (proxies /api to :4000)
```

Run the test suite (business-logic tests, in `shared`):

```bash
npm test
```

If you change `shared/src`, re-run `npm run build -w shared` (or `npm run dev -w shared`
to watch) so `backend`/`frontend` pick up the change — they import the compiled
`shared/dist` output, not the TypeScript source, so that the same package resolves
correctly under a plain `node` runtime in production (see [Project structure](#project-structure)).

## What this actually demonstrates

The app is deliberately **one guided story, not a dashboard**: open it and you meet
Ahmed (a courier) and Seller A, and walk through exactly what happens — one stage at a
time — as Ahmed delivers, hands over cash, and Seller A and Ahmed both get paid. A
second short story then walks through the company's own monthly expenses and revenue.
Nothing here is a slideshow: every stage executes the same real `FinanceEngine` used
everywhere else, against the same in-memory database, over the same REST API.

Each stage gives you:

- A plain-English description of what's about to happen, and who's doing it (Ahmed,
  Seller A, or "Finance," the company's back-office).
- A simple animated **money-flow diagram** — only the parties actually involved in
  that stage appear, with the real amount moving between them.
- The plain-English **audit trail lines** the engine itself generated for that action
  (not a rewritten summary — literally what the backend recorded).
- ◀ Back / ▶ Play / Next ▶ controls, and a running "journey so far" list.

For anyone who wants to go a layer deeper, an optional **"peek at the actual database
tables"** panel (collapsed by default) shows the real rows in the key tables at any
point in the story. At the end, a **Reset** button starts the whole thing over.

The full 17-action, 19-table, multi-scenario engine described below is still there
underneath — the REST API can run any of it — but the UI on top of it now tells one
clear, linear story instead of exposing everything as a dashboard at once.

This is the app's first tab, **"What We Did."** A second tab, **"The Second
Approach,"** runs the exact same story again — same Ahmed, same Seller A, same
packages — through a completely different engine built on a real double-entry ledger;
see [The Second Approach](#the-second-approach--a-double-entry-ledger-design) below.

## Architecture

```
shared/    Domain model, ERD schema metadata, action catalog, the FinanceEngine
           (business logic + in-memory "database"), seed data, scenarios, unit tests.
backend/   A thin Express REST API around one FinanceEngine instance.
frontend/  React + TypeScript + Vite. Zustand for the story's state, Framer Motion
           for the money-flow animation, Tailwind for styling.
docker/    nginx config used to serve the built frontend and proxy /api to the backend.
```

`shared` is the important part: it is a **pure, framework-free TypeScript package**
with no I/O — the backend is the only thing that touches it over HTTP, and the frontend
only imports its *types* and a couple of pure helpers (table-key mapping). This is what
makes "replace the simulated database with a real one" a backend-only change (see below).

### Event-driven simulation, concretely

Every action in `shared/src/engine.ts` follows the same shape:

1. Validate preconditions against the current state. Any failure throws a
   `ValidationError` before anything is mutated — so a rejected action never
   partially applies (this is what powers the "action failed" banner in the UI,
   doc requirement for invalid-operation visualization).
2. Run one or more named **steps** (`this.step(actor, title, description, fn)`).
   Inside a step, calls to `this.insert(...)` / `this.update(...)` mutate the
   in-memory table *and* record a `RecordMutation` (table, op, before, after).
3. `this.emitEvent(...)` records a typed `DomainEvent` (e.g.
   `ShipmentFinancialsCreated`, `CourierReconciliationOpened`).
4. `this.audit(...)` appends a human-readable `AuditLogEntry` to the persistent
   audit log.
5. `this.moneyFlow(...)` records one `MoneyFlow` (kind, amount, from, to, status).

The action's return value (`ActionExecutionResult`) bundles all of the above —
steps, flattened mutations, events, audit entries, money flows, and which tables
were affected. Each story stage in the frontend is literally one call to
`POST /api/actions/:actionId/execute`, and everything shown for that stage (the
money-flow diagram, the audit lines) comes straight from that one result — nothing
is a canned animation.

## Actors

The document names two real actors directly and implies a third:

| Actor | Role in this design |
|---|---|
| **Merchant / Seller** | Receives seller settlements, is billed seller fees. |
| **Courier** | Delivers/collects/hands over cash; earns commissions. |
| **Finance Operator** *(assumption)* | The document never names who runs reconciliation, calculates settlements, approves adjustments, or executes payouts — it only ever says "the system" resolves fees automatically. "Finance Operator" is the smallest reasonable stand-in for "the company/Accounting side" and is used for every one of those actions. |
| **System** | Automatic fee/commission resolution during delivery (doc §6.1: "Resolves the seller's fee... from the merchant's pricing configuration"). |

## Entities (tables)

Every table in the ERD traces to a specific section of the source document; the ERD
card and the `README`'s reference below both come from the same
`shared/src/schema.ts` list.

| Table | Source | New or existing (per doc §2) |
|---|---|---|
| Merchants, Couriers, Hubs | operational reference data | Existing |
| Merchant Pricing Configs | §2 (assumption — see below) | New (assumption) |
| Shipments | §2, §5, §7 | Existing |
| Shipment Financials | §4, §7 | **New** |
| Courier Reconciliations | §4, §6.3, §7 | **New** |
| Seller Settlements | §4, §6.4, §7 | **New** |
| Courier Settlements | §4, §6.5, §7 | **New** |
| Seller Adjustments | §4, §6.6, §7 | Existing concept, new record |
| Courier Adjustments | §4, §12 | **New — explicitly proposed in the doc, "needs review"** |
| Payouts | §4, §6.7, §7 | **New** |
| Expense Transactions | §8, §9.1, §10 | **New** |
| Revenue Transactions | §8, §9.2, §10 | **New** |
| Advances / Advance Movements | §10 | **New** |
| Capital Transactions | §10 | **New** |
| Cash Custodies / Custody Debts | §10 | **New** |
| Audit Log | — | Infrastructure for this demo, not a document entity |

## Actions

All 17 actions live in `shared/src/actions.ts` (metadata: actor, category, affected
tables, input fields) with their logic in `shared/src/engine.ts`. They map directly to
document sections:

- **Shipment Lifecycle** — Deliver Shipment (§6.1), Process Replacement (§6.2),
  Resolve Shipment Exception (§5 — Partial/Refused/Cancelled/Returned; see
  [Assumptions](#assumptions))
- **Courier Cash Custody** — Start Courier Reconciliation (§6.3)
- **Seller Finance** — Calculate Seller Settlement (§6.4), Create Seller Adjustment (§6.6)
- **Courier Finance** — Calculate Courier Settlement (§6.5), Create Courier Adjustment (§4/§12)
- **Payout** — Execute Payout, Retry Payout (§6.7)
- **Company Expenses & Revenue** — Record Expense (§8/§9.1), Record Other Revenue (§8/§9.2)
- **Advances, Capital & Custody** — Issue Advance, Record Advance Movement, Record
  Capital Transaction, Issue Cash Custody, Return Cash Custody (§10 — entity reference
  only, no worked example; implemented as direct CRUD against the documented fields
  and relationships, nothing invented beyond that)

## Scenarios

Eight predefined scenarios (`shared/src/scenarios.ts` for metadata,
`FinanceEngine.runScenario` for execution) reproduce the document's own worked
examples exactly:

1. **Complete Shipment Delivery** (§6.1/§6.2) — PN001, PN002 delivered; PN003 replaced with a refund.
2. **Courier Cash Reconciliation** (§6.3) — Ahmed hands over exactly Expected Courier Cash (1,600 EGP); closes Matched.
3. **Seller Settlement** (§6.4) — 1,430 EGP net for Seller A.
4. **Courier Settlement** (§6.5) — 125 EGP for Ahmed.
5. **Seller Compensation → Next Settlement** (§6.6) — a 500 EGP compensation never reopens the first settlement.
6. **Merchant Payout (Failed → Retry)** (§6.7) — first attempt fails, retry succeeds.
7. **Courier Payout** (§6.7) — paid in full on the first attempt.
8. **Company Expenses & Revenue** (§9.1–§9.3) — records the five expenses + one revenue line and rolls up to the document's own **−33,555 EGP** period result.

Every one of these is checked against the document's numbers in
`shared/src/engine.test.ts`.

## How the database changes, and how money flows

Every mutation is `{table, op: INSERT|UPDATE, recordId, before, after}` — that's what
the optional database-peek panel reads directly from the current state, and it's also
what the "peek" panel's tables always reflect (the real row, not a copy the UI made up).

Money flows are a separate, parallel record (`MoneyFlow`): `{kind, amount, from, to,
status}`, one per real money movement in an action (e.g. delivering a COD shipment
produces three: the customer's COD payment to the courier, the seller fee to the
company, and the courier's commission from the company). Each story stage's diagram
only draws the lanes (Customer / Courier / Merchant / Company / Vendor) that actually
appear in that stage's flows — a settlement-calculation stage has none at all, since
the document is explicit that calculating what's owed and actually paying it are two
different steps (§6.7).

## Business Rules Extracted From Source File

These are the concrete, load-bearing rules this simulation enforces, taken directly
from the document:

- COD and Refund-to-Customer are set **once**, at a shipment's final outcome, and
  never changed afterward (§1). The engine only ever writes `collectedAmount` /
  `refundAmount` inside the one action that finalizes a shipment's outcome.
- A Refund-to-Customer is paid **out of COD cash the courier already has in hand**
  from other shipments — never a separate company payment (§1, §6.2). No money-flow
  or table models a "company pays refund" path.
- Courier Earning (commission) and Courier Cash Custody are separate concerns — a
  courier can owe cash to the hub and be owed commission by the company at the same
  time (§1). This is why Courier Reconciliation and Courier Settlement are two
  independent tables/workflows, each claiming `ShipmentFinancials` rows through a
  different foreign key.
- `Expected Courier Cash = Σ(Collected) − Σ(Refund)` (§1) — implemented verbatim in
  `startCourierReconciliation`.
- `Seller Base Effect = Collected − Refund − Seller Fee` (§1) — implemented verbatim
  in `calculateSellerSettlement`.
- `Company Shipment Contribution = Seller Fee − Courier Earning` (§1) — implemented
  verbatim in the period roll-up.
- A settlement being **calculated** and a settlement being **paid** are different
  steps, tracked as different records (§6.7) — `SellerSettlement`/`CourierSettlement`
  (the calculation) never itself represents "was it actually paid"; `Payout` does,
  and a failed attempt and its retry are both separate `Payout` rows.
- A later adjustment (compensation/claim/credit/deduction, or courier
  bonus/penalty/correction) **never reopens a past settlement** and never changes a
  shipment's original COD/refund — it is only picked up by the *next* settlement
  calculation (§6.6). Enforced structurally: settlements only ever claim
  adjustments/financials whose settlement-id foreign key is still null.
- Exchange commission is reversed on a Replacement's Total Refusal sub-outcome (§5) —
  the one place the engine sets `courierEarning = 0` for a Replacement without it
  being a flagged assumption, because the rule itself (not just the number) is
  directly stated in the document.
- A Courier Reconciliation with a cash variance is left in **"Short — Needs
  Decision"** and is *not* auto-resolved, because the document itself lists
  "cash-shortage disposition" as an unresolved Open Decision (§12).

## Assumptions

Per the brief, every place the document was silent or explicitly marked "not yet
defined," the smallest reasonable placeholder was used and is flagged in the running
app (a `⚠ assumed rule` badge on the action, and `isAssumedRule` on the resulting
`ShipmentFinancials` row/transaction) — never silently invented:

1. **"Finance Operator" actor.** The document never names who runs reconciliation,
   settlement calculation, adjustment approval, or payout — only "the system" for
   automatic fee resolution. A single generic operator role was added as the
   smallest stand-in for "the company/Accounting side."
2. **Merchant Pricing Configuration numbers.** The doc says the seller fee is
   "resolved from Merchant Pricing Configuration" but that "the resolved amount is
   not yet captured" (§2). The COD delivery fee/commission (60/45) and exchange
   fee/commission (50/35) are exactly the figures used in the document's own worked
   example (§6); refusal fee, cancellation fee, return fee, and return commission
   have no worked numbers anywhere in the document, so placeholder values were
   chosen and are clearly editable in `shared/src/seed.ts`.
3. **Partial Delivery fee/commission proration.** The document names the fee source
   ("Delivery fee, proration not yet defined") and explicitly lists this as an Open
   Decision (§12). The simulation applies the full, un-prorated delivery fee and
   commission and flags the result `isAssumedRule: true`.
4. **Refused/Failed commission reversal.** The document says the courier earning is
   "Reversed depending on the reason — rule not yet modeled" (§5) and lists this as
   an Open Decision (§12). The simulation reverses it fully (sets it to 0) and flags
   the result.
5. **Cancellation courier-earning policy.** The document says courier earning is
   "Per policy" with no policy given. Treated as 0, flagged.
6. **Return outcome** (fee charged to seller, commission paid to courier) is **not**
   flagged as assumed — both are directly named in §5's outcome table; only the
   underlying pricing-config *numbers* carry assumption #2's caveat.
7. **PN003's sub-outcome.** The worked example (§6.2) describes "the customer keeps
   nothing" but its own numbers keep the courier's commission at 35 EGP rather than
   reversing it — i.e. it is *not* the "Total Refusal" sub-outcome from §5 (which
   the document says reverses commission). The scenario models PN003 as a **Clean
   Swap with a full refund** to match the document's own numbers exactly; "Total
   Refusal" is separately available in the Playground and does reverse the
   commission, as §5 specifies.
8. **PN010.** Referenced only by name in §9.1 ("Shipment: PN010"); added as a
   minimal real shipment record purely so that expense's shipment reference resolves
   to something clickable. It carries no worked-example numbers of its own.
9. **Settlement status transitioning to "Paid."** The document never states that a
   `SellerSettlement`/`CourierSettlement` record's own status changes once its
   payout succeeds (only the `Payout` record's status is described). For a legible
   "is this fully resolved?" state in the UI, the settlement's status is updated to
   `Paid`/`PaymentFailed` based on its latest payout attempt — a small, clearly
   derived convenience on top of the document's own Payout model, not a new rule.
10. **Reconciliation variance handling.** Any non-zero variance (over *or* short) is
    labeled `ShortNeedsDecision`, since the document only ever illustrates a
    shortage case and gives no separate treatment for an overage.

## Playing it

Press **Start the story** and go — there's nothing to configure. Each stage runs the
real action against the backend the moment you reach it (via ◀ Back / ▶ Play / Next ▶),
so "Back" just re-shows a card you've already seen; it doesn't undo anything.

1. **The shipment story** (9 stages) — Ahmed delivers two COD packages and processes a
   replacement refund, hands his cash to the hub, Finance calculates what Seller A and
   Ahmed are each owed, and both get paid (Seller A's first payment attempt fails and
   is retried, matching the document's own PAY001/PAY002 example).
2. **The company story** (6 stages, offered once the shipment story finishes) — the
   same five expenses and one revenue line from the document's worked example, ending
   in the exact **−33,555 EGP** period result the document itself arrives at.
3. **Restart** (top-right) resets the backend to its seeded state and starts over.

Everything the original, more dashboard-like build exposed (the full 17-action
Playground, the 8-scenario picker, the interactive ERD graph, Developer Mode, Action
History) still exists as engine/API capability — `shared/src/actions.ts` and
`shared/src/scenarios.ts` are unchanged, and every endpoint in `backend/src/server.ts`
still works — it's just not what the default UI surfaces any more, in favor of one
clear story.

## The Second Approach — A Double-Entry Ledger Design

The second tab is a from-scratch implementation of a different reference document: **"The
Finance System (Ledger) Explained in Detail"** — a full production-grade double-entry
ledger design for the same PantherExpress business (Accounts, Transactions, Entries,
Courier Reconciliations, Settlements, Payouts, and 50+ edge cases, screens, and a backend
spec across its own six parts). Where the flat design stores a running balance on
whichever table needed one, this design stores nothing but a chart of accounts and a
log of balanced double-entry postings — every number (what a seller is owed, what a
courier is holding, the period's net result) is a query over that log, never a stored
field.

**Same story, same numbers, different bookkeeping.** Both tabs seed the same actors
(Ahmed, Seller A, Hub 7, PN001/PN002/PN003) and, run through the same guided story, land
on the exact same figures: Seller A nets **1,430 EGP**, Ahmed nets **125 EGP**, and the
company story's period result is the same **−33,555 EGP** — just reached by posting
`DELIVERY_POSTED` / `REPLACEMENT_POSTED` / `COURIER_CASH_HANDOVER` / `SELLER_PAYOUT` /
`COURIER_PAYOUT` / `EXPENSE_PAID` / `OTHER_REVENUE_RECEIVED` transactions against a
chart of accounts, instead of updating `ShipmentFinancials.sellerFee` or
`SellerSettlement.totalNet` in place.

### The chart of accounts

Account codes follow the document's own `family:owner:purpose` format
(`shared/src/ledger/seed.ts`):

| Account | Type | Normal side | What it answers |
|---|---|---|---|
| `courier:{id}:cash` | Asset | Debit | Customer cash the courier is holding, still owed to the hub |
| `courier:{id}:payable` | Liability | Credit | Everything the company owes that courier (commission, bonus, fronted-expense reimbursement — one account, per the document's own model) |
| `hub:{id}:cash` | Asset | Debit | Cash in the hub safe |
| `bank:main` | Asset | Debit | The company bank account |
| `seller:{id}:payable` | Liability | Credit | What the company owes that seller |
| `cash:suspense` | Liability | Credit | Cash of unknown origin (a reconciliation overage), until investigated |
| `revenue:shipping` / `revenue:replacement` / `revenue:other` | Revenue | Credit | Fee and other income |
| `expense:courier` / `expense:fuel` / `expense:maintenance` / `expense:rent` / `expense:utilities` / `expense:compensation` | Expense | Debit | Operating costs |

### What's implemented vs. what's reference material

The document's Parts 1-3 (every concept, every table, and the full worked example —
delivery, replacement, cash reconciliation, deposit, settlements, a claim, payouts, the
trial balance) are implemented **faithfully and in full** — see
`shared/src/ledger/domain.ts`'s file header and `shared/src/ledger/engine.test.ts` for
exactly which of its numbers are checked. Parts 4-6 catalogue 50+ further edge cases
(returns, corrections, concurrency), every screen down to the field and permission, and
a full backend/API/migration spec for a real production system — this simulation
implements the same core mechanics those all generalize from (one balanced-posting
primitive, idempotency by `sourceEventId`, immutability, a computed-not-stored balance),
not each of the 50+ cases individually. Concretely, **not implemented**: Claims and
Adjustments as their own workflow tables (the guided story never exercises them),
courier floats/advances, multi-hub transfers, and the reserve-on-approve settlement
variant. Read Models (`ShipmentFinancialSummary` / `SellerFinancialSummary` /
`CourierFinancialSummary`, doc §13) are computed live from the ledger on every read
(`shared/src/ledger/calculations.ts`) rather than persisted and incrementally updated —
functionally identical at this data volume; a production system would do the latter for
speed at scale, exactly as the document itself describes.

`OTHER_REVENUE_RECEIVED` is this engine's one addition beyond the document's own
transaction-type catalogue — trivially inferable from its existing `revenue:other`
account and its own "money entered an Asset → Debit it" pattern, needed only because the
company story records a one-off sale the document's own worked example doesn't cover.

### Try it yourself

- **The trial balance always closes.** Every guided-story action posts through one
  `LedgerEngine#post()` primitive that rejects an unbalanced set of lines before they
  ever reach the state (`shared/src/ledger/engine.ts`) — `engine.test.ts` asserts
  Σ(debit-normal balances) = Σ(credit-normal balances) after *every single action* in
  both stories, not just at the end.
- **A shortage doesn't vanish.** Hand over less cash than expected at the reconciliation
  stage (edit `LEDGER_SHIPMENT_STORY`'s `reconcile` step in
  `frontend/src/story/ledgerStorySteps.ts` to pass a smaller `actualCash`) and watch the
  courier's own cash-in-hand account keep the difference — no separate "debt" table
  needed, unlike the flat design's `CustodyDebt`.
- **A failed payout touches nothing.** `executePayout` with `simulateFailure: true`
  posts zero ledger entries — only a `Payout` row — because no money actually moved; the
  retry is what posts `SELLER_PAYOUT`.

## Extending this project

### Add a new business action

1. Add its input schema and metadata to `ACTION_DEFINITIONS` in `shared/src/actions.ts`.
2. Implement `private doYourAction(input) { ... }` in `shared/src/engine.ts` using the
   `step` / `insert` / `update` / `emitEvent` / `audit` / `moneyFlow` helpers, and add
   a `case` for it in `FinanceEngine.execute`.
3. Add a test in `shared/src/engine.test.ts`.
4. That's it — the backend route (`POST /api/actions/:actionId/execute`), the
   Playground form, the ERD impact highlighting, and the step player all pick it up
   automatically because they're driven by the same `ACTION_DEFINITIONS` and the
   generic `ActionExecutionResult` shape.

### Add a new table

1. Add the interface to `shared/src/domain.ts` and add its name to `TABLE_NAMES`.
2. Add its bucket to `FinanceState` in `shared/src/state.ts` (and `emptyState()`).
3. Add its row to `TABLE_STATE_KEY` in `shared/src/tableKeys.ts`.
4. Add a `TableSchema` entry (columns, PK/FK) to `TABLE_SCHEMAS` in `shared/src/schema.ts`.
5. If you want it in the simplified UI's optional database peek, add its name to
   `CURATED_TABLES` in `frontend/src/components/DatabasePeek.tsx`.

### Add a new scenario

Add its metadata to `SCENARIOS` in `shared/src/scenarios.ts`, and add a `case` in
`FinanceEngine.runScenario` in `shared/src/engine.ts` that calls `this.execute(...)`
(or looks up a prerequisite record, as the payout scenarios do) for each step. (This is
the engine-level scenario mechanism the API still exposes — see the note at the end of
[Playing it](#playing-it).)

### Add a stage to the guided story

The frontend's own story is a plain array, independent of the `SCENARIOS` above: add
an entry (`title`, `blurb`, `actionId`, and an `input` function that can read the
current state, e.g. to look up an auto-generated settlement id) to `SHIPMENT_STORY` or
`COMPANY_STORY` in `frontend/src/story/storySteps.ts`. Everything else — the progress
dots, the money-flow diagram, the audit-line list, the "journey so far" feed — is
generated from that array plus whatever the action actually returns, so a new stage
needs no other frontend change.

### Replace the simulated database with a real one

Every table access in `engine.ts` goes through four small generic helpers
(`insert`, `update`, plus direct reads like `this.state.shipments[id]`) against the
plain-object `FinanceState`. To swap in a real database:

1. Replace `FinanceState`'s plain objects with a repository interface exposing the
   same per-table `get`/`insert`/`update` operations (this is exactly why
   `ShipmentFinancials`/`CourierReconciliation`/etc. don't duplicate data already on
   `Shipment` — see doc §2's guidance, followed here).
2. Make `FinanceEngine`'s methods `async` and have `insert`/`update` await the
   repository instead of mutating an in-memory object.
3. The rest of the engine's logic (validation, step/event/audit/money-flow
   recording) is storage-agnostic already — none of it assumes an in-memory shape.
4. The backend's HTTP layer (`backend/src/server.ts`) does not need to change at all.

## Project structure

```
shared/src/
  domain.ts        Every entity, action-result, and mutation/event/money-flow type.
  schema.ts         ERD metadata (table → columns → PK/FK) driving the canvas.
  tableKeys.ts       table name -> FinanceState key (shared by engine + frontend replay).
  actions.ts         Action metadata + input field schemas (drives Playground forms).
  scenarios.ts       Scenario metadata (titles/descriptions/prerequisites).
  calculations.ts    The doc's core formulas, as pure/testable functions.
  state.ts           The FinanceState shape (the "database").
  seed.ts            Seed data reproducing the worked examples.
  engine.ts          FinanceEngine — all 17 actions + the 8 scenario runners.
  engine.test.ts     Vitest suite checking the engine against the document's numbers.
  ledger/            The second approach — self-contained, its own ERD:
    domain.ts          Account/FinanceTransaction/FinanceEntry/Settlement/Payout types.
    state.ts            The LedgerState shape (the "database").
    seed.ts             Chart of accounts + the same actors/shipments as ../seed.ts.
    tableKeys.ts        table name -> LedgerState key.
    calculations.ts     getAccountBalance / getTrialBalance / Read Model views — all computed live.
    engine.ts           LedgerEngine — the 9 actions the guided story exercises.
    engine.test.ts      Checks every TX against the ledger document's own worked-example tables.
backend/src/server.ts REST API for both engines: /api/* (flat) and /api/ledger/*
                       (ledger) — state/rollup/history, execute an action, reset.
frontend/src/
  App.tsx                  The two-tab shell (What We Did / The Second Approach).
  FlatDesignView.tsx        The flat design's guided story + DatabasePeek (former App.tsx body).
  LedgerDesignView.tsx      The ledger design's guided story + LedgerPeek.
  store/useStory.ts        Zustand store for the flat design: phase/stage, results, playback.
  store/useLedgerStory.ts   Same shape, for the ledger design's own engine/API.
  story/storySteps.ts      SHIPMENT_STORY / COMPANY_STORY (flat design) as plain data.
  story/ledgerStorySteps.ts LEDGER_SHIPMENT_STORY / LEDGER_COMPANY_STORY, same steps, ledger actions.
  components/
    IntroCard.tsx          The welcome card (per-tab copy via props).
    StoryCard.tsx           One executed stage: actor, description, money-flow diagram, audit lines
                             — takes a structural result type so either engine's output renders.
    FlowDiagram.tsx          The animated money-flow lanes for one stage.
    Controls.tsx             Back / Play / Next + progress dots.
    ActivityFeed.tsx         The running "journey so far" list — takes its steps/results as props.
    CompletionCard.tsx       End-of-shipment-story and end-of-company-story cards (with the period recap).
    DatabasePeek.tsx         Flat design only: the collapsed "see the real tables" panel.
    LedgerPeek.tsx           Ledger design only: live trial balance + the FinanceTransactions/Entries journal.
docker/nginx.conf     Serves the built frontend and proxies /api to the backend container.
```
