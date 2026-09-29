import clsx from 'clsx';
import { getTableSchema } from '@pfx/shared';
import { useSimStore } from '../store/useSimStore.js';

function fmt(v: unknown): string {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (Array.isArray(v)) return `[${v.length}]`;
  return String(v);
}

export default function TransactionDetail() {
  const activeReplay = useSimStore((s) => s.activeReplay);
  const stepIndex = useSimStore((s) => s.stepIndex);
  const mode = useSimStore((s) => s.mode);
  if (!activeReplay) return null;
  const tx = activeReplay.transaction;

  const impactByTable = new Map<string, Set<string>>();
  for (const m of tx.mutations) {
    if (!impactByTable.has(m.table)) impactByTable.set(m.table, new Set());
    impactByTable.get(m.table)!.add(m.op);
  }

  return (
    <div className="space-y-3">
      <div className="rounded border border-surface-border bg-surface-2 p-2">
        <div className="flex items-center justify-between">
          <span className="font-mono text-[10px] text-slate-500">{tx.transactionId}</span>
          <span className="rounded bg-accent-soft px-1.5 py-0.5 text-[10px] text-accent">{tx.actor}</span>
        </div>
        <div className="mt-1 text-xs font-semibold text-slate-100">{tx.actionLabel}</div>
        <div className="text-[10.5px] text-slate-500">
          by {tx.actorName} at {new Date(tx.timestamp).toLocaleTimeString()}
        </div>
        {tx.isAssumedRule && <div className="mt-1 rounded bg-warn/15 px-1.5 py-0.5 text-[10px] text-warn">Uses a documented ASSUMPTION (Open Decision, doc §12)</div>}
      </div>

      <div>
        <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Database Impact</div>
        <div className="space-y-0.5">
          {[...impactByTable.entries()].map(([table, ops]) => (
            <div key={table} className="flex items-center justify-between rounded bg-surface-2 px-2 py-1 font-mono text-[10.5px]">
              <span className="text-slate-300">{getTableSchema(table as never).label}</span>
              <span className="text-accent">{[...ops].join(', ')}</span>
            </div>
          ))}
        </div>
      </div>

      <div>
        <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Steps ({Math.min(stepIndex + 1, tx.steps.length)}/{tx.steps.length})</div>
        <ol className="space-y-1.5">
          {tx.steps.map((step, i) => {
            const active = i === stepIndex;
            const done = i <= stepIndex;
            return (
              <li key={step.order} className={clsx('rounded border p-1.5 transition-colors', active ? 'border-accent bg-accent-soft/40' : done ? 'border-surface-border bg-surface-2' : 'border-surface-border/40 opacity-40')}>
                <div className="flex items-center gap-1.5 text-[10.5px] font-semibold text-slate-200">
                  <span className="rounded bg-surface-3 px-1 text-[9px] text-slate-500">{step.order}</span>
                  {step.title}
                  <span className="ml-auto rounded bg-surface-3 px-1 text-[9px] text-slate-500">{step.actor}</span>
                </div>
                <p className="mt-0.5 text-[10.5px] leading-snug text-slate-400">{step.description}</p>
                {done &&
                  step.mutations.map((m, mi) => (
                    <div key={mi} className="mt-1 rounded bg-surface-1 px-1.5 py-1 font-mono text-[10px]">
                      <span className="text-slate-500">{m.op}</span> <span className="text-slate-300">{getTableSchema(m.table).label}</span> <span className="text-slate-500">#{m.recordId}</span>
                      {m.before &&
                        Object.keys(m.after)
                          .filter((k) => JSON.stringify(m.before?.[k]) !== JSON.stringify(m.after[k]))
                          .map((k) => (
                            <div key={k} className="ml-3 text-slate-500">
                              {k}: {fmt(m.before?.[k])} <span className="text-slate-600">→</span> <span className="text-money">{fmt(m.after[k])}</span>
                            </div>
                          ))}
                    </div>
                  ))}
                {done && mode === 'developer' && step.events.length > 0 && (
                  <div className="mt-1 space-y-0.5">
                    {step.events.map((ev) => (
                      <div key={ev.id} className="rounded bg-surface-1 px-1.5 py-1 font-mono text-[9.5px] text-slate-500">
                        event: {ev.type} {JSON.stringify(ev.payload)}
                      </div>
                    ))}
                  </div>
                )}
              </li>
            );
          })}
        </ol>
      </div>

      {tx.moneyFlows.length > 0 && (
        <div>
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Money Flows</div>
          <div className="space-y-1">
            {tx.moneyFlows.map((mf) => (
              <div key={mf.id} className="flex items-center justify-between rounded bg-surface-2 px-2 py-1 font-mono text-[10.5px]">
                <span className="text-slate-400">
                  {mf.from.label} <span className="text-slate-600">→</span> {mf.to.label}
                </span>
                <span className={mf.status === 'Failed' ? 'text-danger' : 'text-money'}>{mf.amount} EGP</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Audit Entries</div>
        <div className="space-y-0.5">
          {tx.auditEntries.map((a) => (
            <div key={a.id} className="rounded bg-surface-2 px-2 py-1 text-[10.5px] text-slate-400">
              {a.message}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
