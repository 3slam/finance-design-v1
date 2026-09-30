import { Ledger } from '@pfx/shared';
import { useLedgerStory } from '../store/useLedgerStory.js';

/** The tables the guided story actually populates — same curation
 * philosophy as the flat design's DatabasePeek (Claims/Adjustments exist in
 * the reference document but nothing in this app ever writes to them, so
 * they're left out rather than shown perpetually empty). */
const CURATED_TABLES: Ledger.LedgerTableName[] = [
  'finance_accounts',
  'finance_transactions',
  'finance_entries',
  'courier_reconciliations',
  'courier_reconciliation_lines',
  'cash_deposits',
  'settlements',
  'settlement_lines',
  'payouts',
];

const TABLE_LABELS: Partial<Record<Ledger.LedgerTableName, string>> = {
  finance_accounts: 'Finance Accounts',
  finance_transactions: 'Finance Transactions',
  finance_entries: 'Finance Entries',
  courier_reconciliations: 'Courier Reconciliations',
  courier_reconciliation_lines: 'Courier Reconciliation Lines',
  cash_deposits: 'Cash Deposits',
  settlements: 'Settlements',
  settlement_lines: 'Settlement Lines',
  payouts: 'Payouts',
};

const COLUMNS: Partial<Record<Ledger.LedgerTableName, string[]>> = {
  finance_accounts: ['id', 'name', 'accountType', 'normalSide', 'status'],
  finance_transactions: ['id', 'type', 'shipmentId', 'sellerId', 'courierId', 'status', 'memo'],
  finance_entries: ['id', 'transactionId', 'accountId', 'direction', 'amount', 'lineType'],
  courier_reconciliations: ['id', 'courierId', 'hubId', 'expectedCash', 'actualCash', 'variance', 'status'],
  courier_reconciliation_lines: ['id', 'reconciliationId', 'shipmentId', 'financeTransactionId', 'cashEffect'],
  cash_deposits: ['id', 'hubId', 'amount', 'bankReference', 'status'],
  settlements: ['id', 'partyType', 'partyId', 'gross', 'deductions', 'net', 'status'],
  settlement_lines: ['id', 'settlementId', 'financeTransactionId', 'shipmentId', 'lineType', 'amount'],
  payouts: ['id', 'settlementId', 'payeeType', 'payeeId', 'amount', 'status', 'financeTransactionId'],
};

function fmt(v: unknown): string {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  return String(v);
}

export default function LedgerPeek() {
  const dbState = useLedgerStory((s) => s.dbState);
  if (!dbState) return null;

  return (
    <div className="rounded-xl border border-border bg-bg-surface p-4">
      <h3 className="mb-3 text-body-m font-semibold text-text-secondary">🗄 The actual database tables</h3>
      <div className="space-y-5">
        {CURATED_TABLES.map((table) => {
          const key = Ledger.LEDGER_TABLE_STATE_KEY[table];
          const records = Object.values(dbState[key] as unknown as Record<string, Record<string, unknown>>);
          const colNames = COLUMNS[table] ?? Object.keys(records[0] ?? {}).slice(0, 6);
          return (
            <div key={table}>
              <div className="mb-1 flex items-center gap-2 text-body-s font-semibold text-text-tertiary">
                {TABLE_LABELS[table]} <span className="text-text-muted">({records.length})</span>
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
                            {name}
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
            </div>
          );
        })}
      </div>
    </div>
  );
}
