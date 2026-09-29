import type { ActionId, CourierSettlement, FinanceState, SellerSettlement } from '@pfx/shared';

export interface StoryStep {
  id: string;
  title: string;
  blurb: string;
  actionId: ActionId;
  input: (state: FinanceState) => Record<string, unknown>;
}

function latestSellerSettlement(state: FinanceState): SellerSettlement {
  const list = Object.values(state.sellerSettlements).sort((a, b) => a.id.localeCompare(b.id));
  return list[list.length - 1];
}

function latestCourierSettlement(state: FinanceState): CourierSettlement {
  const list = Object.values(state.courierSettlements).sort((a, b) => a.id.localeCompare(b.id));
  return list[list.length - 1];
}

/**
 * One shipment's full financial lifecycle (doc §6), told as a linear story
 * instead of a free-form playground. Each stage is one real engine action —
 * nothing here is faked, it's the same FinanceEngine used everywhere else,
 * just walked through in a fixed, guided order.
 */
export const SHIPMENT_STORY: StoryStep[] = [
  {
    id: 'deliver-pn001',
    title: 'Ahmed delivers PN001',
    blurb: 'Seller A shipped a 1,000 EGP cash-on-delivery package. Ahmed the courier is at the customer’s door.',
    actionId: 'deliverShipment',
    input: () => ({ shipmentId: 'PN001' }),
  },
  {
    id: 'deliver-pn002',
    title: 'Ahmed delivers PN002',
    blurb: 'Same route, a second package — 800 EGP cash-on-delivery.',
    actionId: 'deliverShipment',
    input: () => ({ shipmentId: 'PN002' }),
  },
  {
    id: 'replace-pn003',
    title: 'A replacement, PN003, needs a refund',
    blurb: 'This customer keeps nothing and is owed 200 EGP back — Ahmed pays it out of the cash he’s already collected, not a separate company payment.',
    actionId: 'processReplacement',
    input: () => ({ shipmentId: 'PN003', subOutcome: 'ReplacementCleanSwap' }),
  },
  {
    id: 'reconcile',
    title: 'Ahmed hands over his cash',
    blurb: 'At the end of the day, Ahmed counts what he’s holding and hands it to the hub.',
    actionId: 'startCourierReconciliation',
    input: () => ({ courierId: 'COU-AHMED', actualCash: 1600 }),
  },
  {
    id: 'seller-settlement',
    title: 'Finance works out what Seller A is owed',
    blurb: 'No money moves yet — this just totals up the day’s deliveries for Seller A.',
    actionId: 'calculateSellerSettlement',
    input: () => ({ merchantId: 'MER-A' }),
  },
  {
    id: 'courier-settlement',
    title: 'Finance works out what Ahmed earned',
    blurb: 'Same idea, but for Ahmed’s commission.',
    actionId: 'calculateCourierSettlement',
    input: () => ({ courierId: 'COU-AHMED' }),
  },
  {
    id: 'seller-payout-1',
    title: 'Finance tries to pay Seller A',
    blurb: 'First attempt — sometimes a bank transfer just fails.',
    actionId: 'executePayout',
    input: (state) => ({ party: 'Seller', settlementId: latestSellerSettlement(state).id, simulateFailure: true }),
  },
  {
    id: 'seller-payout-2',
    title: 'Finance retries the payment',
    blurb: 'Same settlement, tried again — this time it goes through.',
    actionId: 'retryPayout',
    input: (state) => ({ party: 'Seller', settlementId: latestSellerSettlement(state).id, simulateFailure: false }),
  },
  {
    id: 'courier-payout',
    title: 'Finance pays Ahmed',
    blurb: 'His commission for the day, paid on the first attempt.',
    actionId: 'executePayout',
    input: (state) => ({ party: 'Courier', settlementId: latestCourierSettlement(state).id, simulateFailure: false }),
  },
];

/**
 * Company-wide expenses & revenue (doc §9) — a short second story you can
 * play after the shipment story, using the exact figures from the worked
 * example so the final Net Result matches the document (− 33,555 EGP).
 */
export const COMPANY_STORY: StoryStep[] = [
  {
    id: 'exp-fuel',
    title: 'Ahmed buys fuel',
    blurb: 'He pays for it himself — the company owes him back for this one.',
    actionId: 'recordExpense',
    input: () => ({ type: 'Fuel', attributedToType: 'Courier', attributedToId: 'COU-AHMED', amount: 300, paidBy: 'CourierReimbursable', description: 'Motorcycle fuel — September' }),
  },
  {
    id: 'exp-maintenance',
    title: 'A motorcycle gets serviced',
    blurb: 'Paid straight to the garage by the company.',
    actionId: 'recordExpense',
    input: () => ({ type: 'VehicleMaintenance', attributedToType: 'Courier', attributedToId: 'COU-AHMED', amount: 1200, paidBy: 'Company', description: 'Paid to garage directly' }),
  },
  {
    id: 'exp-rent',
    title: 'Hub 7’s monthly rent is due',
    blurb: 'A big, predictable cost the hub carries every month.',
    actionId: 'recordExpense',
    input: () => ({ type: 'Rent', attributedToType: 'Hub', attributedToId: 'HUB-7', amount: 30000, paidBy: 'Company' }),
  },
  {
    id: 'exp-utilities',
    title: 'Utilities for Hub 7',
    blurb: 'Electricity, water, internet.',
    actionId: 'recordExpense',
    input: () => ({ type: 'Utilities', attributedToType: 'Hub', attributedToId: 'HUB-7', amount: 2500, paidBy: 'Company' }),
  },
  {
    id: 'exp-compensation',
    title: 'A customer is compensated',
    blurb: 'For a different shipment, PN010 — paid directly by the company, not out of a courier’s cash.',
    actionId: 'recordExpense',
    input: () => ({ type: 'CustomerCompensation', attributedToType: 'Shipment', attributedToId: 'PN010', amount: 400, paidBy: 'Company', description: 'Paid directly, not from a courier’s cash' }),
  },
  {
    id: 'rev-other',
    title: 'Selling old packaging materials',
    blurb: 'A one-off bit of income that has nothing to do with any shipment.',
    actionId: 'recordRevenue',
    input: () => ({ amount: 800, notes: 'Sold surplus packaging materials to another vendor' }),
  },
];
