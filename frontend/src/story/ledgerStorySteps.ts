import type { Ledger } from '@pfx/shared';

export interface LedgerStoryStep {
  id: string;
  title: string;
  blurb: string;
  actionId: Ledger.LedgerActionId;
  input: (state: Ledger.LedgerState) => Record<string, unknown>;
}

function latestSettlement(state: Ledger.LedgerState, partyType: Ledger.SettlementPartyType): Ledger.Settlement {
  const list = Object.values(state.settlements)
    .filter((s) => s.partyType === partyType)
    .sort((a, b) => a.id.localeCompare(b.id));
  return list[list.length - 1];
}

/**
 * The exact same shipment lifecycle as `storySteps.ts#SHIPMENT_STORY` —
 * same Ahmed, same Seller A, same PN001/PN002/PN003 — booked through the
 * reference document's double-entry ledger instead. Every stage number
 * below matches the doc's own Part 3 section (§16-§24).
 */
export const LEDGER_SHIPMENT_STORY: LedgerStoryStep[] = [
  {
    id: 'deliver-pn001',
    title: 'Ahmed delivers PN001',
    blurb: 'Seller A shipped a 1,000 EGP cash-on-delivery package. This posts one balanced FinanceTransaction (doc §16): the customer’s cash, the seller’s payable, the company’s fee revenue, and Ahmed’s commission all move at once.',
    actionId: 'deliverShipment',
    input: () => ({ shipmentId: 'PN001' }),
  },
  {
    id: 'deliver-pn002',
    title: 'Ahmed delivers PN002',
    blurb: 'A second package, 800 EGP cash-on-delivery — the same five-line posting shape as PN001 (doc §17).',
    actionId: 'deliverShipment',
    input: () => ({ shipmentId: 'PN002' }),
  },
  {
    id: 'replace-pn003',
    title: 'A replacement, PN003, needs a refund',
    blurb: 'This customer keeps nothing and is owed 200 EGP back, paid out of the cash Ahmed already collected. The doc deliberately keeps the refund and the fee as two separate ledger lines (§18.2), not netted together.',
    actionId: 'processReplacement',
    input: () => ({ shipmentId: 'PN003', subOutcome: 'ReplacementCleanSwap' }),
  },
  {
    id: 'reconcile',
    title: 'Ahmed hands over his cash',
    blurb: '"Expected cash" isn’t a formula here — it’s simply the current balance of Ahmed’s Courier Cash-in-Hand account (doc §19). Handing over exactly that amount zeroes the account out.',
    actionId: 'startCourierReconciliation',
    input: () => ({ courierId: 'COU-AHMED', actualCash: 1600 }),
  },
  {
    id: 'deposit',
    title: 'The safe deposits to the bank',
    blurb: 'At the end of the day, Hub 7 deposits everything in its safe into the company bank account (doc §20) — without this step, later payouts would draw on money the bank never actually received.',
    actionId: 'depositToBank',
    input: () => ({ hubId: 'HUB-7' }),
  },
  {
    id: 'seller-settlement',
    title: 'Finance works out what Seller A is owed',
    blurb: 'No money moves yet — a Settlement just collects every not-yet-claimed transaction touching Seller A’s payable account and freezes the total (doc §21). A different person (Maker-Checker) approves it.',
    actionId: 'calculateSellerSettlement',
    input: () => ({ merchantId: 'MER-A' }),
  },
  {
    id: 'courier-settlement',
    title: 'Finance works out what Ahmed earned',
    blurb: 'Same idea, against Ahmed’s own payable account (doc §22).',
    actionId: 'calculateCourierSettlement',
    input: () => ({ courierId: 'COU-AHMED' }),
  },
  {
    id: 'seller-payout-1',
    title: 'Finance tries to pay Seller A',
    blurb: 'First attempt — a failed transfer posts nothing to the Ledger at all (doc §24, §33.1): no money moved, so there’s nothing to record yet.',
    actionId: 'executePayout',
    input: (state) => ({ party: 'Seller', settlementId: latestSettlement(state, 'Seller').id, simulateFailure: true }),
  },
  {
    id: 'seller-payout-2',
    title: 'Finance retries the payment',
    blurb: 'This time it succeeds: SELLER_PAYOUT debits Seller A’s payable and credits the company bank account — the liability is actually discharged.',
    actionId: 'retryPayout',
    input: (state) => ({ party: 'Seller', settlementId: latestSettlement(state, 'Seller').id, simulateFailure: false }),
  },
  {
    id: 'courier-payout',
    title: 'Finance pays Ahmed',
    blurb: 'His commission, paid on the first attempt.',
    actionId: 'executePayout',
    input: (state) => ({ party: 'Courier', settlementId: latestSettlement(state, 'Courier').id, simulateFailure: false }),
  },
];

/**
 * The company story — same five expenses and one revenue line as
 * `storySteps.ts#COMPANY_STORY`, posted as EXPENSE_PAID / OTHER_REVENUE_RECEIVED
 * transactions against the doc's own expense/revenue accounts (doc §5.2).
 */
export const LEDGER_COMPANY_STORY: LedgerStoryStep[] = [
  {
    id: 'exp-fuel',
    title: 'Ahmed buys fuel',
    blurb: 'He pays for it himself, so the company owes him back — credited straight to his existing Courier Payable account (doc §5.2 uses one account per courier for everything the company owes them).',
    actionId: 'recordExpense',
    input: () => ({ type: 'Fuel', attributedToId: 'COU-AHMED', amount: 300, paidBy: 'CourierReimbursable', description: 'Motorcycle fuel — September' }),
  },
  {
    id: 'exp-maintenance',
    title: 'A motorcycle gets serviced',
    blurb: 'Paid straight from the company bank account.',
    actionId: 'recordExpense',
    input: () => ({ type: 'VehicleMaintenance', amount: 1200, paidBy: 'Company', description: 'Paid to garage directly' }),
  },
  {
    id: 'exp-rent',
    title: 'Hub 7’s monthly rent is due',
    blurb: 'A big, predictable cost against its own expense account.',
    actionId: 'recordExpense',
    input: () => ({ type: 'Rent', amount: 30000, paidBy: 'Company' }),
  },
  {
    id: 'exp-utilities',
    title: 'Utilities for Hub 7',
    blurb: 'Electricity, water, internet.',
    actionId: 'recordExpense',
    input: () => ({ type: 'Utilities', amount: 2500, paidBy: 'Company' }),
  },
  {
    id: 'exp-compensation',
    title: 'A customer is compensated',
    blurb: 'For a different shipment, PN010 — the doc’s own expense:compensation account (doc §5.2), paid directly by the company.',
    actionId: 'recordExpense',
    input: () => ({ type: 'CustomerCompensation', amount: 400, paidBy: 'Company', description: 'Compensation for PN010' }),
  },
  {
    id: 'rev-other',
    title: 'Selling old packaging materials',
    blurb: 'One-off income unrelated to any shipment — Debit the bank, Credit revenue:other.',
    actionId: 'recordRevenue',
    input: () => ({ amount: 800, notes: 'Sold surplus packaging materials to another vendor' }),
  },
];
