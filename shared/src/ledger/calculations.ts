import type { PeriodRollup } from '../calculations.js';
import { courierCashAccountCode, courierPayableAccountCode, sellerPayableAccountCode, EXP_COMPENSATION, EXP_COURIER, EXP_FUEL, EXP_MAINTENANCE, EXP_RENT, EXP_UTILITIES, REV_OTHER, REV_REPLACEMENT, REV_SHIPPING } from './seed.js';
import type {
  CourierFinancialSummaryView,
  FinanceAccount,
  ID,
  SellerFinancialSummaryView,
  ShipmentFinancialSummaryView,
  TrialBalanceRow,
  TrialBalanceView,
} from './domain.js';
import type { LedgerState } from './state.js';

/** doc §2.4: the balance is a question we ask the Entries, never a stored
 * number. Debit-normal: SUM(Debit) − SUM(Credit). Credit-normal: the
 * reverse. */
export function getAccountBalance(state: LedgerState, accountId: ID): number {
  const account = state.financeAccounts[accountId];
  if (!account) return 0;
  let debit = 0;
  let credit = 0;
  for (const entry of Object.values(state.financeEntries)) {
    if (entry.accountId !== accountId) continue;
    if (entry.direction === 'Debit') debit += entry.amount;
    else credit += entry.amount;
  }
  return account.normalSide === 'Debit' ? debit - credit : credit - debit;
}

function accountTotals(state: LedgerState, accountId: ID): { debit: number; credit: number } {
  let debit = 0;
  let credit = 0;
  for (const entry of Object.values(state.financeEntries)) {
    if (entry.accountId !== accountId) continue;
    if (entry.direction === 'Debit') debit += entry.amount;
    else credit += entry.amount;
  }
  return { debit, credit };
}

/** doc §2.5: proof the Ledger doesn't lie — sum of Debit-normal balances
 * must equal sum of Credit-normal balances, at every moment. */
export function getTrialBalance(state: LedgerState): TrialBalanceView {
  const rows: TrialBalanceRow[] = [];
  let totalDebitNormal = 0;
  let totalCreditNormal = 0;
  for (const account of Object.values(state.financeAccounts) as FinanceAccount[]) {
    const { debit, credit } = accountTotals(state, account.id);
    const balance = account.normalSide === 'Debit' ? debit - credit : credit - debit;
    rows.push({ accountId: account.id, code: account.code, name: account.name, accountType: account.accountType, normalSide: account.normalSide, debitTotal: debit, creditTotal: credit, balance });
    if (account.normalSide === 'Debit') totalDebitNormal += balance;
    else totalCreditNormal += balance;
  }
  rows.sort((a, b) => a.code.localeCompare(b.code));
  return { rows, totalDebitNormal, totalCreditNormal, balanced: totalDebitNormal === totalCreditNormal };
}

function transactionsForShipment(state: LedgerState, shipmentId: ID) {
  return Object.values(state.financeTransactions).filter((t) => t.shipmentId === shipmentId && t.status === 'Posted');
}

function entriesFor(state: LedgerState, transactionId: ID) {
  return Object.values(state.financeEntries).filter((e) => e.transactionId === transactionId);
}

/** doc §13.1 — one row per shipment, computed here instead of persisted
 * (see ledger/domain.ts file header). */
export function getShipmentFinancialSummary(state: LedgerState, shipmentId: ID): ShipmentFinancialSummaryView {
  const shipment = state.shipments[shipmentId];
  const txs = transactionsForShipment(state, shipmentId);
  const courierCash = shipment ? courierCashAccountCode(shipment.courierId) : null;
  const sellerPayable = shipment ? sellerPayableAccountCode(shipment.merchantId) : null;
  const courierPayable = shipment ? courierPayableAccountCode(shipment.courierId) : null;

  let codCollected = 0;
  let customerRefunded = 0;
  let sellerFees = 0;
  let sellerNet = 0;
  let courierEarning = 0;

  for (const tx of txs) {
    for (const e of entriesFor(state, tx.id)) {
      if (e.accountId === courierCash) {
        if (e.direction === 'Debit') codCollected += e.amount;
        else customerRefunded += e.amount;
      }
      if (e.accountId === REV_SHIPPING || e.accountId === REV_REPLACEMENT) {
        if (e.direction === 'Credit') sellerFees += e.amount;
      }
      if (e.accountId === sellerPayable) {
        sellerNet += e.direction === 'Credit' ? e.amount : -e.amount;
      }
      if (e.accountId === courierPayable) {
        courierEarning += e.direction === 'Credit' ? e.amount : -e.amount;
      }
    }
  }

  const cashReconciled = Object.values(state.courierReconciliationLines).some((l) => txs.some((t) => t.id === l.financeTransactionId));
  const sellerLine = Object.values(state.settlementLines).find((l) => txs.some((t) => t.id === l.financeTransactionId) && state.settlements[l.settlementId]?.partyType === 'Seller');
  const courierLine = Object.values(state.settlementLines).find((l) => txs.some((t) => t.id === l.financeTransactionId) && state.settlements[l.settlementId]?.partyType === 'Courier');
  const sellerSettlementId = sellerLine?.settlementId ?? null;
  const relevantSettlementId = sellerSettlementId ?? courierLine?.settlementId ?? null;
  const payout = relevantSettlementId ? Object.values(state.payouts).find((p) => p.settlementId === relevantSettlementId && p.status !== 'Failed') : undefined;

  return {
    shipmentId,
    codExpected: shipment?.codAmount ?? 0,
    codCollected,
    customerRefunded,
    sellerFees,
    sellerNet,
    courierEarning,
    companyMargin: sellerFees - courierEarning,
    cashReconciled,
    sellerSettlementId,
    courierSettlementId: courierLine?.settlementId ?? null,
    payoutStatus: payout?.status ?? null,
  };
}

/** doc §13.2 — posted_balance / available (no reserve model implemented, so available === posted). */
export function getSellerFinancialSummary(state: LedgerState, merchantId: ID): SellerFinancialSummaryView {
  const balance = getAccountBalance(state, sellerPayableAccountCode(merchantId));
  return { merchantId, postedBalance: balance, availableBalance: balance };
}

/** doc §13.3 — cash_in_custody / earnings_unsettled. */
export function getCourierFinancialSummary(state: LedgerState, courierId: ID): CourierFinancialSummaryView {
  return {
    courierId,
    cashInCustody: getAccountBalance(state, courierCashAccountCode(courierId)),
    earningsUnsettled: getAccountBalance(state, courierPayableAccountCode(courierId)),
  };
}

/** Shaped exactly like the flat design's PeriodRollup (`../calculations.ts`)
 * so the same CompletionCard component can render either design's result —
 * but every number here is read off account balances, not a hand-written
 * roll-up formula (doc §2.8, §55 "why 5 rows per shipment"). */
export function getLedgerPeriodRollup(state: LedgerState): PeriodRollup {
  const shipmentFeesEarned = getAccountBalance(state, REV_SHIPPING) + getAccountBalance(state, REV_REPLACEMENT);
  const courierCommissionsPaid = getAccountBalance(state, EXP_COURIER);
  const companyShipmentContribution = shipmentFeesEarned - courierCommissionsPaid;
  const otherRevenue = getAccountBalance(state, REV_OTHER);
  const operatingExpenseAccounts = [EXP_FUEL, EXP_MAINTENANCE, EXP_RENT, EXP_UTILITIES, EXP_COMPENSATION];
  const totalExpenses = operatingExpenseAccounts.reduce((sum, code) => sum + getAccountBalance(state, code), 0);
  const expenseLines = Object.values(state.financeTransactions)
    .filter((t) => t.type === 'EXPENSE_PAID' && t.status === 'Posted')
    .map((t) => ({ label: `${t.memo} (${t.id})`, amount: -(entriesFor(state, t.id).find((e) => e.direction === 'Debit')?.amount ?? 0) }));
  const netResult = companyShipmentContribution + otherRevenue - totalExpenses;
  return { shipmentFeesEarned, courierCommissionsPaid, companyShipmentContribution, otherRevenue, totalExpenses, expenseLines, netResult };
}
