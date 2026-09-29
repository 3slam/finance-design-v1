import type { ActorRole, TableName } from './domain.js';

export type ActionId =
  | 'deliverShipment'
  | 'processReplacement'
  | 'resolveShipmentException'
  | 'startCourierReconciliation'
  | 'calculateSellerSettlement'
  | 'calculateCourierSettlement'
  | 'createSellerAdjustment'
  | 'createCourierAdjustment'
  | 'executePayout'
  | 'retryPayout'
  | 'recordExpense'
  | 'recordRevenue'
  | 'issueAdvance'
  | 'recordAdvanceMovement'
  | 'recordCapitalTransaction'
  | 'issueCashCustody'
  | 'returnCashCustody';

export type ActionCategory =
  | 'ShipmentLifecycle'
  | 'CourierCashCustody'
  | 'SellerFinance'
  | 'CourierFinance'
  | 'Payout'
  | 'CompanyExpenseRevenue'
  | 'AdvancesAndCapital';

export interface InputFieldOption {
  value: string;
  label: string;
}

export interface InputFieldSchema {
  name: string;
  label: string;
  type: 'select' | 'number' | 'text' | 'date' | 'boolean';
  /** For 'select': static options, or a table to source options from at runtime (e.g. list current shipments). */
  optionsFrom?: TableName;
  options?: InputFieldOption[];
  required: boolean;
  defaultValue?: string | number | boolean;
}

export interface ActionDefinition {
  id: ActionId;
  label: string;
  actor: ActorRole;
  category: ActionCategory;
  description: string;
  preconditions: string;
  affectedTables: TableName[];
  inputs: InputFieldSchema[];
  /** True when part of this action's logic rests on an Open Decision (doc §12) rather than a fully specified rule. */
  isAssumedRule: boolean;
  sourceRef: string;
}

export const ACTION_DEFINITIONS: ActionDefinition[] = [
  {
    id: 'deliverShipment',
    label: 'Deliver Shipment',
    actor: 'Courier',
    category: 'ShipmentLifecycle',
    description: 'Courier completes a COD delivery. Customer pays the full COD amount at the door; the fee/commission are resolved and the shipment outcome is finalized.',
    preconditions: 'Shipment exists, status = Out For Delivery, serviceType = COD.',
    affectedTables: ['shipments', 'shipment_financials', 'audit_log'],
    inputs: [{ name: 'shipmentId', label: 'Shipment', type: 'select', optionsFrom: 'shipments', required: true }],
    isAssumedRule: false,
    sourceRef: '§5, §6.1',
  },
  {
    id: 'processReplacement',
    label: 'Process Replacement',
    actor: 'Courier',
    category: 'ShipmentLifecycle',
    description: 'Courier completes a Replacement-service shipment. Uses the settlement amount/direction already recorded on the shipment; any refund is paid out of COD cash already in hand, not a separate payment.',
    preconditions: 'Shipment exists, status = Out For Delivery, serviceType = Replacement.',
    affectedTables: ['shipments', 'shipment_financials', 'audit_log'],
    inputs: [
      { name: 'shipmentId', label: 'Shipment', type: 'select', optionsFrom: 'shipments', required: true },
      {
        name: 'subOutcome',
        label: 'Replacement Outcome',
        type: 'select',
        required: true,
        options: [
          { value: 'ReplacementCleanSwap', label: 'Clean Swap' },
          { value: 'ReplacementKeepsNew', label: 'Keeps New Items' },
          { value: 'ReplacementTotalRefusal', label: 'Total Refusal' },
        ],
      },
    ],
    isAssumedRule: false,
    sourceRef: '§5, §6.2',
  },
  {
    id: 'resolveShipmentException',
    label: 'Resolve Shipment Exception',
    actor: 'Courier',
    category: 'ShipmentLifecycle',
    description: 'Resolves a shipment as Partial Delivery, Refused/Failed, Cancelled, or Returned. These outcomes are named in the source design, but their exact fee proration / commission-reversal rules are unresolved Open Decisions (§12) — this action applies the smallest reasonable placeholder and flags the result as an assumed rule.',
    preconditions: 'Shipment exists, status = Out For Delivery.',
    affectedTables: ['shipments', 'shipment_financials', 'audit_log'],
    inputs: [
      { name: 'shipmentId', label: 'Shipment', type: 'select', optionsFrom: 'shipments', required: true },
      {
        name: 'outcome',
        label: 'Outcome',
        type: 'select',
        required: true,
        options: [
          { value: 'PartialDelivery', label: 'Partial Delivery' },
          { value: 'RefusedFailed', label: 'Refused / Failed' },
          { value: 'Cancelled', label: 'Cancelled' },
          { value: 'ReturnedShippingPaid', label: 'Returned (shipping already paid)' },
        ],
      },
      { name: 'approvedKeptAmount', label: 'Approved Kept-Items Total (Partial Delivery only)', type: 'number', required: false },
      { name: 'pastNoCostPoint', label: 'Cancelled past no-cost point? (Cancelled only)', type: 'boolean', required: false, defaultValue: true },
    ],
    isAssumedRule: true,
    sourceRef: '§5, §12',
  },
  {
    id: 'startCourierReconciliation',
    label: 'Start Courier Reconciliation',
    actor: 'FinanceOperator',
    category: 'CourierCashCustody',
    description: 'Totals every unclaimed Shipment Financials row for the courier into Expected Cash, compares against Actual Cash counted at handover, and marks those rows as claimed.',
    preconditions: 'Courier has at least one unclaimed Shipment Financials row.',
    affectedTables: ['shipment_financials', 'courier_reconciliations', 'audit_log'],
    inputs: [
      { name: 'courierId', label: 'Courier', type: 'select', optionsFrom: 'couriers', required: true },
      { name: 'actualCash', label: 'Actual Cash Counted', type: 'number', required: true },
    ],
    isAssumedRule: false,
    sourceRef: '§6.3',
  },
  {
    id: 'calculateSellerSettlement',
    label: 'Calculate Seller Settlement',
    actor: 'FinanceOperator',
    category: 'SellerFinance',
    description: 'Groups every unsettled Shipment Financials row and every unclaimed Approved Seller Adjustment for the merchant into one settlement record.',
    preconditions: 'Merchant has at least one unsettled Shipment Financials row or unclaimed Seller Adjustment.',
    affectedTables: ['shipment_financials', 'seller_adjustments', 'seller_settlements', 'audit_log'],
    inputs: [{ name: 'merchantId', label: 'Merchant', type: 'select', optionsFrom: 'merchants', required: true }],
    isAssumedRule: false,
    sourceRef: '§6.4',
  },
  {
    id: 'calculateCourierSettlement',
    label: 'Calculate Courier Settlement',
    actor: 'FinanceOperator',
    category: 'CourierFinance',
    description: 'Groups every unsettled Shipment Financials row and every unclaimed Courier Adjustment for the courier into one settlement record.',
    preconditions: 'Courier has at least one unsettled Shipment Financials row or unclaimed Courier Adjustment.',
    affectedTables: ['shipment_financials', 'courier_adjustments', 'courier_settlements', 'audit_log'],
    inputs: [{ name: 'courierId', label: 'Courier', type: 'select', optionsFrom: 'couriers', required: true }],
    isAssumedRule: false,
    sourceRef: '§6.5',
  },
  {
    id: 'createSellerAdjustment',
    label: 'Create Seller Adjustment',
    actor: 'FinanceOperator',
    category: 'SellerFinance',
    description: "Records a later compensation, claim, or credit/deduction for a merchant. Never reopens a past settlement or changes a shipment's original COD/refund — only picked up by the next settlement cycle.",
    preconditions: 'Merchant exists; Shipment, if given, exists.',
    affectedTables: ['seller_adjustments', 'audit_log'],
    inputs: [
      { name: 'merchantId', label: 'Merchant', type: 'select', optionsFrom: 'merchants', required: true },
      { name: 'shipmentId', label: 'Related Shipment (optional)', type: 'select', optionsFrom: 'shipments', required: false },
      {
        name: 'type',
        label: 'Type',
        type: 'select',
        required: true,
        options: [
          { value: 'Compensation', label: 'Compensation' },
          { value: 'Claim', label: 'Claim' },
          { value: 'Credit', label: 'Credit' },
          { value: 'Deduction', label: 'Deduction' },
        ],
      },
      { name: 'amount', label: 'Amount', type: 'number', required: true },
      { name: 'reason', label: 'Reason', type: 'text', required: true },
    ],
    isAssumedRule: false,
    sourceRef: '§4, §6.6',
  },
  {
    id: 'createCourierAdjustment',
    label: 'Create Courier Adjustment',
    actor: 'FinanceOperator',
    category: 'CourierFinance',
    description: 'Records a bonus, penalty, or correction for a courier — proposed new record giving couriers the same compensation mechanism sellers already have.',
    preconditions: 'Courier exists; Shipment, if given, exists.',
    affectedTables: ['courier_adjustments', 'audit_log'],
    inputs: [
      { name: 'courierId', label: 'Courier', type: 'select', optionsFrom: 'couriers', required: true },
      { name: 'shipmentId', label: 'Related Shipment (optional)', type: 'select', optionsFrom: 'shipments', required: false },
      {
        name: 'type',
        label: 'Type',
        type: 'select',
        required: true,
        options: [
          { value: 'Bonus', label: 'Bonus' },
          { value: 'Penalty', label: 'Penalty' },
          { value: 'Correction', label: 'Correction' },
        ],
      },
      { name: 'amount', label: 'Amount', type: 'number', required: true },
      { name: 'reason', label: 'Reason', type: 'text', required: true },
    ],
    isAssumedRule: false,
    sourceRef: '§4, §12 (proposed new record)',
  },
  {
    id: 'executePayout',
    label: 'Execute Payout',
    actor: 'FinanceOperator',
    category: 'Payout',
    description: 'Attempts to actually send the money for a Calculated settlement. Tracked as its own record so a failed transfer is visible separately from the settlement calculation.',
    preconditions: 'Settlement exists and is not already fully Paid.',
    affectedTables: ['payouts', 'seller_settlements', 'courier_settlements', 'audit_log'],
    inputs: [
      {
        name: 'party',
        label: 'Party',
        type: 'select',
        required: true,
        options: [
          { value: 'Seller', label: 'Seller' },
          { value: 'Courier', label: 'Courier' },
        ],
      },
      { name: 'settlementId', label: 'Settlement', type: 'select', required: true },
      { name: 'simulateFailure', label: 'Simulate Failure', type: 'boolean', required: false, defaultValue: false },
    ],
    isAssumedRule: false,
    sourceRef: '§6.7',
  },
  {
    id: 'retryPayout',
    label: 'Retry Payout',
    actor: 'FinanceOperator',
    category: 'Payout',
    description: 'Retries a previously Failed payout for the same settlement.',
    preconditions: 'Settlement has a Failed payout attempt as its latest attempt.',
    affectedTables: ['payouts', 'seller_settlements', 'courier_settlements', 'audit_log'],
    inputs: [
      {
        name: 'party',
        label: 'Party',
        type: 'select',
        required: true,
        options: [
          { value: 'Seller', label: 'Seller' },
          { value: 'Courier', label: 'Courier' },
        ],
      },
      { name: 'settlementId', label: 'Settlement', type: 'select', required: true },
      { name: 'simulateFailure', label: 'Simulate Failure', type: 'boolean', required: false, defaultValue: false },
    ],
    isAssumedRule: false,
    sourceRef: '§6.7',
  },
  {
    id: 'recordExpense',
    label: 'Record Expense',
    actor: 'FinanceOperator',
    category: 'CompanyExpenseRevenue',
    description: 'Records one operating cost (salary, rent, utilities, fuel, maintenance, customer compensation, pickup commission, or other) with its attribution and payment status.',
    preconditions: 'None beyond a valid amount and type.',
    affectedTables: ['expense_transactions', 'audit_log'],
    inputs: [
      {
        name: 'type',
        label: 'Type',
        type: 'select',
        required: true,
        options: [
          { value: 'Salary', label: 'Salary' },
          { value: 'Rent', label: 'Rent' },
          { value: 'Utilities', label: 'Utilities' },
          { value: 'Fuel', label: 'Fuel' },
          { value: 'VehicleMaintenance', label: 'Vehicle Maintenance' },
          { value: 'CustomerCompensation', label: 'Customer Compensation' },
          { value: 'PickupCommission', label: 'Pickup Commission' },
          { value: 'OtherExpense', label: 'Other Expense' },
        ],
      },
      {
        name: 'attributedToType',
        label: 'Attributed To',
        type: 'select',
        required: true,
        options: [
          { value: 'Employee', label: 'Employee' },
          { value: 'Hub', label: 'Hub' },
          { value: 'Courier', label: 'Courier' },
          { value: 'Shipment', label: 'Shipment' },
          { value: 'General', label: 'General' },
        ],
      },
      { name: 'attributedToId', label: 'Attributed To — record', type: 'text', required: false },
      { name: 'amount', label: 'Amount', type: 'number', required: true },
      {
        name: 'paidBy',
        label: 'Paid By',
        type: 'select',
        required: true,
        options: [
          { value: 'Company', label: 'Company (paid directly)' },
          { value: 'CourierReimbursable', label: 'Courier fronted it — reimbursable' },
        ],
      },
      { name: 'description', label: 'Description', type: 'text', required: false },
    ],
    isAssumedRule: false,
    sourceRef: '§8, §9.1',
  },
  {
    id: 'recordRevenue',
    label: 'Record Other Revenue',
    actor: 'FinanceOperator',
    category: 'CompanyExpenseRevenue',
    description: 'Records one-off income not tied to any shipment.',
    preconditions: 'None beyond a valid amount.',
    affectedTables: ['revenue_transactions', 'audit_log'],
    inputs: [
      { name: 'amount', label: 'Amount', type: 'number', required: true },
      { name: 'notes', label: 'Notes', type: 'text', required: false },
    ],
    isAssumedRule: false,
    sourceRef: '§8, §9.2',
  },
  {
    id: 'issueAdvance',
    label: 'Issue Advance',
    actor: 'FinanceOperator',
    category: 'AdvancesAndCapital',
    description: 'Issues money to a courier or employee who must pay it back.',
    preconditions: 'None beyond a valid amount.',
    affectedTables: ['advances', 'advance_movements', 'audit_log'],
    inputs: [
      {
        name: 'partyType',
        label: 'Party Type',
        type: 'select',
        required: true,
        options: [
          { value: 'Courier', label: 'Courier' },
          { value: 'Employee', label: 'Employee' },
        ],
      },
      { name: 'partyId', label: 'Party (id or name)', type: 'text', required: true },
      { name: 'amount', label: 'Amount', type: 'number', required: true },
    ],
    isAssumedRule: false,
    sourceRef: '§10',
  },
  {
    id: 'recordAdvanceMovement',
    label: 'Record Advance Movement',
    actor: 'FinanceOperator',
    category: 'AdvancesAndCapital',
    description: 'Records a deduction or repayment against an existing Advance, reducing its outstanding amount.',
    preconditions: 'Advance exists and is Open.',
    affectedTables: ['advance_movements', 'advances', 'audit_log'],
    inputs: [
      { name: 'advanceId', label: 'Advance', type: 'select', optionsFrom: 'advances', required: true },
      {
        name: 'movementType',
        label: 'Movement Type',
        type: 'select',
        required: true,
        options: [
          { value: 'Deduction', label: 'Deduction' },
          { value: 'Repayment', label: 'Repayment' },
        ],
      },
      { name: 'amount', label: 'Amount', type: 'number', required: true },
    ],
    isAssumedRule: false,
    sourceRef: '§10',
  },
  {
    id: 'recordCapitalTransaction',
    label: 'Record Capital Transaction',
    actor: 'FinanceOperator',
    category: 'AdvancesAndCapital',
    description: 'Records an owner contribution or a profit distribution.',
    preconditions: 'None beyond a valid amount.',
    affectedTables: ['capital_transactions', 'audit_log'],
    inputs: [
      {
        name: 'type',
        label: 'Type',
        type: 'select',
        required: true,
        options: [
          { value: 'OwnerContribution', label: 'Owner Contribution' },
          { value: 'ProfitDistribution', label: 'Profit Distribution' },
        ],
      },
      { name: 'amount', label: 'Amount', type: 'number', required: true },
    ],
    isAssumedRule: false,
    sourceRef: '§10',
  },
  {
    id: 'issueCashCustody',
    label: 'Issue Cash Custody',
    actor: 'FinanceOperator',
    category: 'AdvancesAndCapital',
    description: 'Issues cash to someone for a purpose unrelated to shipments.',
    preconditions: 'None beyond a valid amount.',
    affectedTables: ['cash_custodies', 'audit_log'],
    inputs: [
      { name: 'holderId', label: 'Holder (id or name)', type: 'text', required: true },
      { name: 'purpose', label: 'Purpose', type: 'text', required: true },
      { name: 'amount', label: 'Amount Issued', type: 'number', required: true },
    ],
    isAssumedRule: false,
    sourceRef: '§10',
  },
  {
    id: 'returnCashCustody',
    label: 'Return Cash Custody',
    actor: 'FinanceOperator',
    category: 'AdvancesAndCapital',
    description: 'Records the amount returned against an open Cash Custody. A shortfall creates a Custody Debt.',
    preconditions: 'Cash Custody exists and is Open.',
    affectedTables: ['cash_custodies', 'custody_debts', 'audit_log'],
    inputs: [
      { name: 'custodyId', label: 'Cash Custody', type: 'select', optionsFrom: 'cash_custodies', required: true },
      { name: 'returnedAmount', label: 'Amount Returned', type: 'number', required: true },
    ],
    isAssumedRule: false,
    sourceRef: '§10',
  },
];

export function getActionDefinition(id: ActionId): ActionDefinition {
  const def = ACTION_DEFINITIONS.find((a) => a.id === id);
  if (!def) throw new Error(`Unknown action: ${id}`);
  return def;
}
