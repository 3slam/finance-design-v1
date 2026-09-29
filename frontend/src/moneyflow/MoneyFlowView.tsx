import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import type { MoneyFlow, MoneyFlowParty } from '@pfx/shared';
import { useSimStore } from '../store/useSimStore.js';

const LANES: MoneyFlowParty['type'][] = ['Customer', 'Courier', 'Merchant', 'CompanyAccount', 'FinanceOperator', 'Employee', 'Vendor'];
const LANE_LABEL: Record<string, string> = {
  Customer: 'Customer',
  Courier: 'Courier',
  Merchant: 'Merchant',
  CompanyAccount: 'Company',
  FinanceOperator: 'Holder',
  Employee: 'Employee',
  Vendor: 'Vendor / Garage',
};
const LANE_WIDTH = 150;

function laneX(type: string): number {
  const idx = LANES.indexOf(type as MoneyFlowParty['type']);
  return (idx < 0 ? LANES.length : idx) * LANE_WIDTH + LANE_WIDTH / 2;
}

function colorFor(flow: MoneyFlow): string {
  if (flow.status === 'Failed') return '#ef5f5f';
  if (flow.kind === 'RefundPayout' || flow.kind === 'ExpensePayment') return '#e2a53a';
  return '#3ecf8e';
}

export default function MoneyFlowView() {
  const activeReplay = useSimStore((s) => s.activeReplay);
  const [playKey, setPlayKey] = useState(0);

  useEffect(() => {
    setPlayKey((k) => k + 1);
  }, [activeReplay?.transaction.transactionId]);

  const flows = activeReplay?.transaction.moneyFlows ?? [];
  const lanesInUse = LANES.filter((l) => flows.some((f) => f.from.type === l || f.to.type === l));
  const activeLanes = lanesInUse.length > 0 ? lanesInUse : LANES.slice(0, 4);

  return (
    <div className="relative h-full w-full overflow-auto bg-surface-0 p-6">
      {!activeReplay && <div className="flex h-full items-center justify-center text-sm text-slate-600">Execute an action or run a scenario to watch money move.</div>}
      {activeReplay && (
        <>
          <div className="mb-4 flex items-center justify-between">
            <div className="text-xs text-slate-400">
              Money flows for <span className="font-semibold text-slate-200">{activeReplay.transaction.actionLabel}</span>
            </div>
            <button onClick={() => setPlayKey((k) => k + 1)} className="rounded border border-surface-border bg-surface-2 px-2 py-1 text-[10px] text-slate-400 hover:bg-surface-3">
              ↻ Replay Money Flow
            </button>
          </div>
          {flows.length === 0 && <p className="text-xs text-slate-600">This action did not move any money.</p>}
          <div className="relative" style={{ height: 120 + flows.length * 46, minWidth: activeLanes.length * LANE_WIDTH }}>
            {activeLanes.map((lane, i) => (
              <div key={lane} className="absolute top-0 flex flex-col items-center" style={{ left: i * LANE_WIDTH, width: LANE_WIDTH }}>
                <div className="rounded-full border border-surface-border bg-surface-2 px-3 py-1.5 text-[11px] font-medium text-slate-300">{LANE_LABEL[lane] ?? lane}</div>
                <div className="mt-1 h-full w-px bg-surface-border" style={{ height: 60 + flows.length * 46 }} />
              </div>
            ))}
            {flows.map((flow, i) => {
              const fromX = laneX(flow.from.type);
              const toX = laneX(flow.to.type);
              const y = 56 + i * 46;
              const color = colorFor(flow);
              return (
                <div key={`${playKey}-${flow.id}`} className="absolute" style={{ top: y, left: 0, right: 0, height: 0 }}>
                  <div className="absolute h-px bg-surface-border" style={{ left: Math.min(fromX, toX), width: Math.abs(toX - fromX) }} />
                  <motion.div
                    initial={{ left: fromX - 34, opacity: 0 }}
                    animate={{ left: toX - 34, opacity: 1 }}
                    transition={{ delay: i * 0.35, duration: 1.1, ease: 'easeInOut' }}
                    className="absolute -top-3 flex w-[68px] items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-mono font-semibold shadow-lg"
                    style={{ backgroundColor: `${color}22`, color, border: `1px solid ${color}66` }}
                  >
                    {flow.amount}
                  </motion.div>
                  <div className="absolute top-3 text-[9.5px] text-slate-500" style={{ left: Math.min(fromX, toX) }}>
                    {flow.kind} {flow.status === 'Failed' && '(failed)'}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
