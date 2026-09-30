import { beforeEach, describe, expect, it } from 'vitest';
import { LedgerEngine } from './engine.js';
import { isLedgerActionSuccess } from './domain.js';
import { getAccountBalance, getTrialBalance } from './calculations.js';
import { BANK_MAIN, courierCashAccountCode, courierPayableAccountCode, EXP_COURIER, hubCashAccountCode, REV_REPLACEMENT, REV_SHIPPING, sellerPayableAccountCode } from './seed.js';

const AHMED_CASH = courierCashAccountCode('COU-AHMED');
const AHMED_PAYABLE = courierPayableAccountCode('COU-AHMED');
const SELLER_A_PAYABLE = sellerPayableAccountCode('MER-A');
const HUB7_CASH = hubCashAccountCode('HUB-7');

function entriesOf(engine: LedgerEngine, transactionId: string) {
  const state = engine.getState();
  return Object.values(state.financeEntries).filter((e) => e.transactionId === transactionId);
}

describe('LedgerEngine — doc Part 3 worked example (TX001-TX008)', () => {
  let engine: LedgerEngine;

  beforeEach(() => {
    engine = new LedgerEngine();
  });

  it('TX001 DELIVERY_POSTED PN001 matches the doc table exactly (§16.3)', () => {
    const result = engine.execute('deliverShipment', { shipmentId: 'PN001' });
    expect(isLedgerActionSuccess(result)).toBe(true);
    const state = engine.getState();
    const tx = Object.values(state.financeTransactions).find((t) => t.shipmentId === 'PN001')!;
    expect(tx.type).toBe('DELIVERY_POSTED');
    const lines = entriesOf(engine, tx.id);
    expect(lines).toHaveLength(5);
    const by = (accountId: string, direction: 'Debit' | 'Credit') => lines.find((l) => l.accountId === accountId && l.direction === direction)?.amount;
    expect(by(AHMED_CASH, 'Debit')).toBe(1000);
    expect(by(EXP_COURIER, 'Debit')).toBe(45);
    expect(by(SELLER_A_PAYABLE, 'Credit')).toBe(940);
    expect(by(REV_SHIPPING, 'Credit')).toBe(60);
    expect(by(AHMED_PAYABLE, 'Credit')).toBe(45);
    expect(lines.reduce((s, l) => s + (l.direction === 'Debit' ? l.amount : 0), 0)).toBe(1045);
    expect(lines.reduce((s, l) => s + (l.direction === 'Credit' ? l.amount : 0), 0)).toBe(1045);
  });

  it('after TX001+TX002, balances match doc §17 exactly', () => {
    engine.execute('deliverShipment', { shipmentId: 'PN001' });
    engine.execute('deliverShipment', { shipmentId: 'PN002' });
    const state = engine.getState();
    expect(getAccountBalance(state, AHMED_CASH)).toBe(1800);
    expect(getAccountBalance(state, SELLER_A_PAYABLE)).toBe(1680);
    expect(getAccountBalance(state, AHMED_PAYABLE)).toBe(90);
    expect(getAccountBalance(state, REV_SHIPPING)).toBe(120);
    expect(getAccountBalance(state, EXP_COURIER)).toBe(90);
  });

  it('TX003 REPLACEMENT_POSTED PN003 matches the doc’s 6-line table exactly (§18.2)', () => {
    engine.execute('deliverShipment', { shipmentId: 'PN001' });
    engine.execute('deliverShipment', { shipmentId: 'PN002' });
    const result = engine.execute('processReplacement', { shipmentId: 'PN003', subOutcome: 'ReplacementCleanSwap' });
    expect(isLedgerActionSuccess(result)).toBe(true);
    const state = engine.getState();
    const tx = Object.values(state.financeTransactions).find((t) => t.shipmentId === 'PN003')!;
    const lines = entriesOf(engine, tx.id);
    expect(lines).toHaveLength(6);
    const totalDebit = lines.reduce((s, l) => s + (l.direction === 'Debit' ? l.amount : 0), 0);
    const totalCredit = lines.reduce((s, l) => s + (l.direction === 'Credit' ? l.amount : 0), 0);
    expect(totalDebit).toBe(285);
    expect(totalCredit).toBe(285);

    expect(getAccountBalance(state, AHMED_CASH)).toBe(1600); // 1000 + 800 - 200, doc §18.2
    expect(getAccountBalance(state, SELLER_A_PAYABLE)).toBe(1430);
    expect(getAccountBalance(state, AHMED_PAYABLE)).toBe(125);
    expect(getAccountBalance(state, REV_REPLACEMENT)).toBe(50);
  });

  it('reverses courier commission on Total Refusal', () => {
    engine.execute('deliverShipment', { shipmentId: 'PN001' });
    const result = engine.execute('processReplacement', { shipmentId: 'PN003', subOutcome: 'ReplacementTotalRefusal' });
    expect(isLedgerActionSuccess(result)).toBe(true);
    const state = engine.getState();
    expect(getAccountBalance(state, AHMED_PAYABLE)).toBe(45); // only PN001's commission, none from PN003
  });

  it('TX004 COURIER_CASH_HANDOVER matched: courier cash zeroes, hub cash gets 1,600 (§19.4)', () => {
    engine.execute('deliverShipment', { shipmentId: 'PN001' });
    engine.execute('deliverShipment', { shipmentId: 'PN002' });
    engine.execute('processReplacement', { shipmentId: 'PN003', subOutcome: 'ReplacementCleanSwap' });
    const result = engine.execute('startCourierReconciliation', { courierId: 'COU-AHMED', actualCash: 1600 });
    expect(isLedgerActionSuccess(result)).toBe(true);
    const state = engine.getState();
    expect(getAccountBalance(state, AHMED_CASH)).toBe(0);
    expect(getAccountBalance(state, HUB7_CASH)).toBe(1600);
    const recon = Object.values(state.courierReconciliations)[0];
    expect(recon.status).toBe('Matched');
    expect(recon.expectedCash).toBe(1600);
  });

  it('a shortage (actual 1,500) leaves 100 EGP still owed on the courier’s own cash balance (§19.5)', () => {
    engine.execute('deliverShipment', { shipmentId: 'PN001' });
    engine.execute('deliverShipment', { shipmentId: 'PN002' });
    engine.execute('processReplacement', { shipmentId: 'PN003', subOutcome: 'ReplacementCleanSwap' });
    engine.execute('startCourierReconciliation', { courierId: 'COU-AHMED', actualCash: 1500 });
    const state = engine.getState();
    expect(getAccountBalance(state, AHMED_CASH)).toBe(100); // NOT zeroed — doc's key point
    expect(getAccountBalance(state, HUB7_CASH)).toBe(1500);
    const recon = Object.values(state.courierReconciliations)[0];
    expect(recon.status).toBe('Short');
    expect(recon.variance).toBe(-100);
  });

  it('an overage (actual 1,700) posts the extra 100 to cash:suspense, not revenue (§19.6)', () => {
    engine.execute('deliverShipment', { shipmentId: 'PN001' });
    engine.execute('deliverShipment', { shipmentId: 'PN002' });
    engine.execute('processReplacement', { shipmentId: 'PN003', subOutcome: 'ReplacementCleanSwap' });
    engine.execute('startCourierReconciliation', { courierId: 'COU-AHMED', actualCash: 1700 });
    const state = engine.getState();
    expect(getAccountBalance(state, AHMED_CASH)).toBe(0); // fully closed
    expect(getAccountBalance(state, HUB7_CASH)).toBe(1700);
    expect(getAccountBalance(state, 'cash:suspense')).toBe(100);
  });

  it('Seller Settlement nets exactly 1,430 EGP (§21) and Courier Settlement nets 125 EGP (§22)', () => {
    engine.execute('deliverShipment', { shipmentId: 'PN001' });
    engine.execute('deliverShipment', { shipmentId: 'PN002' });
    engine.execute('processReplacement', { shipmentId: 'PN003', subOutcome: 'ReplacementCleanSwap' });

    const sellerResult = engine.execute('calculateSellerSettlement', { merchantId: 'MER-A' });
    expect(isLedgerActionSuccess(sellerResult)).toBe(true);
    const courierResult = engine.execute('calculateCourierSettlement', { courierId: 'COU-AHMED' });
    expect(isLedgerActionSuccess(courierResult)).toBe(true);

    const state = engine.getState();
    const sellerSettlement = Object.values(state.settlements).find((s) => s.partyType === 'Seller')!;
    const courierSettlement = Object.values(state.settlements).find((s) => s.partyType === 'Courier')!;
    expect(sellerSettlement.net).toBe(1430);
    expect(sellerSettlement.status).toBe('Approved');
    expect(courierSettlement.net).toBe(125);

    // Calculating a settlement must not move the Ledger (doc §21: "no Ledger Transaction: we haven't paid anything").
    expect(getAccountBalance(state, SELLER_A_PAYABLE)).toBe(1430);
    expect(getAccountBalance(state, AHMED_PAYABLE)).toBe(125);
  });

  it('Payout: first attempt fails (no Ledger effect), retry succeeds and discharges the liability (§24, §33.1)', () => {
    engine.execute('deliverShipment', { shipmentId: 'PN001' });
    engine.execute('deliverShipment', { shipmentId: 'PN002' });
    engine.execute('processReplacement', { shipmentId: 'PN003', subOutcome: 'ReplacementCleanSwap' });
    engine.execute('calculateSellerSettlement', { merchantId: 'MER-A' });
    const state1 = engine.getState();
    const settlement = Object.values(state1.settlements).find((s) => s.partyType === 'Seller')!;

    const failResult = engine.execute('executePayout', { party: 'Seller', settlementId: settlement.id, simulateFailure: true });
    expect(isLedgerActionSuccess(failResult)).toBe(true);
    const afterFail = engine.getState();
    expect(getAccountBalance(afterFail, SELLER_A_PAYABLE)).toBe(1430); // untouched
    expect(Object.values(afterFail.settlements).find((s) => s.id === settlement.id)!.status).toBe('Failed');

    const retryResult = engine.execute('retryPayout', { party: 'Seller', settlementId: settlement.id, simulateFailure: false });
    expect(isLedgerActionSuccess(retryResult)).toBe(true);
    const afterRetry = engine.getState();
    expect(getAccountBalance(afterRetry, SELLER_A_PAYABLE)).toBe(0);
    // No CashDeposit ran in this test, so paying out 1,430 the company never
    // banked correctly drives bank:main negative — real accrual accounting,
    // not a bug (doc §25: cash ≠ net income).
    expect(getAccountBalance(afterRetry, BANK_MAIN)).toBe(-1430);
    expect(Object.values(afterRetry.settlements).find((s) => s.id === settlement.id)!.status).toBe('Paid');
  });

  it('the full guided story: trial balance stays balanced after every single action, and every sourceEventId is unique', () => {
    const steps: Array<[Parameters<LedgerEngine['execute']>[0], Record<string, unknown>]> = [
      ['deliverShipment', { shipmentId: 'PN001' }],
      ['deliverShipment', { shipmentId: 'PN002' }],
      ['processReplacement', { shipmentId: 'PN003', subOutcome: 'ReplacementCleanSwap' }],
      ['startCourierReconciliation', { courierId: 'COU-AHMED', actualCash: 1600 }],
      ['calculateSellerSettlement', { merchantId: 'MER-A' }],
      ['calculateCourierSettlement', { courierId: 'COU-AHMED' }],
    ];
    for (const [actionId, input] of steps) {
      const result = engine.execute(actionId, input);
      expect(isLedgerActionSuccess(result)).toBe(true);
      const tb = getTrialBalance(engine.getState());
      expect(tb.balanced).toBe(true);
    }
    const sellerSettlement = Object.values(engine.getState().settlements).find((s) => s.partyType === 'Seller')!;
    const courierSettlement = Object.values(engine.getState().settlements).find((s) => s.partyType === 'Courier')!;

    const more: Array<[Parameters<LedgerEngine['execute']>[0], Record<string, unknown>]> = [
      ['executePayout', { party: 'Seller', settlementId: sellerSettlement.id, simulateFailure: true }],
      ['retryPayout', { party: 'Seller', settlementId: sellerSettlement.id, simulateFailure: false }],
      ['executePayout', { party: 'Courier', settlementId: courierSettlement.id, simulateFailure: false }],
      ['recordExpense', { type: 'Fuel', attributedToId: 'COU-AHMED', amount: 300, paidBy: 'CourierReimbursable', description: 'Motorcycle fuel' }],
      ['recordExpense', { type: 'VehicleMaintenance', amount: 1200, paidBy: 'Company', description: 'Garage' }],
      ['recordExpense', { type: 'Rent', amount: 30000, paidBy: 'Company', description: 'Hub 7 rent' }],
      ['recordExpense', { type: 'Utilities', amount: 2500, paidBy: 'Company', description: 'Hub 7 utilities' }],
      ['recordExpense', { type: 'CustomerCompensation', amount: 400, paidBy: 'Company', description: 'PN010 compensation' }],
      ['recordRevenue', { amount: 800, notes: 'Sold packaging' }],
    ];
    for (const [actionId, input] of more) {
      const result = engine.execute(actionId, input);
      expect(isLedgerActionSuccess(result)).toBe(true);
      const tb = getTrialBalance(engine.getState());
      expect(tb.balanced).toBe(true);
    }

    const finalState = engine.getState();
    const sourceEventIds = Object.values(finalState.financeTransactions).map((t) => t.sourceEventId);
    expect(new Set(sourceEventIds).size).toBe(sourceEventIds.length); // doc §2.7: source_event_id UNIQUE

    const rollup = engine.getPeriodRollup();
    expect(rollup.netResult).toBe(-33555); // matches the flat design's own worked-example result exactly
  });
});
