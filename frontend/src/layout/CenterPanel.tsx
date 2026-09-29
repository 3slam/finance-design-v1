import { useState } from 'react';
import clsx from 'clsx';
import ErdCanvas from '../erd/ErdCanvas.js';
import MoneyFlowView from '../moneyflow/MoneyFlowView.js';
import PeriodReport from '../moneyflow/PeriodReport.js';
import ErrorBanner from './ErrorBanner.js';

const TABS = ['ERD', 'Money Flow', 'Period Report'] as const;

export default function CenterPanel() {
  const [tab, setTab] = useState<(typeof TABS)[number]>('ERD');

  return (
    <div className="relative flex h-full flex-col bg-surface-0">
      <div className="flex border-b border-surface-border bg-surface-1 px-2">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={clsx('px-3 py-1.5 text-[11px] font-medium', tab === t ? 'border-b-2 border-accent text-accent' : 'text-slate-500 hover:text-slate-300')}
          >
            {t}
          </button>
        ))}
      </div>
      <div className="relative flex-1 overflow-hidden">
        <ErrorBanner />
        {tab === 'ERD' && <ErdCanvas />}
        {tab === 'Money Flow' && <MoneyFlowView />}
        {tab === 'Period Report' && (
          <div className="h-full overflow-y-auto">
            <PeriodReport />
          </div>
        )}
      </div>
    </div>
  );
}
