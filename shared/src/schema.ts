import type { TableName } from './domain.js';

/**
 * Static ERD metadata. This is the single source the UI reads to draw the
 * database diagram (table cards, PK/FK badges, relationship lines) — the
 * canvas has no per-table hard-coded layout, it just renders this list.
 *
 * Column names mirror the domain.ts interfaces field-for-field.
 */

export interface ColumnSchema {
  name: string;
  type: 'id' | 'string' | 'number' | 'boolean' | 'datetime' | 'enum';
  pk?: boolean;
  fk?: { table: TableName; label: string };
  nullable?: boolean;
}

export interface TableSchema {
  table: TableName;
  label: string;
  /** One-line description of what the table answers, taken from doc §4/§7/§10. */
  purpose: string;
  columns: ColumnSchema[];
  /** Which document section this table traces back to. */
  source: string;
  isNew: boolean;
}

export const TABLE_SCHEMAS: TableSchema[] = [
  {
    table: 'merchants',
    label: 'Merchants',
    purpose: 'Seller reference record.',
    source: 'Existing',
    isNew: false,
    columns: [
      { name: 'id', type: 'id', pk: true },
      { name: 'name', type: 'string' },
    ],
  },
  {
    table: 'couriers',
    label: 'Couriers',
    purpose: 'Courier reference record.',
    source: 'Existing',
    isNew: false,
    columns: [
      { name: 'id', type: 'id', pk: true },
      { name: 'name', type: 'string' },
      { name: 'hubId', type: 'id', fk: { table: 'hubs', label: 'Hub' } },
    ],
  },
  {
    table: 'hubs',
    label: 'Hubs',
    purpose: 'Hub / branch reference record.',
    source: 'Existing',
    isNew: false,
    columns: [
      { name: 'id', type: 'id', pk: true },
      { name: 'name', type: 'string' },
    ],
  },
  {
    table: 'merchant_pricing_configs',
    label: 'Merchant Pricing Configs',
    purpose: "Resolved fee/commission rates per merchant (ASSUMPTION — doc §2 says the rate exists but the resolved amount isn't captured yet).",
    source: '§2 (assumption)',
    isNew: true,
    columns: [
      { name: 'merchantId', type: 'id', pk: true, fk: { table: 'merchants', label: 'Merchant' } },
      { name: 'codDeliveryFee', type: 'number' },
      { name: 'codDeliveryCommission', type: 'number' },
      { name: 'exchangeFee', type: 'number' },
      { name: 'exchangeCommission', type: 'number' },
      { name: 'refusalFee', type: 'number' },
      { name: 'cancellationFee', type: 'number' },
      { name: 'returnFee', type: 'number' },
      { name: 'returnCommission', type: 'number' },
    ],
  },
  {
    table: 'shipments',
    label: 'Shipments',
    purpose: 'Operational record — status, custody, COD/refund/settlement amounts.',
    source: '§2, §5, §7 (existing)',
    isNew: false,
    columns: [
      { name: 'id', type: 'id', pk: true },
      { name: 'waybill', type: 'string' },
      { name: 'merchantId', type: 'id', fk: { table: 'merchants', label: 'Merchant' } },
      { name: 'courierId', type: 'id', fk: { table: 'couriers', label: 'Courier' } },
      { name: 'hubId', type: 'id', fk: { table: 'hubs', label: 'Hub' } },
      { name: 'serviceType', type: 'enum' },
      { name: 'status', type: 'enum' },
      { name: 'codAmount', type: 'number' },
      { name: 'collectedAmount', type: 'number' },
      { name: 'refundAmount', type: 'number' },
      { name: 'settlementAmount', type: 'number' },
      { name: 'settlementDirection', type: 'enum', nullable: true },
      { name: 'deliveredAt', type: 'datetime', nullable: true },
      { name: 'financialsId', type: 'id', fk: { table: 'shipment_financials', label: 'Financials' }, nullable: true },
    ],
  },
  {
    table: 'shipment_financials',
    label: 'Shipment Financials',
    purpose: "This shipment's resolved fee, courier earning, and which reconciliation/settlements claimed it.",
    source: '§4, §7 (new)',
    isNew: true,
    columns: [
      { name: 'id', type: 'id', pk: true },
      { name: 'shipmentId', type: 'id', fk: { table: 'shipments', label: 'Shipment' } },
      { name: 'sellerFee', type: 'number' },
      { name: 'courierEarning', type: 'number' },
      { name: 'outcome', type: 'enum' },
      { name: 'finalizedAt', type: 'datetime' },
      { name: 'courierReconciliationId', type: 'id', fk: { table: 'courier_reconciliations', label: 'Reconciliation' }, nullable: true },
      { name: 'sellerSettlementId', type: 'id', fk: { table: 'seller_settlements', label: 'Seller Settlement' }, nullable: true },
      { name: 'courierSettlementId', type: 'id', fk: { table: 'courier_settlements', label: 'Courier Settlement' }, nullable: true },
      { name: 'isAssumedRule', type: 'boolean' },
    ],
  },
  {
    table: 'courier_reconciliations',
    label: 'Courier Reconciliations',
    purpose: 'Cash a courier owes the hub for a business date — expected vs. actual.',
    source: '§4, §6.3, §7 (new)',
    isNew: true,
    columns: [
      { name: 'id', type: 'id', pk: true },
      { name: 'courierId', type: 'id', fk: { table: 'couriers', label: 'Courier' } },
      { name: 'hubId', type: 'id', fk: { table: 'hubs', label: 'Hub' } },
      { name: 'businessDate', type: 'datetime' },
      { name: 'expectedCash', type: 'number' },
      { name: 'actualCash', type: 'number' },
      { name: 'variance', type: 'number' },
      { name: 'status', type: 'enum' },
      { name: 'claimedShipmentFinancialsIds', type: 'string' },
      { name: 'createdAt', type: 'datetime' },
    ],
  },
  {
    table: 'seller_settlements',
    label: 'Seller Settlements',
    purpose: 'What is owed to, or by, a merchant for a settlement period.',
    source: '§4, §6.4, §7 (new)',
    isNew: true,
    columns: [
      { name: 'id', type: 'id', pk: true },
      { name: 'merchantId', type: 'id', fk: { table: 'merchants', label: 'Merchant' } },
      { name: 'periodStart', type: 'datetime' },
      { name: 'periodEnd', type: 'datetime' },
      { name: 'shipmentNet', type: 'number' },
      { name: 'adjustmentsNet', type: 'number' },
      { name: 'totalNet', type: 'number' },
      { name: 'status', type: 'enum' },
      { name: 'createdAt', type: 'datetime' },
    ],
  },
  {
    table: 'courier_settlements',
    label: 'Courier Settlements',
    purpose: 'What a courier has earned for a settlement period.',
    source: '§4, §6.5, §7 (new)',
    isNew: true,
    columns: [
      { name: 'id', type: 'id', pk: true },
      { name: 'courierId', type: 'id', fk: { table: 'couriers', label: 'Courier' } },
      { name: 'periodStart', type: 'datetime' },
      { name: 'periodEnd', type: 'datetime' },
      { name: 'earningTotal', type: 'number' },
      { name: 'adjustmentTotal', type: 'number' },
      { name: 'totalNet', type: 'number' },
      { name: 'status', type: 'enum' },
      { name: 'createdAt', type: 'datetime' },
    ],
  },
  {
    table: 'seller_adjustments',
    label: 'Seller Adjustments',
    purpose: "A later compensation/claim/credit against the shipment's base outcome.",
    source: '§4, §6.6, §7 (existing concept)',
    isNew: false,
    columns: [
      { name: 'id', type: 'id', pk: true },
      { name: 'merchantId', type: 'id', fk: { table: 'merchants', label: 'Merchant' } },
      { name: 'shipmentId', type: 'id', fk: { table: 'shipments', label: 'Shipment' }, nullable: true },
      { name: 'type', type: 'enum' },
      { name: 'amount', type: 'number' },
      { name: 'status', type: 'enum' },
      { name: 'sellerSettlementId', type: 'id', fk: { table: 'seller_settlements', label: 'Seller Settlement' }, nullable: true },
      { name: 'createdAt', type: 'datetime' },
    ],
  },
  {
    table: 'courier_adjustments',
    label: 'Courier Adjustments',
    purpose: 'A bonus, penalty, or correction for a courier (proposed new record, doc §4/§12).',
    source: '§4, §12 (new, proposed)',
    isNew: true,
    columns: [
      { name: 'id', type: 'id', pk: true },
      { name: 'courierId', type: 'id', fk: { table: 'couriers', label: 'Courier' } },
      { name: 'shipmentId', type: 'id', fk: { table: 'shipments', label: 'Shipment' }, nullable: true },
      { name: 'type', type: 'enum' },
      { name: 'amount', type: 'number' },
      { name: 'status', type: 'enum' },
      { name: 'courierSettlementId', type: 'id', fk: { table: 'courier_settlements', label: 'Courier Settlement' }, nullable: true },
      { name: 'createdAt', type: 'datetime' },
    ],
  },
  {
    table: 'payouts',
    label: 'Payouts',
    purpose: 'An actual payment attempt discharging a settlement.',
    source: '§4, §6.7, §7 (new)',
    isNew: true,
    columns: [
      { name: 'id', type: 'id', pk: true },
      { name: 'party', type: 'enum' },
      { name: 'partyId', type: 'id' },
      { name: 'settlementId', type: 'id' },
      { name: 'amount', type: 'number' },
      { name: 'status', type: 'enum' },
      { name: 'attemptNumber', type: 'number' },
      { name: 'createdAt', type: 'datetime' },
    ],
  },
  {
    table: 'expense_transactions',
    label: 'Expense Transactions',
    purpose: 'One operating cost, attributed to whoever/whatever caused it.',
    source: '§8, §9.1, §10 (new)',
    isNew: true,
    columns: [
      { name: 'id', type: 'id', pk: true },
      { name: 'type', type: 'enum' },
      { name: 'attributedToType', type: 'enum' },
      { name: 'attributedToId', type: 'id', nullable: true },
      { name: 'amount', type: 'number' },
      { name: 'paidBy', type: 'enum' },
      { name: 'reimbursementStatus', type: 'enum' },
      { name: 'description', type: 'string', nullable: true },
      { name: 'date', type: 'datetime' },
    ],
  },
  {
    table: 'revenue_transactions',
    label: 'Revenue Transactions',
    purpose: 'One-off, non-shipment income.',
    source: '§8, §9.2, §10 (new)',
    isNew: true,
    columns: [
      { name: 'id', type: 'id', pk: true },
      { name: 'type', type: 'enum' },
      { name: 'amount', type: 'number' },
      { name: 'receivedStatus', type: 'enum' },
      { name: 'notes', type: 'string', nullable: true },
      { name: 'date', type: 'datetime' },
    ],
  },
  {
    table: 'advances',
    label: 'Advances',
    purpose: 'Money issued to a party who must pay it back.',
    source: '§10 (new)',
    isNew: true,
    columns: [
      { name: 'id', type: 'id', pk: true },
      { name: 'partyType', type: 'enum' },
      { name: 'partyId', type: 'id' },
      { name: 'originalAmount', type: 'number' },
      { name: 'outstandingAmount', type: 'number' },
      { name: 'status', type: 'enum' },
      { name: 'createdAt', type: 'datetime' },
    ],
  },
  {
    table: 'advance_movements',
    label: 'Advance Movements',
    purpose: 'One issue, deduction, or repayment against an Advance.',
    source: '§10 (new)',
    isNew: true,
    columns: [
      { name: 'id', type: 'id', pk: true },
      { name: 'advanceId', type: 'id', fk: { table: 'advances', label: 'Advance' } },
      { name: 'movementType', type: 'enum' },
      { name: 'amount', type: 'number' },
      { name: 'date', type: 'datetime' },
    ],
  },
  {
    table: 'capital_transactions',
    label: 'Capital Transactions',
    purpose: 'Owner contribution or profit distribution.',
    source: '§10 (new)',
    isNew: true,
    columns: [
      { name: 'id', type: 'id', pk: true },
      { name: 'type', type: 'enum' },
      { name: 'amount', type: 'number' },
      { name: 'date', type: 'datetime' },
    ],
  },
  {
    table: 'cash_custodies',
    label: 'Cash Custodies',
    purpose: 'Cash issued to someone for a purpose unrelated to shipments.',
    source: '§10 (new)',
    isNew: true,
    columns: [
      { name: 'id', type: 'id', pk: true },
      { name: 'holderId', type: 'id' },
      { name: 'purpose', type: 'string' },
      { name: 'issuedAmount', type: 'number' },
      { name: 'returnedAmount', type: 'number' },
      { name: 'outstandingAmount', type: 'number' },
      { name: 'status', type: 'enum' },
      { name: 'createdAt', type: 'datetime' },
    ],
  },
  {
    table: 'custody_debts',
    label: 'Custody Debts',
    purpose: 'An unresolved shortage, from cash custody or a courier reconciliation.',
    source: '§10 (new)',
    isNew: true,
    columns: [
      { name: 'id', type: 'id', pk: true },
      { name: 'partyId', type: 'id' },
      { name: 'source', type: 'enum' },
      { name: 'sourceId', type: 'id' },
      { name: 'originalAmount', type: 'number' },
      { name: 'settledAmount', type: 'number' },
      { name: 'outstandingAmount', type: 'number' },
      { name: 'createdAt', type: 'datetime' },
    ],
  },
  {
    table: 'audit_log',
    label: 'Audit Log',
    purpose: 'Cross-cutting audit trail of every executed action (infrastructure for the demo, not a doc entity).',
    source: 'Infrastructure',
    isNew: true,
    columns: [
      { name: 'id', type: 'id', pk: true },
      { name: 'timestamp', type: 'datetime' },
      { name: 'transactionId', type: 'id' },
      { name: 'actor', type: 'enum' },
      { name: 'actionId', type: 'string' },
      { name: 'message', type: 'string' },
    ],
  },
];

export function getTableSchema(table: TableName): TableSchema {
  const schema = TABLE_SCHEMAS.find((t) => t.table === table);
  if (!schema) throw new Error(`Unknown table: ${table}`);
  return schema;
}
