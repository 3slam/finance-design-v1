import type { PeriodRollup } from '@pfx/shared';

interface ShipmentDoneProps {
  variant: 'shipment-done';
  onContinue: () => void;
  onRestart: () => void;
}

interface CompanyDoneProps {
  variant: 'company-done';
  rollup: PeriodRollup;
  onRestart: () => void;
}

type Props = ShipmentDoneProps | CompanyDoneProps;

export default function CompletionCard(props: Props) {
  if (props.variant === 'shipment-done') {
    return (
      <div className="rounded-2xl border border-surface-border bg-surface-1 p-8 text-center shadow-xl">
        <div className="mb-3 text-3xl">🎉</div>
        <h2 className="text-lg font-semibold text-slate-50">That's the full shipment lifecycle</h2>
        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-slate-400">
          From delivery, to Ahmed's cash handover, to settlements, to Seller A actually getting paid. Want to see how
          the company tracks its own everyday expenses and revenue too?
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <button onClick={props.onContinue} className="rounded-lg bg-accent px-5 py-2.5 text-sm font-semibold text-white hover:bg-accent/90">
            See Company Expenses & Revenue →
          </button>
          <button onClick={props.onRestart} className="rounded-lg border border-surface-border px-5 py-2.5 text-sm font-medium text-slate-300 hover:bg-surface-2">
            Restart
          </button>
        </div>
      </div>
    );
  }

  const rows: Array<{ label: string; amount: number; bold?: boolean }> = [
    { label: 'Shipment fees earned', amount: props.rollup.shipmentFeesEarned },
    { label: 'Courier commissions paid', amount: -props.rollup.courierCommissionsPaid },
    { label: '= Company Shipment Contribution', amount: props.rollup.companyShipmentContribution, bold: true },
    { label: '+ Other Revenue', amount: props.rollup.otherRevenue },
    ...props.rollup.expenseLines.map((l) => ({ label: l.label, amount: l.amount })),
    { label: '= Net Result for the period', amount: props.rollup.netResult, bold: true },
  ];

  return (
    <div className="rounded-2xl border border-surface-border bg-surface-1 p-8 shadow-xl">
      <div className="mb-3 text-center text-3xl">📊</div>
      <h2 className="text-center text-lg font-semibold text-slate-50">Here's the whole period, in one number</h2>
      <p className="mx-auto mt-2 max-w-md text-center text-sm leading-relaxed text-slate-400">
        Every fee, commission, expense and bit of revenue you just watched happen, rolled up into one result.
      </p>
      <div className="mx-auto mt-5 max-w-sm overflow-hidden rounded-lg border border-surface-border">
        {rows.map((r, i) => (
          <div key={i} className={`flex items-center justify-between border-b border-surface-border/60 px-3 py-1.5 font-mono text-xs last:border-none ${r.bold ? 'bg-surface-2 font-semibold text-slate-100' : 'text-slate-400'}`}>
            <span>{r.label}</span>
            <span className={r.amount < 0 ? 'text-danger' : 'text-money'}>{r.amount.toLocaleString()} EGP</span>
          </div>
        ))}
      </div>
      <p className="mx-auto mt-3 max-w-sm text-center text-[11px] text-slate-600">
        This only looks like a loss because the demo has a handful of shipments against a full month of rent — in
        real use it runs over the hub's whole shipment volume.
      </p>
      <div className="mt-6 flex justify-center">
        <button onClick={props.onRestart} className="rounded-lg border border-surface-border px-5 py-2.5 text-sm font-medium text-slate-300 hover:bg-surface-2">
          ↻ Restart Everything
        </button>
      </div>
    </div>
  );
}
