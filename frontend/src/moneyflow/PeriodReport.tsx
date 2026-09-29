import { useSimStore } from '../store/useSimStore.js';

export default function PeriodReport() {
  const rollup = useSimStore((s) => s.rollup);
  if (!rollup) return null;

  const rows: Array<{ label: string; amount: number; bold?: boolean }> = [
    { label: 'Shipment fees earned', amount: rollup.shipmentFeesEarned },
    { label: 'Courier commissions paid', amount: -rollup.courierCommissionsPaid },
    { label: '= Company Shipment Contribution', amount: rollup.companyShipmentContribution, bold: true },
    { label: '+ Other Revenue', amount: rollup.otherRevenue },
    ...rollup.expenseLines.map((l) => ({ label: `- ${l.label}`, amount: l.amount })),
    { label: '= Net Result for the period', amount: rollup.netResult, bold: true },
  ];

  return (
    <div className="mx-auto max-w-lg p-8">
      <h2 className="mb-1 text-sm font-semibold text-slate-100">Company Expenses & Revenue — Period Roll-up</h2>
      <p className="mb-4 text-[11px] text-slate-500">Doc §9.3: shipment contribution + other revenue, minus every recorded expense.</p>
      <div className="overflow-hidden rounded-md border border-surface-border">
        {rows.map((r, i) => (
          <div key={i} className={`flex items-center justify-between border-b border-surface-border/60 px-3 py-1.5 font-mono text-xs last:border-none ${r.bold ? 'bg-surface-2 font-semibold text-slate-100' : 'text-slate-400'}`}>
            <span>{r.label}</span>
            <span className={r.amount < 0 ? 'text-danger' : 'text-money'}>{r.amount.toLocaleString()} EGP</span>
          </div>
        ))}
      </div>
      <p className="mt-3 text-[10.5px] leading-snug text-slate-600">
        This mechanism runs over every recorded Shipment Financials row and expense/revenue transaction — a loss here only reflects the illustrative demo dataset (a handful of shipments against a
        full month of fixed overhead), exactly as doc §9.3 notes.
      </p>
    </div>
  );
}
