import { TABLE_STATE_KEY, type FinanceState, type RecordMutation } from '@pfx/shared';

/** Deep-clones a FinanceState snapshot (plain JSON-shaped data). */
export function cloneState(state: FinanceState): FinanceState {
  return JSON.parse(JSON.stringify(state)) as FinanceState;
}

/** Applies a list of mutations onto a cloned copy of `base`, used to build
 * the "displayed" state as the animation player steps through a
 * transaction one mutation at a time. */
export function applyMutations(base: FinanceState, mutations: RecordMutation[]): FinanceState {
  const next = cloneState(base);
  for (const m of mutations) {
    if (m.table === 'audit_log') {
      // audit_log is an array; represented in mutations only incidentally (the engine
      // tracks it as an affected table), so nothing to patch here — the audit log itself
      // is fetched separately via /api/audit-log.
      continue;
    }
    const key = TABLE_STATE_KEY[m.table];
    const bucket = next[key] as unknown as Record<string, unknown>;
    bucket[m.recordId] = m.after;
  }
  return next;
}
