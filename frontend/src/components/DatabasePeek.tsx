import { useState } from 'react';
import { TABLE_STATE_KEY, getTableSchema, type TableName } from '@pfx/shared';
import { useStory } from '../store/useStory.js';

const CURATED_TABLES: TableName[] = ['shipments', 'shipment_financials', 'courier_reconciliations', 'seller_settlements', 'courier_settlements', 'payouts', 'expense_transactions', 'revenue_transactions'];

function fmt(v: unknown): string {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (Array.isArray(v)) return `[${v.length}]`;
  return String(v);
}

export default function DatabasePeek() {
  const [open, setOpen] = useState(false);
  const dbState = useStory((s) => s.dbState);
  if (!dbState) return null;

  return (
    <div className="rounded-xl border border-surface-border bg-surface-1">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between px-4 py-3 text-left text-[12.5px] font-medium text-slate-300">
        <span>🗄 For the curious: peek at the actual database tables</span>
        <span className="text-slate-500">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="space-y-4 border-t border-surface-border p-4">
          {CURATED_TABLES.map((table) => {
            const schema = getTableSchema(table);
            const key = TABLE_STATE_KEY[table];
            const records = Object.values(dbState[key] as unknown as Record<string, Record<string, unknown>>);
            const cols = schema.columns.filter((c) => c.pk || c.fk || ['number', 'enum'].includes(c.type)).slice(0, 6);
            return (
              <div key={table}>
                <div className="mb-1 flex items-center gap-2 text-[11px] font-semibold text-slate-400">
                  {schema.label} <span className="text-slate-600">({records.length})</span>
                </div>
                {records.length === 0 ? (
                  <p className="text-[11px] text-slate-600">No records yet.</p>
                ) : (
                  <div className="overflow-x-auto rounded border border-surface-border">
                    <table className="w-full font-mono text-[10.5px]">
                      <thead className="bg-surface-2 text-slate-500">
                        <tr>
                          {cols.map((c) => (
                            <th key={c.name} className="whitespace-nowrap px-2 py-1 text-left font-medium">
                              {c.name}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {records.map((r) => (
                          <tr key={String(r.id)} className="border-t border-surface-border/60">
                            {cols.map((c) => (
                              <td key={c.name} className="whitespace-nowrap px-2 py-1 text-slate-300">
                                {fmt(r[c.name])}
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
      )}
    </div>
  );
}
