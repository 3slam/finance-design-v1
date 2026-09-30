import type { AuditLogEntry, Courier, Hub, Merchant, MerchantPricingConfig } from '../domain.js';
import type {
  CashDeposit,
  CourierReconciliation,
  CourierReconciliationLine,
  FinanceAccount,
  FinanceEntry,
  FinanceTransaction,
  LedgerDomainEvent,
  LedgerShipment,
  Payout,
  Settlement,
  SettlementLine,
} from './domain.js';

/** The ledger design's full simulated database — doc §3's table map, minus
 * Claims/Adjustments (unused by the guided story) and the Read Model tables
 * (computed live — see `calculations.ts`). */
export interface LedgerState {
  merchants: Record<string, Merchant>;
  couriers: Record<string, Courier>;
  hubs: Record<string, Hub>;
  merchantPricingConfigs: Record<string, MerchantPricingConfig>;
  shipments: Record<string, LedgerShipment>;
  financeAccounts: Record<string, FinanceAccount>;
  financeTransactions: Record<string, FinanceTransaction>;
  financeEntries: Record<string, FinanceEntry>;
  courierReconciliations: Record<string, CourierReconciliation>;
  courierReconciliationLines: Record<string, CourierReconciliationLine>;
  cashDeposits: Record<string, CashDeposit>;
  settlements: Record<string, Settlement>;
  settlementLines: Record<string, SettlementLine>;
  payouts: Record<string, Payout>;
  auditLog: AuditLogEntry[];
  events: LedgerDomainEvent[];
}

export function emptyLedgerState(): LedgerState {
  return {
    merchants: {},
    couriers: {},
    hubs: {},
    merchantPricingConfigs: {},
    shipments: {},
    financeAccounts: {},
    financeTransactions: {},
    financeEntries: {},
    courierReconciliations: {},
    courierReconciliationLines: {},
    cashDeposits: {},
    settlements: {},
    settlementLines: {},
    payouts: {},
    auditLog: [],
    events: [],
  };
}
