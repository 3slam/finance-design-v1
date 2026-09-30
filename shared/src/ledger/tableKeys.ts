import type { LedgerTableName } from './domain.js';
import type { LedgerState } from './state.js';

export const LEDGER_TABLE_STATE_KEY: Record<LedgerTableName, keyof LedgerState> = {
  merchants: 'merchants',
  couriers: 'couriers',
  hubs: 'hubs',
  merchant_pricing_configs: 'merchantPricingConfigs',
  shipments: 'shipments',
  finance_accounts: 'financeAccounts',
  finance_transactions: 'financeTransactions',
  finance_entries: 'financeEntries',
  courier_reconciliations: 'courierReconciliations',
  courier_reconciliation_lines: 'courierReconciliationLines',
  cash_deposits: 'cashDeposits',
  settlements: 'settlements',
  settlement_lines: 'settlementLines',
  payouts: 'payouts',
  audit_log: 'auditLog',
};
