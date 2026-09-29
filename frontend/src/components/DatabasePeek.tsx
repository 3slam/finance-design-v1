import { TABLE_STATE_KEY, getTableSchema, type FinanceState, type TableName } from '@pfx/shared';
import { useStory } from '../store/useStory.js';

const CURATED_TABLES: TableName[] = ['shipments', 'shipment_financials', 'courier_reconciliations', 'seller_settlements', 'courier_settlements', 'payouts', 'expense_transactions', 'revenue_transactions'];

/** Which columns to show per table, in order. Curated explicitly (rather than
 * a generic "first N columns" cut) so the numbers people actually care about
 * — like a shipment's collected/refund amount — are never accidentally cut off. */
const COLUMNS: Partial<Record<TableName, string[]>> = {
  shipments: ['id', 'merchantId', 'courierId', 'serviceType', 'status', 'codAmount', 'collectedAmount', 'refundAmount'],
  shipment_financials: ['id', 'shipmentId', 'sellerFee', 'courierEarning', 'outcome'],
  courier_reconciliations: ['id', 'courierId', 'expectedCash', 'actualCash', 'variance', 'status'],
  seller_settlements: ['id', 'merchantId', 'shipmentNet', 'adjustmentsNet', 'totalNet', 'status'],
  courier_settlements: ['id', 'courierId', 'earningTotal', 'adjustmentTotal', 'totalNet', 'status'],
  payouts: ['id', 'party', 'partyId', 'settlementId', 'amount', 'status', 'attemptNumber'],
  expense_transactions: ['id', 'type', 'attributedToType', 'amount', 'paidBy', 'reimbursementStatus'],
  revenue_transactions: ['id', 'type', 'amount', 'receivedStatus'],
};

function fmt(v: unknown): string {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (Array.isArray(v)) return `[${v.length}]`;
  return String(v);
}

/** Shipment Financials deliberately doesn't store its own collected/refund
 * amount (doc §2: it should read those from the Shipment, not duplicate
 * them) — so for display we join them in from the related shipment. */
function withJoinedShipmentAmounts(table: TableName, records: Array<Record<string, unknown>>, state: FinanceState) {
  if (table !== 'shipment_financials') return { records, extraCols: [] as string[] };
  const joined: Array<Record<string, unknown>> = records.map((r) => {
    const shipment = state.shipments[r.shipmentId as string];
    return { ...r, collectedAmount: shipment?.collectedAmount ?? null, refundAmount: shipment?.refundAmount ?? null };
  });
  return { records: joined, extraCols: ['collectedAmount', 'refundAmount'] };
}

export default function DatabasePeek() {
  const dbState = useStory((s) => s.dbState);
  if (!dbState) return null;

  return (
    <div className="rounded-xl border border-border bg-bg-surface p-4">
      <h3 className="mb-3 text-body-m font-semibold text-text-secondary">🗄 The actual database tables</h3>
      <div className="space-y-5">
        {CURATED_TABLES.map((table) => {
          const schema = getTableSchema(table);
          const key = TABLE_STATE_KEY[table];
          const rawRecords = Object.values(dbState[key] as unknown as Record<string, Record<string, unknown>>);
          const { records, extraCols } = withJoinedShipmentAmounts(table, rawRecords, dbState);
          const colNames = [...(COLUMNS[table] ?? schema.columns.slice(0, 6).map((c) => c.name)), ...extraCols];
          return (
            <div key={table}>
              <div className="mb-1 flex items-center gap-2 text-body-s font-semibold text-text-tertiary">
                {schema.label} <span className="text-text-muted">({records.length})</span>
              </div>
              {records.length === 0 ? (
                <p className="text-body-s text-text-muted">No records yet.</p>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-border">
                  <table className="w-full font-mono text-[10.5px]">
                    <thead className="bg-bg-field text-text-tertiary">
                      <tr>
                        {colNames.map((name) => (
                          <th key={name} className="whitespace-nowrap px-2 py-1 text-left font-medium">
                            {extraCols.includes(name) ? `${name}*` : name}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {records.map((r) => (
                        <tr key={String(r.id)} className="border-t border-border">
                          {colNames.map((name) => (
                            <td key={name} className="whitespace-nowrap px-2 py-1 text-text-secondary">
                              {fmt(r[name])}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {extraCols.length > 0 && <p className="mt-1 text-[10px] text-text-muted">* read from the related Shipment, not stored on this table.</p>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
