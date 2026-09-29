import { useEffect } from 'react';
import AppShell from './layout/AppShell.js';
import { useSimStore } from './store/useSimStore.js';

export default function App() {
  const loadInitial = useSimStore((s) => s.loadInitial);
  const loaded = useSimStore((s) => s.loaded);

  useEffect(() => {
    loadInitial();
  }, [loadInitial]);

  if (!loaded) {
    return <div className="flex h-screen items-center justify-center bg-surface-0 text-sm text-slate-500">Loading PantherExpress Finance Simulator…</div>;
  }

  return <AppShell />;
}
