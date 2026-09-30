import { useState } from 'react';
import FlatDesignView from './FlatDesignView.js';
import LedgerDesignView from './LedgerDesignView.js';
import { useStory } from './store/useStory.js';
import { useLedgerStory } from './store/useLedgerStory.js';

type Tab = 'flat' | 'ledger';

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'flat', label: '1 · What We Did' },
  { id: 'ledger', label: '2 · The Second Approach' },
];

export default function App() {
  const [tab, setTab] = useState<Tab>('flat');
  const restartFlat = useStory((s) => s.restart);
  const restartLedger = useLedgerStory((s) => s.restart);

  return (
    <div className="min-h-screen bg-bg-canvas text-ink">
      <header className="border-b border-border bg-bg-surface px-6 py-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-heading-s text-ink">PantherExpress Finance Simulator</div>
            <div className="text-body-s text-text-tertiary">A shipment's money, step by step — two ways to book it</div>
          </div>
          <button
            onClick={() => (tab === 'flat' ? restartFlat() : restartLedger())}
            className="rounded-full border border-border px-4 py-1.5 text-body-s font-medium text-text-secondary hover:bg-bg-field"
          >
            ↻ Restart
          </button>
        </div>
        <nav className="mt-3 flex gap-1.5">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`rounded-full px-4 py-1.5 text-body-s font-semibold transition-colors ${
                tab === t.id ? 'bg-brand text-white' : 'bg-bg-field text-text-secondary hover:bg-border'
              }`}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </header>

      <main className="px-6 py-8">
        {tab === 'flat' && <FlatDesignView />}
        {tab === 'ledger' && <LedgerDesignView />}
      </main>
    </div>
  );
}
