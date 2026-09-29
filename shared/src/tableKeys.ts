import type { TableName } from './domain.js';
import type { FinanceState } from './state.js';

/** Maps a snake_case ERD table name to its camelCase key on FinanceState.
 * Shared between the engine (applying mutations server-side) and the
 * frontend (replaying mutations client-side during animation) so both stay
 * in lockstep. `audit_log` is special-cased by callers since it is an
 * array, not a Record. */
export const TABLE_STATE_KEY: Record<TableName, keyof FinanceState> = {
  merchants: 'merchants',
  couriers: 'couriers',
  hubs: 'hubs',
  merchant_pricing_configs: 'merchantPricingConfigs',
  shipments: 'shipments',
  shipment_financials: 'shipmentFinancials',
  courier_reconciliations: 'courierReconciliations',
  seller_settlements: 'sellerSettlements',
  courier_settlements: 'courierSettlements',
  seller_adjustments: 'sellerAdjustments',
  courier_adjustments: 'courierAdjustments',
  payouts: 'payouts',
  expense_transactions: 'expenseTransactions',
  revenue_transactions: 'revenueTransactions',
  advances: 'advances',
  advance_movements: 'advanceMovements',
  capital_transactions: 'capitalTransactions',
  cash_custodies: 'cashCustodies',
  custody_debts: 'custodyDebts',
  audit_log: 'auditLog',
};
