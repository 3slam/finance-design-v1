import clsx from 'clsx';
import type { ActorRole } from '@pfx/shared';
import { useSimStore } from '../store/useSimStore.js';

const ACTORS: Array<{ role: ActorRole; label: string; hint: string }> = [
  { role: 'Merchant', label: 'Merchant', hint: 'Seller receiving settlements' },
  { role: 'Courier', label: 'Courier', hint: 'Delivers, collects & hands over cash' },
  { role: 'FinanceOperator', label: 'Finance Operator', hint: 'Runs reconciliation, settlement & payout' },
  { role: 'System', label: 'System', hint: 'Resolves fees & commissions automatically' },
];

export default function ActorStrip() {
  const activeReplay = useSimStore((s) => s.activeReplay);
  const activeActor = activeReplay?.transaction.actor;

  return (
    <div className="grid grid-cols-2 gap-2 p-3">
      {ACTORS.map((a) => (
        <div
          key={a.role}
          className={clsx(
            'rounded-md border px-2.5 py-2 transition-all duration-300',
            activeActor === a.role ? 'border-accent bg-accent-soft shadow-[0_0_0_1px_rgba(79,140,255,0.4)]' : 'border-surface-border bg-surface-2',
          )}
        >
          <div className={clsx('text-[11px] font-semibold', activeActor === a.role ? 'text-accent' : 'text-slate-300')}>{a.label}</div>
          <div className="mt-0.5 text-[10px] leading-tight text-slate-500">{a.hint}</div>
        </div>
      ))}
      {activeReplay && (
        <div className="col-span-2 mt-1 rounded-md border border-surface-border bg-surface-3 px-2.5 py-2 font-mono text-[10px] text-slate-400">
          <span className="text-accent">{activeReplay.transaction.actorName}</span>
          <span className="mx-1 text-slate-600">→</span>
          <span className="text-slate-200">{activeReplay.transaction.actionLabel}</span>
          <span className="mx-1 text-slate-600">→</span>
          <span className="text-money">{activeReplay.transaction.affectedTables.length} tables</span>
          <span className="mx-1 text-slate-600">→</span>
          <span className="text-warn">{activeReplay.transaction.moneyFlows.length} money flow(s)</span>
        </div>
      )}
    </div>
  );
}
