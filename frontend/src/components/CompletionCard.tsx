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
      <div className="rounded-2xl border border-border bg-bg-surface p-8 text-center shadow-sm">
        <div className="mb-3 text-3xl">🎉</div>
        <h2 className="text-heading-l text-ink">That's the full shipment lifecycle</h2>
        <p className="mx-auto mt-2 max-w-md text-body-l text-text-secondary">
          From delivery, to Ahmed's cash handover, to settlements, to Seller A actually getting paid. Want to see how
          the company tracks its own everyday expenses and revenue too?
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <button onClick={props.onContinue} className="rounded-full bg-brand px-6 py-2.5 text-body-m font-semibold text-white hover:bg-brand-hover">
            See Company Expenses & Revenue →
          </button>
          <button onClick={props.onRestart} className="rounded-full border border-border px-6 py-2.5 text-body-m font-medium text-text-secondary hover:bg-bg-field">
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
    <div className="rounded-2xl border border-border bg-bg-surface p-8 shadow-sm">
      <div className="mb-3 text-center text-3xl">📊</div>
      <h2 className="text-center text-heading-l text-ink">Here's the whole period, in one number</h2>
      <p className="mx-auto mt-2 max-w-md text-center text-body-l text-text-secondary">
        Every fee, commission, expense and bit of revenue you just watched happen, rolled up into one result.
      </p>
      <div className="mx-auto mt-5 max-w-sm overflow-hidden rounded-lg border border-border">
        {rows.map((r, i) => (
          <div
            key={i}
            className={`flex items-center justify-between border-b border-border px-3 py-1.5 font-mono text-body-s last:border-none ${r.bold ? 'bg-bg-field font-semibold text-ink' : 'text-text-secondary'}`}
          >
            <span>{r.label}</span>
            <span className={r.amount < 0 ? 'text-danger' : 'text-success-dark'}>{r.amount.toLocaleString()} EGP</span>
          </div>
        ))}
      </div>
      <p className="mx-auto mt-3 max-w-sm text-center text-body-s text-text-muted">
        This only looks like a loss because the demo has a handful of shipments against a full month of rent — in
        real use it runs over the hub's whole shipment volume.
      </p>
      <div className="mt-6 flex justify-center">
        <button onClick={props.onRestart} className="rounded-full border border-border px-6 py-2.5 text-body-m font-medium text-text-secondary hover:bg-bg-field">
          ↻ Restart Everything
        </button>
      </div>
    </div>
  );
}
