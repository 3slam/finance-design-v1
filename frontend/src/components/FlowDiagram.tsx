import { motion } from 'framer-motion';
import type { MoneyFlow, MoneyFlowKind, MoneyFlowParty } from '@pfx/shared';

const PARTY_ICON: Record<string, string> = {
  Customer: '🧍',
  Courier: '🛵',
  Merchant: '🏬',
  CompanyAccount: '🏢',
  Vendor: '🔧',
  Employee: '🧑‍💼',
  FinanceOperator: '🏢',
  System: '🏢',
};

const KIND_LABEL: Record<MoneyFlowKind, string> = {
  CODCollection: 'cash on delivery',
  RefundPayout: 'refund',
  FeeRecognition: 'seller fee',
  CommissionRecognition: 'courier commission',
  CashHandover: 'cash handover',
  SettlementPayout: 'settlement payout',
  ExpensePayment: 'expense payment',
  RevenueReceipt: 'revenue',
  AdvanceIssuance: 'advance issued',
  AdvanceRepayment: 'advance repayment',
  CustodyIssuance: 'cash custody issued',
  CustodyReturn: 'cash custody returned',
  Compensation: 'compensation',
  CapitalContribution: 'capital contribution',
  ProfitDistribution: 'profit distribution',
};

function colorFor(flow: MoneyFlow): string {
  if (flow.status === 'Failed') return '#ef5f5f';
  if (flow.kind === 'RefundPayout' || flow.kind === 'ExpensePayment') return '#e2a53a';
  return '#3ecf8e';
}

function icon(type: MoneyFlowParty['type']): string {
  return PARTY_ICON[type] ?? '👤';
}

interface Props {
  flows: MoneyFlow[];
  playKey: number;
}

export default function FlowDiagram({ flows, playKey }: Props) {
  if (flows.length === 0) {
    return (
      <div className="flex h-28 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-surface-border text-slate-500">
        <motion.div animate={{ opacity: [0.4, 1, 0.4] }} transition={{ duration: 1.8, repeat: Infinity }} className="text-2xl">
          🧮
        </motion.div>
        <p className="text-xs">No money moves in this step — it's just a calculation.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {flows.map((flow, i) => {
        const color = colorFor(flow);
        return (
          <motion.div
            key={`${playKey}-${flow.id}`}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.3, duration: 0.5 }}
            className="flex items-center justify-between rounded-lg border px-3 py-2"
            style={{ borderColor: `${color}55`, backgroundColor: `${color}12` }}
          >
            <div className="flex items-center gap-1.5 text-[13px] text-slate-200">
              <span>{icon(flow.from.type)}</span>
              <span>{flow.from.label}</span>
              <span className="mx-1 text-slate-500">→</span>
              <span>{icon(flow.to.type)}</span>
              <span>{flow.to.label}</span>
            </div>
            <div className="text-right">
              <div className="font-mono text-sm font-semibold" style={{ color }}>
                {flow.amount} EGP
              </div>
              <div className="text-[10px] text-slate-500">
                {KIND_LABEL[flow.kind]}
                {flow.status === 'Failed' ? ' — failed' : ''}
              </div>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}
