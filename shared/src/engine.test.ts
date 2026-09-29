import { beforeEach, describe, expect, it } from 'vitest';
import { FinanceEngine } from './engine.js';
import { isActionSuccess } from './domain.js';

describe('FinanceEngine — Shipment Finance worked example (doc §6)', () => {
  let engine: FinanceEngine;

  beforeEach(() => {
    engine = new FinanceEngine();
  });

  it('delivers PN001 and PN002 exactly as in §6.1', () => {
    const r1 = engine.execute('deliverShipment', { shipmentId: 'PN001' });
    expect(isActionSuccess(r1)).toBe(true);
    if (!isActionSuccess(r1)) throw new Error('unreachable');
    expect(r1.affectedTables).toEqual(expect.arrayContaining(['shipments', 'shipment_financials', 'audit_log']));

    const r2 = engine.execute('deliverShipment', { shipmentId: 'PN002' });
    expect(isActionSuccess(r2)).toBe(true);

    const state = engine.getState();
    expect(state.shipments.PN001.status).toBe('Delivered');
    expect(state.shipments.PN001.collectedAmount).toBe(1000);
    expect(state.shipments.PN002.collectedAmount).toBe(800);

    const financialsForPN001 = Object.values(state.shipmentFinancials).find((f) => f.shipmentId === 'PN001')!;
    expect(financialsForPN001.sellerFee).toBe(60);
    expect(financialsForPN001.courierEarning).toBe(45);

    const financialsForPN002 = Object.values(state.shipmentFinancials).find((f) => f.shipmentId === 'PN002')!;
    expect(financialsForPN002.sellerFee).toBe(60);
    expect(financialsForPN002.courierEarning).toBe(45);

    // Seller Base Effect = Collected - Refund - Fee (doc §1)
    expect(state.shipments.PN001.collectedAmount - state.shipments.PN001.refundAmount - financialsForPN001.sellerFee).toBe(940);
    expect(state.shipments.PN002.collectedAmount - state.shipments.PN002.refundAmount - financialsForPN002.sellerFee).toBe(740);
  });

  it('processes the PN003 replacement refund exactly as in §6.2', () => {
    const result = engine.execute('processReplacement', { shipmentId: 'PN003', subOutcome: 'ReplacementCleanSwap' });
    expect(isActionSuccess(result)).toBe(true);

    const state = engine.getState();
    expect(state.shipments.PN003.collectedAmount).toBe(0);
    expect(state.shipments.PN003.refundAmount).toBe(200);

    const financials = Object.values(state.shipmentFinancials).find((f) => f.shipmentId === 'PN003')!;
    expect(financials.sellerFee).toBe(50);
    expect(financials.courierEarning).toBe(35);

    // Seller Effect for PN003 = 0 - 200 - 50 = -250 (doc §6.2 table)
    expect(state.shipments.PN003.collectedAmount - state.shipments.PN003.refundAmount - financials.sellerFee).toBe(-250);
  });

  it('reverses courier earning on Total Refusal replacements (doc §5)', () => {
    engine.execute('deliverShipment', { shipmentId: 'PN001' }); // unrelated, just populate state
    const result = engine.execute('processReplacement', { shipmentId: 'PN003', subOutcome: 'ReplacementTotalRefusal' });
    expect(isActionSuccess(result)).toBe(true);
    const state = engine.getState();
    const financials = Object.values(state.shipmentFinancials).find((f) => f.shipmentId === 'PN003')!;
    expect(financials.courierEarning).toBe(0);
    expect(financials.sellerFee).toBe(50);
  });

  it('computes Expected Courier Cash = 1600 EGP after PN001-PN003 (doc §6.2)', () => {
    const results = engine.runScenario('complete-shipment-delivery');
    expect(results.every(isActionSuccess)).toBe(true);

    const state = engine.getState();
    const ahmedShipments = Object.values(state.shipments).filter((s) => s.courierId === 'COU-AHMED' && ['PN001', 'PN002', 'PN003'].includes(s.id));
    const expectedCourierCash = ahmedShipments.reduce((sum, s) => sum + (s.collectedAmount - s.refundAmount), 0);
    expect(expectedCourierCash).toBe(1600);
  });

  it('closes a courier reconciliation Matched when actual cash equals expected (doc §6.3)', () => {
    engine.runScenario('complete-shipment-delivery');
    const result = engine.runScenario('courier-cash-reconciliation')[0];
    expect(isActionSuccess(result)).toBe(true);
    const state = engine.getState();
    const recon = Object.values(state.courierReconciliations)[0];
    expect(recon.expectedCash).toBe(1600);
    expect(recon.actualCash).toBe(1600);
    expect(recon.variance).toBe(0);
    expect(recon.status).toBe('MatchedClosed');
  });

  it('flags a courier reconciliation as Short when actual cash is below expected (doc §6.3)', () => {
    engine.runScenario('complete-shipment-delivery');
    const result = engine.execute('startCourierReconciliation', { courierId: 'COU-AHMED', actualCash: 1500 });
    expect(isActionSuccess(result)).toBe(true);
    const state = engine.getState();
    const recon = Object.values(state.courierReconciliations)[0];
    expect(recon.variance).toBe(-100);
    expect(recon.status).toBe('ShortNeedsDecision');
  });

  it('calculates Seller Settlement SET-S001 = 1,430 EGP net (doc §6.4)', () => {
    engine.runScenario('complete-shipment-delivery');
    const result = engine.runScenario('seller-settlement')[0];
    expect(isActionSuccess(result)).toBe(true);
    const state = engine.getState();
    const settlement = Object.values(state.sellerSettlements)[0];
    expect(settlement.shipmentNet).toBe(1430);
    expect(settlement.adjustmentsNet).toBe(0);
    expect(settlement.totalNet).toBe(1430);
    expect(settlement.status).toBe('Calculated');
  });

  it('calculates Courier Settlement SET-C001 = 125 EGP (doc §6.5)', () => {
    engine.runScenario('complete-shipment-delivery');
    const result = engine.runScenario('courier-settlement')[0];
    expect(isActionSuccess(result)).toBe(true);
    const state = engine.getState();
    const settlement = Object.values(state.courierSettlements)[0];
    expect(settlement.earningTotal).toBe(125);
    expect(settlement.totalNet).toBe(125);
  });

  it('a later compensation never reopens the closed settlement, only the next one (doc §6.6)', () => {
    engine.runScenario('complete-shipment-delivery');
    engine.runScenario('seller-settlement');
    const stateAfterFirst = engine.getState();
    const firstSettlement = Object.values(stateAfterFirst.sellerSettlements)[0];
    expect(firstSettlement.totalNet).toBe(1430);

    const results = engine.runScenario('seller-compensation-next-settlement');
    expect(results.every(isActionSuccess)).toBe(true);

    const state = engine.getState();
    // First settlement is untouched.
    expect(state.sellerSettlements[firstSettlement.id].totalNet).toBe(1430);
    // Second settlement picks up only the 500 EGP adjustment.
    const secondSettlement = Object.values(state.sellerSettlements).find((s) => s.id !== firstSettlement.id)!;
    expect(secondSettlement.shipmentNet).toBe(0);
    expect(secondSettlement.adjustmentsNet).toBe(500);
    expect(secondSettlement.totalNet).toBe(500);
  });

  it('tracks a failed payout attempt and a successful retry as separate records (doc §6.7)', () => {
    engine.runScenario('complete-shipment-delivery');
    engine.runScenario('seller-settlement');
    const results = engine.runScenario('merchant-payout');
    expect(results.every(isActionSuccess)).toBe(true);

    const state = engine.getState();
    const payouts = Object.values(state.payouts).sort((a, b) => a.attemptNumber - b.attemptNumber);
    expect(payouts).toHaveLength(2);
    expect(payouts[0].status).toBe('Failed');
    expect(payouts[1].status).toBe('Paid');
    expect(payouts[1].amount).toBe(1430);

    const settlement = Object.values(state.sellerSettlements)[0];
    expect(settlement.status).toBe('Paid');
  });

  it('pays the courier settlement in full on the first attempt (doc §6.7)', () => {
    engine.runScenario('complete-shipment-delivery');
    engine.runScenario('courier-settlement');
    const results = engine.runScenario('courier-payout');
    expect(results.every(isActionSuccess)).toBe(true);
    const state = engine.getState();
    const payout = Object.values(state.payouts)[0];
    expect(payout.status).toBe('Paid');
    expect(payout.amount).toBe(125);
  });
});

describe('FinanceEngine — Company Expenses & Revenue worked example (doc §9)', () => {
  it('rolls up to a Net Result of -33,555 EGP for the period (doc §9.3)', () => {
    const engine = new FinanceEngine();
    engine.runScenario('complete-shipment-delivery');
    const results = engine.runScenario('company-expenses-and-revenue');
    expect(results.every(isActionSuccess)).toBe(true);

    const rollup = engine.getPeriodRollup();
    expect(rollup.shipmentFeesEarned).toBe(170);
    expect(rollup.courierCommissionsPaid).toBe(125);
    expect(rollup.companyShipmentContribution).toBe(45);
    expect(rollup.otherRevenue).toBe(800);
    expect(rollup.totalExpenses).toBe(300 + 1200 + 30000 + 2500 + 400);
    expect(rollup.netResult).toBe(-33555);
  });

  it('marks a reimbursable expense as Owed and a company-paid one as NotApplicable (doc §9.1)', () => {
    const engine = new FinanceEngine();
    const fuel = engine.execute('recordExpense', {
      type: 'Fuel',
      attributedToType: 'Courier',
      attributedToId: 'COU-AHMED',
      amount: 300,
      paidBy: 'CourierReimbursable',
    });
    const rent = engine.execute('recordExpense', { type: 'Rent', attributedToType: 'Hub', attributedToId: 'HUB-7', amount: 30000, paidBy: 'Company' });
    expect(isActionSuccess(fuel) && isActionSuccess(rent)).toBe(true);

    const state = engine.getState();
    const fuelRow = Object.values(state.expenseTransactions).find((e) => e.type === 'Fuel')!;
    const rentRow = Object.values(state.expenseTransactions).find((e) => e.type === 'Rent')!;
    expect(fuelRow.reimbursementStatus).toBe('Owed');
    expect(rentRow.reimbursementStatus).toBe('NotApplicable');
  });

  it('requires a description for Other Expense (doc §8)', () => {
    const engine = new FinanceEngine();
    const result = engine.execute('recordExpense', { type: 'OtherExpense', attributedToType: 'General', amount: 50, paidBy: 'Company' });
    expect(isActionSuccess(result)).toBe(false);
  });
});

describe('FinanceEngine — validation / invalid operations (doc §18)', () => {
  let engine: FinanceEngine;

  beforeEach(() => {
    engine = new FinanceEngine();
  });

  it('rejects delivering a shipment that is not Out For Delivery', () => {
    engine.execute('deliverShipment', { shipmentId: 'PN001' });
    const second = engine.execute('deliverShipment', { shipmentId: 'PN001' });
    expect(isActionSuccess(second)).toBe(false);
    if (isActionSuccess(second)) throw new Error('unreachable');
    expect(second.reason).toMatch(/not Out For Delivery/);
  });

  it('rejects delivering a Replacement-service shipment via Deliver Shipment', () => {
    const result = engine.execute('deliverShipment', { shipmentId: 'PN003' });
    expect(isActionSuccess(result)).toBe(false);
  });

  it('rejects starting a courier reconciliation with no unclaimed rows', () => {
    const result = engine.execute('startCourierReconciliation', { courierId: 'COU-AHMED', actualCash: 0 });
    expect(isActionSuccess(result)).toBe(false);
    if (isActionSuccess(result)) throw new Error('unreachable');
    expect(result.reason).toMatch(/no unclaimed/);
  });

  it('rejects calculating a seller settlement with nothing to settle', () => {
    const result = engine.execute('calculateSellerSettlement', { merchantId: 'MER-A' });
    expect(isActionSuccess(result)).toBe(false);
  });

  it('rejects a payout against a settlement that does not exist', () => {
    const result = engine.execute('executePayout', { party: 'Seller', settlementId: 'SET-S-999999' });
    expect(isActionSuccess(result)).toBe(false);
  });

  it('rejects retrying a payout that has no failed attempt', () => {
    engine.runScenario('complete-shipment-delivery');
    engine.runScenario('seller-settlement');
    const settlement = Object.values(engine.getState().sellerSettlements)[0];
    const result = engine.execute('retryPayout', { party: 'Seller', settlementId: settlement.id });
    expect(isActionSuccess(result)).toBe(false);
  });

  it('rejects a missing required field', () => {
    const result = engine.execute('deliverShipment', {});
    expect(isActionSuccess(result)).toBe(false);
  });

  it('resets to the seeded state', () => {
    engine.execute('deliverShipment', { shipmentId: 'PN001' });
    engine.reset();
    const state = engine.getState();
    expect(state.shipments.PN001.status).toBe('OutForDelivery');
    expect(Object.keys(state.shipmentFinancials)).toHaveLength(0);
  });
});
