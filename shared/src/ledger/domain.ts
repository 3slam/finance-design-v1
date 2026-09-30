/**
 * Domain model for the "second approach" — a faithful implementation of the
 * reference document "The Finance System (Ledger) Explained in Detail"
 * (Panther — Shipping Platform · Finance Module — Double-Entry Product
 * Ledger). This is NOT a redesign invented for this repo: every account
 * code, transaction type, and table below is named and shaped exactly as
 * that document specifies, so its Part 3 worked example (the same
 * Ahmed / Seller A / PN001-PN003 story as the flat "Level 2" design in
 * `../domain.ts`) reproduces the same numbers through real double-entry
 * postings instead of stored balance columns.
 *
 * Scope note: the document's Part 1-3 (concepts + full table design +
 * worked example) are implemented in full. Part 4 catalogues 50+ edge cases
 * and Part 5/6 spec every screen and backend API for a production system —
 * this simulation implements the core mechanics those all generalize from
 * (the same Posting Rules / idempotency / immutability engine), not every
 * case individually. Claims and Adjustments (the doc's two Maker-Checker
 * workflow tables beyond Settlements/Payouts) are not implemented — the
 * guided story doesn't exercise them. Read Models (doc §13) are computed
 * live from the Ledger on every read rather than persisted and
 * incrementally updated — functionally identical at this data volume; see
 * `calculations.ts`.
 */

import type {
  ActorRole,
  AuditLogEntry,
  Courier,
  Hub,
  ID,
  ISODateTime,
  Merchant,
  MerchantPricingConfig,
  MoneyFlow,
  MoneyFlowKind,
  MoneyFlowParty,
} from '../domain.js';

// Reused as-is — generic reference data / infrastructure, not tied to
// either ERD's table shapes.
export type { ActorRole, AuditLogEntry, Courier, Hub, ID, ISODateTime, Merchant, MerchantPricingConfig, MoneyFlow, MoneyFlowKind, MoneyFlowParty };

// ---------------------------------------------------------------------------
// Shipments (Operations) — doc §4. Operations says what happened; Finance
// says what it means in money (doc §14.1). No financial column here except
// the expected COD — cod_collected/refund live only in the Ledger.
// ---------------------------------------------------------------------------

export type LedgerShipmentServiceType = 'COD' | 'Replacement';
export type LedgerShipmentStatus = 'OutForDelivery' | 'Delivered' | 'Replaced';
export type LedgerSettlementDirection = 'Collect' | 'Refund' | 'NoCash';

export interface LedgerShipment {
  id: ID;
  waybill: string;
  merchantId: ID;
  courierId: ID;
  hubId: ID;
  serviceType: LedgerShipmentServiceType;
  status: LedgerShipmentStatus;
  codAmount: number;
  /** Replacement outcomes only — same operational input as the flat design's Shipment (doc §2). */
  settlementAmount: number;
  settlementDirection: LedgerSettlementDirection | null;
  deliveredAt: ISODateTime | null;
}

// ---------------------------------------------------------------------------
// FinanceAccounts (doc §5) — the chart of accounts. `id` doubles as `code`
// (the doc's unique, human-readable "family:owner:purpose" string, e.g.
// `courier:COU-AHMED:cash`) rather than a separate internal surrogate key —
// a simplification; the doc keeps both.
// ---------------------------------------------------------------------------

export type AccountType = 'Asset' | 'Liability' | 'Revenue' | 'Expense' | 'Equity';
export type NormalSide = 'Debit' | 'Credit';
export type AccountOwnerType = 'Courier' | 'Seller' | 'Hub' | 'Bank' | 'Company' | null;
export type AccountStatus = 'Active' | 'Frozen' | 'Closed';

export interface FinanceAccount {
  id: ID;
  code: string;
  name: string;
  ownerType: AccountOwnerType;
  ownerId: ID | null;
  accountType: AccountType;
  normalSide: NormalSide;
  status: AccountStatus;
}

// ---------------------------------------------------------------------------
// FinanceTransactions / FinanceEntries (doc §6, §7) — the Ledger Core.
// Only the transaction types the guided story exercises are implemented;
// the doc's full catalogue (doc §6.2) also has CANCELLATION_POSTED,
// RETURN_FEE_POSTED, CLAIM_POSTED, COURIER_BONUS/PENALTY, REVERSAL, etc.
// ---------------------------------------------------------------------------

export type FinanceTransactionType =
  | 'DELIVERY_POSTED'
  | 'REPLACEMENT_POSTED'
  | 'COURIER_CASH_HANDOVER'
  | 'HUB_BANK_DEPOSIT'
  | 'SELLER_PAYOUT'
  | 'COURIER_PAYOUT'
  | 'EXPENSE_PAID'
  | 'OTHER_REVENUE_RECEIVED';

export type FinanceTransactionStatus = 'Posted' | 'Reversed';
export type FinanceReferenceType = 'Reconciliation' | 'CashDeposit' | 'Settlement' | 'Payout';

export interface FinanceTransaction {
  id: ID;
  type: FinanceTransactionType;
  /** UNIQUE — the idempotency guard against the same Operations event posting twice (doc §2.7, §6.2 "Why not two"). */
  sourceEventId: string;
  shipmentId: ID | null;
  sellerId: ID | null;
  courierId: ID | null;
  hubId: ID | null;
  referenceType: FinanceReferenceType | null;
  referenceId: ID | null;
  status: FinanceTransactionStatus;
  effectiveAt: ISODateTime;
  createdAt: ISODateTime;
  memo: string;
  createdBy: string;
}

export type EntryDirection = 'Debit' | 'Credit';

export interface FinanceEntry {
  id: ID;
  transactionId: ID;
  accountId: ID;
  direction: EntryDirection;
  /** Always positive — direction defines meaning (doc §7). EGP, not the doc's minor-unit piasters (a display-simplifying choice consistent with the rest of this repo). */
  amount: number;
  lineType: string;
  memo: string;
}

// ---------------------------------------------------------------------------
// CourierReconciliations / Lines (doc §8) — a document recording a human
// action; posts exactly one COURIER_CASH_HANDOVER Transaction on confirm.
// ---------------------------------------------------------------------------

export type ReconciliationStatus = 'Open' | 'Matched' | 'Short' | 'Over' | 'Closed' | 'Cancelled';

export interface CourierReconciliation {
  id: ID;
  courierId: ID;
  hubId: ID;
  businessDate: ISODateTime;
  expectedCash: number;
  actualCash: number | null;
  variance: number | null;
  status: ReconciliationStatus;
  financeTransactionId: ID | null;
  openedBy: string;
  countedBy: string | null;
  createdAt: ISODateTime;
  closedAt: ISODateTime | null;
  notes: string | null;
}

export interface CourierReconciliationLine {
  id: ID;
  reconciliationId: ID;
  shipmentId: ID;
  financeTransactionId: ID;
  /** This shipment's effect on courier cash (COD − refund) — doc §8.2. */
  cashEffect: number;
}

// ---------------------------------------------------------------------------
// CashDeposits (doc §9)
// ---------------------------------------------------------------------------

export type CashDepositStatus = 'Pending' | 'Confirmed' | 'Rejected';

export interface CashDeposit {
  id: ID;
  hubId: ID;
  amount: number;
  bankAccountCode: string;
  bankReference: string;
  depositedBy: string;
  status: CashDepositStatus;
  financeTransactionId: ID | null;
  depositedAt: ISODateTime;
  confirmedAt: ISODateTime | null;
}

// ---------------------------------------------------------------------------
// Settlements / SettlementLines (doc §10) — "a statement of a party's dues
// for a cycle; collects Transactions, doesn't compute" (doc §10). No
// monetary total is stored redundantly beyond this snapshot.
// ---------------------------------------------------------------------------

export type SettlementPartyType = 'Seller' | 'Courier';
export type SettlementStatus = 'Calculated' | 'Approved' | 'Paid' | 'Failed' | 'Negative' | 'Cancelled';

export interface Settlement {
  id: ID;
  partyType: SettlementPartyType;
  partyId: ID;
  accountId: ID;
  gross: number;
  deductions: number;
  net: number;
  status: SettlementStatus;
  calculatedBy: string;
  approvedBy: string | null;
  createdAt: ISODateTime;
  approvedAt: ISODateTime | null;
}

export interface SettlementLine {
  id: ID;
  settlementId: ID;
  financeTransactionId: ID;
  shipmentId: ID | null;
  lineType: string;
  /** This Transaction's effect on the party's account (Credit − Debit for a Liability) — doc §10.2. */
  amount: number;
}

// ---------------------------------------------------------------------------
// Payouts (doc §12) — an actual payment attempt. Only a successful one
// posts to the Ledger; a failed one is visible without ever touching money.
// ---------------------------------------------------------------------------

export type PayoutMethod = 'BankTransfer' | 'Cash';
export type PayoutStatus = 'Initiated' | 'Paid' | 'Failed' | 'Cancelled';

export interface Payout {
  id: ID;
  settlementId: ID;
  payeeType: SettlementPartyType;
  payeeId: ID;
  amount: number;
  method: PayoutMethod;
  bankReference: string | null;
  status: PayoutStatus;
  failureReason: string | null;
  financeTransactionId: ID | null;
  initiatedAt: ISODateTime;
  confirmedAt: ISODateTime | null;
}

// ---------------------------------------------------------------------------
// Read Models (doc §13) — view shapes returned by `calculations.ts`,
// computed live from the Ledger rather than persisted (see file header).
// ---------------------------------------------------------------------------

export interface ShipmentFinancialSummaryView {
  shipmentId: ID;
  codExpected: number;
  codCollected: number;
  customerRefunded: number;
  sellerFees: number;
  sellerNet: number;
  courierEarning: number;
  companyMargin: number;
  cashReconciled: boolean;
  sellerSettlementId: ID | null;
  courierSettlementId: ID | null;
  payoutStatus: PayoutStatus | null;
}

export interface SellerFinancialSummaryView {
  merchantId: ID;
  postedBalance: number;
  availableBalance: number;
}

export interface CourierFinancialSummaryView {
  courierId: ID;
  cashInCustody: number;
  earningsUnsettled: number;
}

export interface TrialBalanceRow {
  accountId: ID;
  code: string;
  name: string;
  accountType: AccountType;
  normalSide: NormalSide;
  debitTotal: number;
  creditTotal: number;
  balance: number;
}

export interface TrialBalanceView {
  rows: TrialBalanceRow[];
  totalDebitNormal: number;
  totalCreditNormal: number;
  balanced: boolean;
}

// ---------------------------------------------------------------------------
// Table / mutation bookkeeping — mirrors `../domain.ts`'s generic
// infrastructure shapes, parameterized over this ERD's own table list.
// ---------------------------------------------------------------------------

export const LEDGER_TABLE_NAMES = [
  'merchants',
  'couriers',
  'hubs',
  'merchant_pricing_configs',
  'shipments',
  'finance_accounts',
  'finance_transactions',
  'finance_entries',
  'courier_reconciliations',
  'courier_reconciliation_lines',
  'cash_deposits',
  'settlements',
  'settlement_lines',
  'payouts',
  'audit_log',
] as const;

export type LedgerTableName = (typeof LEDGER_TABLE_NAMES)[number];

export type LedgerMutationOp = 'INSERT' | 'UPDATE';

export interface LedgerRecordMutation {
  table: LedgerTableName;
  op: LedgerMutationOp;
  recordId: ID;
  before: Record<string, unknown> | null;
  after: Record<string, unknown>;
}

export interface LedgerActionStep {
  order: number;
  actor: ActorRole;
  title: string;
  description: string;
  mutations: LedgerRecordMutation[];
  events: LedgerDomainEvent[];
}

export type LedgerDomainEventType = 'ShipmentDelivered' | 'TransactionPosted' | 'SettlementCalculated' | 'PayoutAttempted';

export interface LedgerDomainEvent {
  id: ID;
  type: LedgerDomainEventType;
  timestamp: ISODateTime;
  transactionId: ID;
  payload: Record<string, unknown>;
}

export interface LedgerActionExecutionResult {
  success: true;
  transactionId: ID;
  actionId: string;
  actionLabel: string;
  actor: ActorRole;
  actorName: string;
  timestamp: ISODateTime;
  steps: LedgerActionStep[];
  mutations: LedgerRecordMutation[];
  events: LedgerDomainEvent[];
  auditEntries: AuditLogEntry[];
  affectedTables: LedgerTableName[];
  moneyFlows: MoneyFlow[];
  isAssumedRule: boolean;
}

export interface LedgerActionValidationError {
  success: false;
  actionId: string;
  actionLabel: string;
  actor: ActorRole;
  reason: string;
  relatedIds: Record<string, ID>;
  timestamp: ISODateTime;
}

export type LedgerActionOutcome = LedgerActionExecutionResult | LedgerActionValidationError;

export function isLedgerActionSuccess(o: LedgerActionOutcome): o is LedgerActionExecutionResult {
  return o.success;
}
