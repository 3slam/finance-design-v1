/**
 * Domain model for the PantherExpress Level 2 Finance design.
 *
 * Every type here is traceable to a section of the source document
 * ("Level 2 Finance Design — PantherExpress"). Where a field or entity
 * had to be invented to make the simulation runnable (e.g. concrete fee
 * amounts, an actor role for who runs reconciliation), it is marked
 * `ASSUMPTION` in a comment and listed in the README's Assumptions
 * section — nothing here is a silent invention.
 */

export type ID = string;
export type ISODateTime = string;

// ---------------------------------------------------------------------------
// Actors (doc §2, §4, §6, §9 — Courier, Merchant/Seller, and an implicit
// company-side operator who runs reconciliation/settlement/payout/expense
// recording; the document never names that role, so "FinanceOperator" is an
// ASSUMPTION — the smallest reasonable stand-in for "the company/Accounting").
// ---------------------------------------------------------------------------

export type ActorRole = 'Merchant' | 'Courier' | 'FinanceOperator' | 'System';

export interface Actor {
  id: ID;
  role: ActorRole;
  name: string;
  /** Links back to the Merchant/Courier record when the actor is a specific one. */
  refId?: ID;
}

// ---------------------------------------------------------------------------
// Reference entities that already exist operationally in PantherExpress
// (doc §2) and that shipments/expenses point to.
// ---------------------------------------------------------------------------

export interface Hub {
  id: ID;
  name: string;
}

export interface Merchant {
  id: ID;
  name: string;
}

export interface Courier {
  id: ID;
  name: string;
  hubId: ID;
}

/**
 * ASSUMPTION: the doc says the seller fee is "resolved from Merchant Pricing
 * Configuration" but states the resolved amount is "not yet captured" (§2).
 * This table supplies concrete, deterministic numbers so the simulation can
 * run. The values are exactly the figures used in the doc's own worked
 * example (§6): 60/45 for a standard COD delivery, 50/35 for an exchange.
 * Refusal/cancellation/return figures are the smallest reasonable numbers
 * consistent with §5's fee *names* (no worked numbers exist for those in the
 * doc, so they are flagged with `isAssumedRule: true` wherever used).
 */
export interface MerchantPricingConfig {
  merchantId: ID;
  codDeliveryFee: number;
  codDeliveryCommission: number;
  exchangeFee: number;
  exchangeCommission: number;
  refusalFee: number;
  cancellationFee: number;
  returnFee: number;
  returnCommission: number;
}

// ---------------------------------------------------------------------------
// Shipment (doc §2, §5, §7 — "Operational record (existing)")
// ---------------------------------------------------------------------------

export type ShipmentServiceType = 'COD' | 'Replacement';

export type ShipmentStatus =
  | 'OutForDelivery'
  | 'Delivered'
  | 'PartiallyDelivered'
  | 'Replaced'
  | 'RefusedFailed'
  | 'Cancelled'
  | 'Returned';

export type SettlementDirection = 'Collect' | 'Refund' | 'NoCash';

export interface Shipment {
  id: ID;
  waybill: string;
  merchantId: ID;
  courierId: ID;
  hubId: ID;
  serviceType: ShipmentServiceType;
  status: ShipmentStatus;
  /** Shipment.CodAmount */
  codAmount: number;
  /** Shipment.CollectedAmount — set once, at final outcome, never changed after (doc §1) */
  collectedAmount: number;
  /** Shipment.RefundAmount — set once, at final outcome, never changed after (doc §1) */
  refundAmount: number;
  /** Shipment.SettlementAmount (Replacement outcomes only) */
  settlementAmount: number;
  /** Shipment.SettlementDirection (Replacement outcomes only) */
  settlementDirection: SettlementDirection | null;
  deliveredAt: ISODateTime | null;
  /** Points at the one ShipmentFinancials row once the outcome is resolved (doc §7). */
  financialsId: ID | null;
}

// ---------------------------------------------------------------------------
// Shipment Financials (doc §4, §7 — new)
// ---------------------------------------------------------------------------

/**
 * The eight outcomes named in doc §5. Success Delivery and the Replacement
 * sub-cases are fully specified by the worked example (§6). Partial
 * Delivery, Refused/Failed, Cancelled and Returned are named and given a fee
 * *source* in §5 but their exact proration / reversal-by-reason rules are
 * listed as Open Decisions in §12 — those outcomes are still implemented
 * (the doc clearly wants the full lifecycle represented, §2), but every
 * ShipmentFinancials row they produce carries `isAssumedRule: true`.
 */
export type ShipmentOutcome =
  | 'SuccessDelivery'
  | 'PartialDelivery'
  | 'ReplacementCleanSwap'
  | 'ReplacementKeepsNew'
  | 'ReplacementTotalRefusal'
  | 'RefusedFailed'
  | 'Cancelled'
  | 'ReturnedShippingPaid';

export interface ShipmentFinancials {
  id: ID;
  shipmentId: ID;
  sellerFee: number;
  courierEarning: number;
  outcome: ShipmentOutcome;
  finalizedAt: ISODateTime;
  courierReconciliationId: ID | null;
  sellerSettlementId: ID | null;
  courierSettlementId: ID | null;
  /** True when the fee/commission figure came from an Open Decision (§12) placeholder, not a worked-example number. */
  isAssumedRule: boolean;
}

// ---------------------------------------------------------------------------
// Courier Reconciliation (doc §4, §6.3, §7)
// ---------------------------------------------------------------------------

/**
 * §6.3 leaves the "Short" disposition open ("needs a decision"), and §12
 * lists "Cash-shortage disposition: write off vs. charge the courier vs.
 * installment recovery" as an unresolved Open Decision. So this simulation
 * stops at "Short — Needs Decision" and deliberately does NOT auto-resolve
 * it, rather than inventing a resolution mechanism the source doesn't define.
 */
export type ReconciliationStatus = 'MatchedClosed' | 'ShortNeedsDecision';

export interface CourierReconciliation {
  id: ID;
  courierId: ID;
  hubId: ID;
  businessDate: ISODateTime;
  expectedCash: number;
  actualCash: number;
  variance: number;
  status: ReconciliationStatus;
  claimedShipmentFinancialsIds: ID[];
  createdAt: ISODateTime;
}

// ---------------------------------------------------------------------------
// Seller Settlement / Courier Settlement (doc §4, §6.4, §6.5, §7)
// ---------------------------------------------------------------------------

export type SettlementStatus = 'Calculated' | 'Paid' | 'PartiallyPaid' | 'PaymentFailed';

export interface SellerSettlement {
  id: ID;
  merchantId: ID;
  periodStart: ISODateTime;
  periodEnd: ISODateTime;
  shipmentNet: number;
  adjustmentsNet: number;
  totalNet: number;
  status: SettlementStatus;
  claimedShipmentFinancialsIds: ID[];
  claimedSellerAdjustmentIds: ID[];
  createdAt: ISODateTime;
}

export interface CourierSettlement {
  id: ID;
  courierId: ID;
  periodStart: ISODateTime;
  periodEnd: ISODateTime;
  earningTotal: number;
  adjustmentTotal: number;
  totalNet: number;
  status: SettlementStatus;
  claimedShipmentFinancialsIds: ID[];
  claimedCourierAdjustmentIds: ID[];
  createdAt: ISODateTime;
}

// ---------------------------------------------------------------------------
// Adjustments (doc §4, §6.6, §7 — Seller Adjustment exists in the source
// design; Courier Adjustment is explicitly proposed/new, "needs review", §12)
// ---------------------------------------------------------------------------

export type SellerAdjustmentType = 'Compensation' | 'Claim' | 'Credit' | 'Deduction';
export type CourierAdjustmentType = 'Bonus' | 'Penalty' | 'Correction';
/** Doc §6.6 only ever shows adjustments in state "Approved" at creation time — there is no
 * separate pending-approval workflow in the source, so this is a single-value status kept
 * as a type (rather than a plain literal) so a future approval workflow can extend it. */
export type AdjustmentStatus = 'Approved';

export interface SellerAdjustment {
  id: ID;
  merchantId: ID;
  shipmentId: ID | null;
  type: SellerAdjustmentType;
  /** Always a positive magnitude; whether it adds or subtracts from settlement totals is derived from `type` (Compensation/Credit add, Claim/Deduction subtract). */
  amount: number;
  status: AdjustmentStatus;
  sellerSettlementId: ID | null;
  createdAt: ISODateTime;
  reason: string;
}

export interface CourierAdjustment {
  id: ID;
  courierId: ID;
  shipmentId: ID | null;
  type: CourierAdjustmentType;
  /** Always a positive magnitude; sign is derived from `type` (Bonus/Correction add, Penalty subtracts). */
  amount: number;
  status: AdjustmentStatus;
  courierSettlementId: ID | null;
  createdAt: ISODateTime;
  reason: string;
}

// ---------------------------------------------------------------------------
// Payout (doc §4, §6.7, §7)
// ---------------------------------------------------------------------------

export type PayoutParty = 'Seller' | 'Courier';
export type PayoutStatus = 'Paid' | 'Failed';

export interface Payout {
  id: ID;
  party: PayoutParty;
  partyId: ID;
  settlementId: ID;
  amount: number;
  status: PayoutStatus;
  attemptNumber: number;
  createdAt: ISODateTime;
  failureReason?: string;
}

// ---------------------------------------------------------------------------
// Company Expenses & Revenue (doc §8, §9, §10)
// ---------------------------------------------------------------------------

export type ExpenseType =
  | 'Salary'
  | 'Rent'
  | 'Utilities'
  | 'Fuel'
  | 'VehicleMaintenance'
  | 'CustomerCompensation'
  | 'PickupCommission'
  | 'OtherExpense';

export type ExpenseAttributionType = 'Employee' | 'Hub' | 'Courier' | 'Vehicle' | 'Shipment' | 'General';

export type ExpensePaidBy = 'Company' | 'CourierReimbursable';

export type ReimbursementStatus = 'NotApplicable' | 'Owed' | 'Reimbursed';

export interface ExpenseTransaction {
  id: ID;
  type: ExpenseType;
  attributedToType: ExpenseAttributionType;
  attributedToId: ID | null;
  amount: number;
  paidBy: ExpensePaidBy;
  reimbursementStatus: ReimbursementStatus;
  /** Doc §8: "Other Expense" requires a mandatory description; kept optional for other types. */
  description: string | null;
  date: ISODateTime;
  createdAt: ISODateTime;
}

export type RevenueType = 'OtherRevenue';
export type ReceivedStatus = 'Received' | 'PendingReceipt';

export interface RevenueTransaction {
  id: ID;
  type: RevenueType;
  amount: number;
  receivedStatus: ReceivedStatus;
  notes: string | null;
  date: ISODateTime;
  createdAt: ISODateTime;
}

// ---------------------------------------------------------------------------
// Advances, Capital, Cash Custody (doc §10 — named "Harder" in §11, no
// worked numeric example exists; implemented directly from the §10 entity
// reference table without adding any numbers or rules beyond it).
// ---------------------------------------------------------------------------

export type AdvancePartyType = 'Courier' | 'Employee';
export type AdvanceStatus = 'Open' | 'Settled';

export interface Advance {
  id: ID;
  partyType: AdvancePartyType;
  partyId: ID;
  originalAmount: number;
  outstandingAmount: number;
  status: AdvanceStatus;
  createdAt: ISODateTime;
}

export type AdvanceMovementType = 'Issue' | 'Deduction' | 'Repayment';

export interface AdvanceMovement {
  id: ID;
  advanceId: ID;
  movementType: AdvanceMovementType;
  amount: number;
  date: ISODateTime;
}

export type CapitalTransactionType = 'OwnerContribution' | 'ProfitDistribution';

export interface CapitalTransaction {
  id: ID;
  type: CapitalTransactionType;
  amount: number;
  date: ISODateTime;
  createdAt: ISODateTime;
}

export type CustodyStatus = 'Open' | 'Returned' | 'ShortReturned';

export interface CashCustody {
  id: ID;
  holderId: ID;
  purpose: string;
  issuedAmount: number;
  returnedAmount: number;
  outstandingAmount: number;
  status: CustodyStatus;
  createdAt: ISODateTime;
}

export type CustodyDebtSource = 'CashCustody' | 'CourierReconciliation';

export interface CustodyDebt {
  id: ID;
  partyId: ID;
  source: CustodyDebtSource;
  sourceId: ID;
  originalAmount: number;
  settledAmount: number;
  outstandingAmount: number;
  createdAt: ISODateTime;
}

// ---------------------------------------------------------------------------
// Cross-cutting: audit log & domain events (required by the demo — doc §6/§19
// asks for an audit trail; this is infrastructure for that requirement, not
// a new business rule).
// ---------------------------------------------------------------------------

export interface AuditLogEntry {
  id: ID;
  timestamp: ISODateTime;
  transactionId: ID;
  actor: ActorRole;
  actorName: string;
  actionId: string;
  actionLabel: string;
  message: string;
  relatedIds: Record<string, ID>;
}

export type DomainEventType =
  | 'ShipmentDelivered'
  | 'ShipmentFinancialsCreated'
  | 'CourierReconciliationOpened'
  | 'SellerSettlementCalculated'
  | 'CourierSettlementCalculated'
  | 'SellerAdjustmentCreated'
  | 'CourierAdjustmentCreated'
  | 'PayoutAttempted'
  | 'ExpenseRecorded'
  | 'RevenueRecorded'
  | 'AdvanceIssued'
  | 'AdvanceMovementRecorded'
  | 'CashCustodyIssued'
  | 'CashCustodyReturned'
  | 'CustodyDebtCreated'
  | 'CapitalTransactionRecorded';

export interface DomainEvent {
  id: ID;
  type: DomainEventType;
  timestamp: ISODateTime;
  transactionId: ID;
  payload: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Table / mutation bookkeeping (drives the ERD highlight + before/after UI)
// ---------------------------------------------------------------------------

export const TABLE_NAMES = [
  'merchants',
  'couriers',
  'hubs',
  'merchant_pricing_configs',
  'shipments',
  'shipment_financials',
  'courier_reconciliations',
  'seller_settlements',
  'courier_settlements',
  'seller_adjustments',
  'courier_adjustments',
  'payouts',
  'expense_transactions',
  'revenue_transactions',
  'advances',
  'advance_movements',
  'capital_transactions',
  'cash_custodies',
  'custody_debts',
  'audit_log',
] as const;

export type TableName = (typeof TABLE_NAMES)[number];

export type MutationOp = 'INSERT' | 'UPDATE';

export interface RecordMutation {
  table: TableName;
  op: MutationOp;
  recordId: ID;
  before: Record<string, unknown> | null;
  after: Record<string, unknown>;
}

export interface ActionStep {
  order: number;
  actor: ActorRole;
  title: string;
  description: string;
  mutations: RecordMutation[];
  events: DomainEvent[];
}

export type MoneyFlowKind =
  | 'CODCollection'
  | 'RefundPayout'
  | 'FeeRecognition'
  | 'CommissionRecognition'
  | 'CashHandover'
  | 'SettlementPayout'
  | 'ExpensePayment'
  | 'RevenueReceipt'
  | 'AdvanceIssuance'
  | 'AdvanceRepayment'
  | 'CustodyIssuance'
  | 'CustodyReturn'
  | 'Compensation'
  | 'CapitalContribution'
  | 'ProfitDistribution';

export interface MoneyFlowParty {
  type: ActorRole | 'Customer' | 'CompanyAccount' | 'Vendor' | 'Employee';
  id: ID | null;
  label: string;
}

export interface MoneyFlow {
  id: ID;
  kind: MoneyFlowKind;
  amount: number;
  currency: 'EGP';
  from: MoneyFlowParty;
  to: MoneyFlowParty;
  status: 'Completed' | 'Failed';
}

export interface ActionExecutionResult {
  success: true;
  transactionId: ID;
  actionId: string;
  actionLabel: string;
  actor: ActorRole;
  actorName: string;
  timestamp: ISODateTime;
  steps: ActionStep[];
  mutations: RecordMutation[];
  events: DomainEvent[];
  auditEntries: AuditLogEntry[];
  affectedTables: TableName[];
  moneyFlows: MoneyFlow[];
  isAssumedRule: boolean;
}

export interface ActionValidationError {
  success: false;
  actionId: string;
  actionLabel: string;
  actor: ActorRole;
  reason: string;
  relatedIds: Record<string, ID>;
  timestamp: ISODateTime;
}

export type ActionOutcome = ActionExecutionResult | ActionValidationError;

export function isActionSuccess(o: ActionOutcome): o is ActionExecutionResult {
  return o.success;
}
