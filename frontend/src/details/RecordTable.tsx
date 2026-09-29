import type { TableSchema } from '@pfx/shared';
import { useSimStore } from '../store/useSimStore.js';

interface Props {
  schema: TableSchema;
  records: Array<Record<string, unknown>>;
}

function fmt(v: unknown): string {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (Array.isArray(v)) return `[${v.length}]`;
  return String(v);
}

export default function RecordTable({ schema, records }: Props) {
  const selectRecord = useSimStore((s) => s.selectRecord);
  const selectedRecord = useSimStore((s) => s.selectedRecord);
  const cols = schema.columns.filter((c) => c.type !== 'string' || c.pk || c.fk).slice(0, 5);

  if (records.length === 0) return <p className="text-[11px] text-slate-500">No records yet.</p>;

  return (
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
            <tr
              key={String(r.id)}
              onClick={() => selectRecord(schema.table, String(r.id))}
              className={`cursor-pointer border-t border-surface-border/60 hover:bg-surface-2 ${selectedRecord?.id === r.id ? 'bg-accent-soft/50' : ''}`}
            >
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
  );
}
