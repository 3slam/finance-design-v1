import { useState } from 'react';
import clsx from 'clsx';
import { isActionSuccess } from '@pfx/shared';
import { useSimStore, type PlaybackSpeed } from '../store/useSimStore.js';

const SPEEDS: PlaybackSpeed[] = [0.25, 0.5, 1, 2];

export default function TimelineBar() {
  const [tab, setTab] = useState<'audit' | 'history'>('audit');
  const auditLog = useSimStore((s) => s.auditLog);
  const history = useSimStore((s) => s.history);
  const activeReplay = useSimStore((s) => s.activeReplay);
  const stepIndex = useSimStore((s) => s.stepIndex);
  const playing = useSimStore((s) => s.playing);
  const speed = useSimStore((s) => s.speed);
  const play = useSimStore((s) => s.play);
  const pause = useSimStore((s) => s.pause);
  const stepForward = useSimStore((s) => s.stepForward);
  const stepBackward = useSimStore((s) => s.stepBackward);
  const restart = useSimStore((s) => s.restart);
  const skipToComplete = useSimStore((s) => s.skipToComplete);
  const setSpeed = useSimStore((s) => s.setSpeed);
  const inspectTransaction = useSimStore((s) => s.inspectTransaction);
  const closeReplay = useSimStore((s) => s.closeReplay);

  const totalSteps = activeReplay?.transaction.steps.length ?? 0;

  return (
    <div className="flex h-full flex-col border-t border-surface-border bg-surface-1">
      <div className="flex items-center gap-3 border-b border-surface-border px-3 py-1.5">
        <div className="flex items-center gap-1">
          <button title="Restart" onClick={restart} disabled={!activeReplay} className="rounded px-2 py-1 text-xs text-slate-300 hover:bg-surface-3 disabled:opacity-30">
            ⏮
          </button>
          <button title="Previous step" onClick={stepBackward} disabled={!activeReplay} className="rounded px-2 py-1 text-xs text-slate-300 hover:bg-surface-3 disabled:opacity-30">
            ◀
          </button>
          <button
            title={playing ? 'Pause' : 'Play'}
            onClick={playing ? pause : play}
            disabled={!activeReplay}
            className="rounded bg-accent px-3 py-1 text-xs font-semibold text-white hover:bg-accent/90 disabled:opacity-30"
          >
            {playing ? '❙❙ Pause' : '▶ Play'}
          </button>
          <button title="Next step" onClick={stepForward} disabled={!activeReplay} className="rounded px-2 py-1 text-xs text-slate-300 hover:bg-surface-3 disabled:opacity-30">
            ▶
          </button>
          <button title="Skip to complete" onClick={skipToComplete} disabled={!activeReplay} className="rounded px-2 py-1 text-xs text-slate-300 hover:bg-surface-3 disabled:opacity-30">
            ⏭
          </button>
        </div>
        <div className="flex items-center gap-1">
          {SPEEDS.map((s) => (
            <button
              key={s}
              onClick={() => setSpeed(s)}
              className={clsx('rounded px-1.5 py-0.5 text-[10px] font-mono', speed === s ? 'bg-accent text-white' : 'bg-surface-3 text-slate-400 hover:text-slate-200')}
            >
              {s}x
            </button>
          ))}
        </div>
        {activeReplay && (
          <div className="flex-1">
            <div className="h-1.5 w-full overflow-hidden rounded bg-surface-3">
              <div className="h-full bg-accent transition-all duration-500" style={{ width: `${totalSteps ? (Math.max(stepIndex + 1, 0) / totalSteps) * 100 : 0}%` }} />
            </div>
          </div>
        )}
        {activeReplay && (
          <button onClick={closeReplay} className="rounded px-2 py-1 text-[10px] text-slate-500 hover:text-slate-300">
            ✕ Close
          </button>
        )}
      </div>

      <div className="flex border-b border-surface-border px-3">
        {(['audit', 'history'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={clsx('px-3 py-1.5 text-[11px] font-medium capitalize', tab === t ? 'border-b-2 border-accent text-accent' : 'text-slate-500 hover:text-slate-300')}
          >
            {t === 'audit' ? 'Audit Log' : 'Action History'}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-1.5 font-mono text-[10.5px]">
        {tab === 'audit' &&
          auditLog
            .slice()
            .reverse()
            .map((a) => (
              <div key={a.id} className="border-b border-surface-border/40 py-0.5 text-slate-400">
                <span className="text-slate-600">{new Date(a.timestamp).toLocaleTimeString()}</span> <span className="text-accent">{a.actorName}</span> — {a.message}
              </div>
            ))}
        {tab === 'history' &&
          history
            .slice()
            .reverse()
            .map((h, i) => (
              <div
                key={i}
                onClick={() => isActionSuccess(h) && inspectTransaction(h)}
                className={clsx('flex items-center justify-between border-b border-surface-border/40 py-0.5', isActionSuccess(h) ? 'cursor-pointer hover:text-slate-200' : 'text-danger')}
              >
                <span className={isActionSuccess(h) ? 'text-slate-300' : 'text-danger'}>{h.actionLabel}</span>
                <span className="text-slate-600">{isActionSuccess(h) ? `${h.mutations.length} mutation(s)` : `FAILED — ${h.reason}`}</span>
              </div>
            ))}
      </div>
    </div>
  );
}
