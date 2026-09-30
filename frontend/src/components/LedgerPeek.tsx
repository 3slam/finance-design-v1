import type { Ledger } from '@pfx/shared';
import { useLedgerStory } from '../store/useLedgerStory.js';

const TYPE_ORDER: Ledger.AccountType[] = ['Asset', 'Liability', 'Equity', 'Revenue', 'Expense'];
const TYPE_LABEL: Record<Ledger.AccountType, string> = { Asset: 'Assets', Liability: 'Liabilities', Equity: 'Equity', Revenue: 'Revenue', Expense: 'Expenses' };

function fmt(n: number): string {
  return n.toLocaleString();
}

export default function LedgerPeek() {
  const dbState = useLedgerStory((s) => s.dbState);
  const trialBalance = useLedgerStory((s) => s.trialBalance);
  if (!dbState || !trialBalance) return null;

  const transactions = Object.values(dbState.financeTransactions).sort((a, b) => a.id.localeCompare(b.id));

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-border bg-bg-surface p-4">
        <div className="mb-1 flex items-center justify-between">
          <h3 className="text-body-m font-semibold text-text-secondary">⚖️ Trial Balance</h3>
          <span className={`rounded-full px-2.5 py-0.5 text-body-s font-medium ${trialBalance.balanced ? 'bg-success-bg text-success-dark' : 'bg-danger-bg text-danger'}`}>
            {trialBalance.balanced ? 'Balanced ✓' : 'Unbalanced ✗'}
          </span>
        </div>
        <p className="mb-3 text-body-s text-text-muted">Every account's balance is computed from the Entries below, never stored — doc §2.4/§2.5.</p>
        <div className="space-y-3">
          {TYPE_ORDER.map((type) => {
            const rows = trialBalance.rows.filter((r) => r.accountType === type);
            if (rows.length === 0) return null;
            return (
              <div key={type}>
                <div className="mb-1 text-body-s font-semibold uppercase tracking-wide text-text-muted">{TYPE_LABEL[type]}</div>
                <div className="overflow-x-auto rounded-lg border border-border">
                  <table className="w-full font-mono text-[11px]">
                    <tbody>
                      {rows.map((r) => (
                        <tr key={r.accountId} className="border-t border-border first:border-t-0">
                          <td className="whitespace-nowrap px-2 py-1 text-text-secondary">{r.code}</td>
                          <td className="px-2 py-1 text-text-tertiary">{r.name}</td>
                          <td className={`whitespace-nowrap px-2 py-1 text-right ${r.balance === 0 ? 'text-text-muted' : r.balance > 0 ? 'text-ink' : 'text-danger'}`}>{fmt(r.balance)} EGP</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-3 flex items-center justify-between border-t border-border pt-2 font-mono text-body-s">
          <span className="text-text-secondary">Σ Debit-normal balances</span>
          <span className="font-semibold text-ink">{fmt(trialBalance.totalDebitNormal)} EGP</span>
        </div>
        <div className="flex items-center justify-between font-mono text-body-s">
          <span className="text-text-secondary">Σ Credit-normal balances</span>
          <span className="font-semibold text-ink">{fmt(trialBalance.totalCreditNormal)} EGP</span>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-bg-surface p-4">
        <h3 className="mb-1 text-body-m font-semibold text-text-secondary">📓 The Journal — FinanceTransactions &amp; Entries</h3>
        <p className="mb-3 text-body-s text-text-muted">Immutable, append-only (doc §2.6, §6.1). Nothing here is ever edited — a correction would be a new transaction.</p>
        {transactions.length === 0 ? (
          <p className="text-body-s text-text-muted">No transactions posted yet.</p>
        ) : (
          <div className="space-y-3">
            {transactions
              .slice()
              .reverse()
              .map((t) => {
                const lines = Object.values(dbState.financeEntries).filter((e) => e.transactionId === t.id);
                const total = lines.reduce((s, l) => s + (l.direction === 'Debit' ? l.amount : 0), 0);
                return (
                  <div key={t.id} className="rounded-lg border border-border">
                    <div className="flex items-center justify-between rounded-t-lg bg-bg-field px-2.5 py-1.5">
                      <span className="font-mono text-[11px] font-semibold text-ink">
                        {t.id} · {t.type}
                      </span>
                      <span className="font-mono text-[11px] text-text-muted">{fmt(total)} EGP</span>
                    </div>
                    <div className="px-2.5 py-1.5 text-body-s text-text-secondary">{t.memo}</div>
                    <table className="w-full font-mono text-[11px]">
                      <thead>
                        <tr className="border-t border-border text-text-muted">
                          <th className="px-2.5 py-1 text-left font-normal"></th>
                          <th className="px-2.5 py-1 text-right text-[10px] font-normal">Debit</th>
                          <th className="px-2.5 py-1 text-right text-[10px] font-normal">Credit</th>
                        </tr>
                      </thead>
                      <tbody>
                        {lines.map((l) => (
                          <tr key={l.id} className="border-t border-border">
                            <td className="whitespace-nowrap px-2.5 py-1 text-text-tertiary">{l.accountId}</td>
                            <td className="whitespace-nowrap px-2.5 py-1 text-right text-ink">{l.direction === 'Debit' ? fmt(l.amount) : ''}</td>
                            <td className="whitespace-nowrap px-2.5 py-1 text-right text-ink">{l.direction === 'Credit' ? fmt(l.amount) : ''}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                );
              })}
          </div>
        )}
      </div>
    </div>
  );
}
