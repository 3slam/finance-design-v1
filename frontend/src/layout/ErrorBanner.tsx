import { useSimStore } from '../store/useSimStore.js';

export default function ErrorBanner() {
  const lastError = useSimStore((s) => s.lastError);
  const clearError = useSimStore((s) => s.clearError);
  if (!lastError) return null;

  return (
    <div className="absolute left-1/2 top-3 z-20 w-[520px] -translate-x-1/2 rounded-md border border-danger/50 bg-danger/10 px-3 py-2 shadow-xl backdrop-blur">
      <div className="flex items-start gap-2">
        <span className="mt-0.5 text-danger">⚠</span>
        <div className="flex-1">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-danger">Action Failed — {lastError.actionLabel}</div>
          <div className="mt-0.5 text-[11px] leading-snug text-slate-300">{lastError.reason}</div>
        </div>
        <button onClick={clearError} className="text-slate-500 hover:text-slate-300">
          ✕
        </button>
      </div>
    </div>
  );
}
