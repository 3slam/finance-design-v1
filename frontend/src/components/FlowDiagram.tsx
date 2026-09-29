import { motion } from 'framer-motion';
import type { MoneyFlow, MoneyFlowParty } from '@pfx/shared';

const LANE_ORDER: MoneyFlowParty['type'][] = ['Customer', 'Courier', 'Merchant', 'CompanyAccount', 'Vendor', 'Employee', 'FinanceOperator', 'System'];
const LANE_LABEL: Record<string, string> = {
  Customer: 'Customer',
  Courier: 'Courier',
  Merchant: 'Merchant',
  CompanyAccount: 'Company',
  Vendor: 'Vendor',
  Employee: 'Employee',
  FinanceOperator: 'Company',
  System: 'Company',
};
const LANE_ICON: Record<string, string> = {
  Customer: '🧍',
  Courier: '🛵',
  Merchant: '🏬',
  CompanyAccount: '🏢',
  Vendor: '🔧',
  Employee: '🧑‍💼',
  FinanceOperator: '🏢',
  System: '🏢',
};

function colorFor(flow: MoneyFlow): string {
  if (flow.status === 'Failed') return '#ef5f5f';
  if (flow.kind === 'RefundPayout' || flow.kind === 'ExpensePayment') return '#e2a53a';
  return '#3ecf8e';
}

interface Props {
  flows: MoneyFlow[];
  playKey: number;
}

export default function FlowDiagram({ flows, playKey }: Props) {
  if (flows.length === 0) {
    return (
      <div className="flex h-40 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-surface-border text-slate-500">
        <motion.div animate={{ opacity: [0.4, 1, 0.4] }} transition={{ duration: 1.8, repeat: Infinity }} className="text-2xl">
          🧮
        </motion.div>
        <p className="text-xs">No money moves in this step — it's just a calculation.</p>
      </div>
    );
  }

  const lanes = LANE_ORDER.filter((l) => flows.some((f) => f.from.type === l || f.to.type === l));
  const laneWidth = 160;

  const laneX = (type: string) => {
    const idx = lanes.indexOf(type as MoneyFlowParty['type']);
    return (idx < 0 ? 0 : idx) * laneWidth + laneWidth / 2;
  };

  return (
    <div className="overflow-x-auto py-2">
      <div className="relative mx-auto" style={{ width: lanes.length * laneWidth, height: 110 + flows.length * 40 }}>
        {lanes.map((lane, i) => (
          <div key={lane} className="absolute top-0 flex flex-col items-center" style={{ left: i * laneWidth, width: laneWidth }}>
            <div className="flex h-12 w-12 items-center justify-center rounded-full border border-surface-border bg-surface-2 text-xl">{LANE_ICON[lane]}</div>
            <div className="mt-1 text-[11px] font-medium text-slate-300">{LANE_LABEL[lane]}</div>
            <div className="mt-2 w-px flex-1 bg-surface-border" style={{ height: 40 + flows.length * 40 }} />
          </div>
        ))}
        {flows.map((flow, i) => {
          const fromX = laneX(flow.from.type);
          const toX = laneX(flow.to.type);
          const y = 76 + i * 40;
          const color = colorFor(flow);
          return (
            <div key={`${playKey}-${flow.id}`} style={{ position: 'absolute', top: y, left: 0, right: 0 }}>
              <div className="absolute h-px bg-surface-border" style={{ left: Math.min(fromX, toX), width: Math.abs(toX - fromX) || 1 }} />
              <motion.div
                initial={{ left: fromX - 38, opacity: 0, scale: 0.6 }}
                animate={{ left: toX - 38, opacity: 1, scale: 1 }}
                transition={{ delay: i * 0.4, duration: 1, ease: 'easeInOut' }}
                className="absolute -top-3 flex w-[76px] items-center justify-center rounded-full px-2 py-0.5 text-[11px] font-mono font-semibold shadow"
                style={{ backgroundColor: `${color}22`, color, border: `1px solid ${color}66` }}
              >
                {flow.amount} EGP
              </motion.div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
