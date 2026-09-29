import clsx from 'clsx';
import { useSimStore } from '../store/useSimStore.js';

export default function TopBar() {
  const mode = useSimStore((s) => s.mode);
  const setMode = useSimStore((s) => s.setMode);
  const reset = useSimStore((s) => s.reset);
  const runScenario = useSimStore((s) => s.runScenario);
  const playing = useSimStore((s) => s.playing);
  const activeReplay = useSimStore((s) => s.activeReplay);

  const handleReset = async () => {
    if (window.confirm('Reset the simulation to its seeded state? Every executed action, settlement and payout will be discarded.')) {
      await reset();
    }
  };

  const handleResetAndReplay = async () => {
    if (window.confirm('Reset the simulation and automatically run the "Complete Shipment Delivery" demo scenario?')) {
      await reset();
      await runScenario('complete-shipment-delivery');
    }
  };

  return (
    <header className="flex items-center justify-between border-b border-surface-border bg-surface-1 px-4 py-2">
      <div className="flex items-center gap-3">
        <div className="flex h-7 w-7 items-center justify-center rounded bg-accent-soft font-mono text-xs font-bold text-accent">PX</div>
        <div>
          <div className="text-sm font-semibold leading-tight text-slate-100">PantherExpress Finance Simulator</div>
          <div className="text-[11px] leading-tight text-slate-500">Level 2 Finance Design — interactive demo</div>
        </div>
        {activeReplay && (
          <span className={clsx('ml-2 rounded px-2 py-0.5 text-[11px] font-mono', playing ? 'bg-money/20 text-money' : 'bg-surface-3 text-slate-400')}>
            {playing ? '● PLAYING' : '❙❙ PAUSED'} — {activeReplay.transaction.actionLabel}
          </span>
        )}
      </div>
      <div className="flex items-center gap-2">
        <div className="flex rounded-md border border-surface-border bg-surface-2 p-0.5 text-[11px] font-medium">
          <button
            className={clsx('rounded px-3 py-1 transition-colors', mode === 'presentation' ? 'bg-accent text-white' : 'text-slate-400 hover:text-slate-200')}
            onClick={() => setMode('presentation')}
          >
            Presentation
          </button>
          <button
            className={clsx('rounded px-3 py-1 transition-colors', mode === 'developer' ? 'bg-accent text-white' : 'text-slate-400 hover:text-slate-200')}
            onClick={() => setMode('developer')}
          >
            Developer
          </button>
        </div>
        <button onClick={handleResetAndReplay} className="rounded-md border border-surface-border bg-surface-2 px-3 py-1.5 text-[11px] font-medium text-slate-300 hover:bg-surface-3">
          Reset + Replay Demo
        </button>
        <button onClick={handleReset} className="rounded-md border border-danger/40 bg-danger/10 px-3 py-1.5 text-[11px] font-medium text-danger hover:bg-danger/20">
          Reset Simulation
        </button>
      </div>
    </header>
  );
}
