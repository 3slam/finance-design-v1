import { useState } from 'react';
import clsx from 'clsx';
import type { ActionId } from '@pfx/shared';
import { useSimStore } from '../store/useSimStore.js';
import ActorStrip from './ActorStrip.js';
import ActionForm from './ActionForm.js';

const CATEGORY_LABELS: Record<string, string> = {
  ShipmentLifecycle: 'Shipment Lifecycle',
  CourierCashCustody: 'Courier Cash Custody',
  SellerFinance: 'Seller Finance',
  CourierFinance: 'Courier Finance',
  Payout: 'Payout',
  CompanyExpenseRevenue: 'Company Expenses & Revenue',
  AdvancesAndCapital: 'Advances, Capital & Custody',
};

export default function LeftPanel() {
  const [tab, setTab] = useState<'scenarios' | 'playground'>('scenarios');
  const scenarioDefs = useSimStore((s) => s.scenarioDefs);
  const actionDefs = useSimStore((s) => s.actionDefs);
  const runScenario = useSimStore((s) => s.runScenario);
  const runAction = useSimStore((s) => s.runAction);
  const [selectedActionId, setSelectedActionId] = useState<ActionId | ''>('');

  const categories = Array.from(new Set(actionDefs.map((a) => a.category)));
  const selectedAction = actionDefs.find((a) => a.id === selectedActionId);

  return (
    <div className="flex h-full flex-col border-r border-surface-border bg-surface-1">
      <ActorStrip />
      <div className="flex border-b border-surface-border px-3">
        {(['scenarios', 'playground'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={clsx(
              'px-3 py-2 text-xs font-medium capitalize transition-colors',
              tab === t ? 'border-b-2 border-accent text-accent' : 'text-slate-500 hover:text-slate-300',
            )}
          >
            {t}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto p-3">
        {tab === 'scenarios' && (
          <div className="space-y-2">
            {scenarioDefs.map((sc) => (
              <div key={sc.id} className="rounded-md border border-surface-border bg-surface-2 p-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-200">{sc.title}</span>
                  <span className="rounded bg-surface-3 px-1.5 py-0.5 font-mono text-[10px] text-slate-500">{sc.sourceRef}</span>
                </div>
                <p className="mt-1 text-[11px] leading-snug text-slate-500">{sc.description}</p>
                {sc.prerequisite && <p className="mt-1 text-[10px] italic text-warn/80">{sc.prerequisite}</p>}
                <button
                  onClick={() => runScenario(sc.id)}
                  className="mt-2 w-full rounded bg-accent/90 px-2 py-1.5 text-[11px] font-semibold text-white hover:bg-accent"
                >
                  ▶ Run Scenario
                </button>
              </div>
            ))}
          </div>
        )}
        {tab === 'playground' && (
          <div className="space-y-3">
            <p className="text-[11px] leading-snug text-slate-500">Pick any action, fill in the inputs, and execute it directly against the current state.</p>
            <div>
              <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-slate-500">Action</label>
              <select
                value={selectedActionId}
                onChange={(e) => setSelectedActionId(e.target.value as ActionId)}
                className="w-full rounded border border-surface-border bg-surface-2 px-2 py-1.5 text-xs text-slate-200 focus:border-accent focus:outline-none"
              >
                <option value="">Select an action…</option>
                {categories.map((cat) => (
                  <optgroup key={cat} label={CATEGORY_LABELS[cat] ?? cat}>
                    {actionDefs
                      .filter((a) => a.category === cat)
                      .map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.label}
                        </option>
                      ))}
                  </optgroup>
                ))}
              </select>
            </div>
            {selectedAction && (
              <div className="rounded-md border border-surface-border bg-surface-2 p-2.5">
                <div className="mb-1 flex items-center gap-1.5 text-[10px] text-slate-500">
                  <span className="rounded bg-surface-3 px-1.5 py-0.5">{selectedAction.actor}</span>
                  <span className="rounded bg-surface-3 px-1.5 py-0.5 font-mono">{selectedAction.sourceRef}</span>
                  {selectedAction.isAssumedRule && <span className="rounded bg-warn/20 px-1.5 py-0.5 text-warn">assumed rule</span>}
                </div>
                <p className="mb-2 text-[11px] leading-snug text-slate-400">{selectedAction.description}</p>
                <p className="mb-2 text-[10px] italic text-slate-500">Preconditions: {selectedAction.preconditions}</p>
                <ActionForm action={selectedAction} onExecute={(input) => runAction(selectedAction.id, input)} />
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
