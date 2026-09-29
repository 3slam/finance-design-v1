import type { ActionExecutionResult, RecordMutation, TableSchema } from '@pfx/shared';

function fmt(v: unknown): string {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (Array.isArray(v)) return JSON.stringify(v);
  return String(v);
}

interface Props {
  schema: TableSchema;
  record: Record<string, unknown>;
  lastMutation: { tx: ActionExecutionResult; mutation: RecordMutation } | null;
  mode: 'presentation' | 'developer';
}

export default function RecordDetail({ schema, record, lastMutation, mode }: Props) {
  const changedFields =
    lastMutation && lastMutation.mutation.before
      ? Object.keys(lastMutation.mutation.after).filter((k) => JSON.stringify(lastMutation.mutation.before?.[k]) !== JSON.stringify(lastMutation.mutation.after[k]))
      : [];

  return (
    <div className="space-y-2">
      <div className="rounded border border-surface-border">
        {schema.columns.map((c) => (
          <div key={c.name} className="flex items-center gap-2 border-b border-surface-border/60 px-2 py-1 last:border-none">
            <span className={`w-3 text-center text-[10px] ${c.pk ? 'text-warn' : c.fk ? 'text-accent' : 'text-transparent'}`}>{c.pk ? '#' : c.fk ? '↗' : '·'}</span>
            <span className="w-40 shrink-0 truncate font-mono text-[10.5px] text-slate-500">{c.name}</span>
            <span className="truncate font-mono text-[10.5px] text-slate-200">{fmt(record[c.name])}</span>
            {changedFields.includes(c.name) && <span className="ml-auto rounded bg-money/20 px-1 text-[9px] text-money">changed</span>}
          </div>
        ))}
      </div>

      {lastMutation && changedFields.length > 0 && (
        <div className="rounded border border-accent/30 bg-accent-soft/30 p-2">
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-accent">Why did this change?</div>
          {changedFields.map((field) => (
            <div key={field} className="mb-1 font-mono text-[10.5px] text-slate-300">
              <span className="text-slate-500">{field}:</span> {fmt(lastMutation.mutation.before?.[field])} <span className="text-slate-600">→</span>{' '}
              <span className="text-money">{fmt(lastMutation.mutation.after[field])}</span>
            </div>
          ))}
          <div className="mt-1 text-[10.5px] text-slate-400">
            Changed because <span className="text-accent">{lastMutation.tx.actorName}</span> executed <span className="font-semibold text-slate-200">{lastMutation.tx.actionLabel}</span>, which
            affected {lastMutation.tx.affectedTables.length} table(s) and emitted {lastMutation.tx.events.length} event(s).
          </div>
        </div>
      )}

      {mode === 'developer' && (
        <details className="rounded border border-surface-border bg-surface-2 p-2">
          <summary className="cursor-pointer text-[10px] text-slate-500">Raw JSON</summary>
          <pre className="mt-1 overflow-x-auto text-[10px] text-slate-400">{JSON.stringify(record, null, 2)}</pre>
        </details>
      )}
    </div>
  );
}
