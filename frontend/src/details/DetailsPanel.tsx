import { useMemo } from 'react';
import { TABLE_STATE_KEY, getTableSchema, isActionSuccess, type ActionExecutionResult, type RecordMutation } from '@pfx/shared';
import { useSimStore } from '../store/useSimStore.js';
import RecordTable from './RecordTable.js';
import RecordDetail from './RecordDetail.js';
import TransactionDetail from './TransactionDetail.js';

export function findLastMutation(history: ReturnType<typeof useSimStore.getState>['history'], table: string, id: string): { tx: ActionExecutionResult; mutation: RecordMutation } | null {
  for (let i = history.length - 1; i >= 0; i--) {
    const outcome = history[i];
    if (!isActionSuccess(outcome)) continue;
    for (let j = outcome.mutations.length - 1; j >= 0; j--) {
      const m = outcome.mutations[j];
      if (m.table === table && m.recordId === id) return { tx: outcome, mutation: m };
    }
  }
  return null;
}

export default function DetailsPanel() {
  const dbState = useSimStore((s) => s.dbState);
  const displayState = useSimStore((s) => s.displayState);
  const selectedTable = useSimStore((s) => s.selectedTable);
  const selectedRecord = useSimStore((s) => s.selectedRecord);
  const activeReplay = useSimStore((s) => s.activeReplay);
  const history = useSimStore((s) => s.history);
  const mode = useSimStore((s) => s.mode);

  const state = displayState ?? dbState;

  const schema = selectedTable ? getTableSchema(selectedTable) : null;
  const records = useMemo(() => {
    if (!state || !selectedTable) return [];
    const key = TABLE_STATE_KEY[selectedTable];
    const bucket = state[key] as unknown;
    return Array.isArray(bucket) ? bucket : Object.values(bucket as object);
  }, [state, selectedTable]);

  const selectedRecordData = useMemo(() => {
    if (!selectedRecord || !state) return null;
    const key = TABLE_STATE_KEY[selectedRecord.table];
    const bucket = state[key] as unknown;
    const list: Array<Record<string, unknown>> = Array.isArray(bucket) ? bucket : Object.values(bucket as object);
    return list.find((r) => r.id === selectedRecord.id) ?? null;
  }, [selectedRecord, state]);

  const lastMutation = selectedRecord ? findLastMutation(history, selectedRecord.table, selectedRecord.id) : null;

  return (
    <div className="flex h-full flex-col divide-y divide-surface-border overflow-y-auto border-l border-surface-border bg-surface-1">
      <section className="p-3">
        <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{schema ? `Table — ${schema.label}` : 'Select a table on the ERD'}</h3>
        {schema && <RecordTable schema={schema} records={records} />}
      </section>

      {selectedRecord && (
        <section className="p-3">
          <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Record — {selectedRecord.id}</h3>
          {schema && selectedRecordData && <RecordDetail schema={schema} record={selectedRecordData} lastMutation={lastMutation} mode={mode} />}
          {!selectedRecordData && <p className="text-[11px] text-slate-500">Record not found in current state.</p>}
        </section>
      )}

      <section className="flex-1 p-3">
        <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Transaction</h3>
        {activeReplay ? <TransactionDetail /> : <p className="text-[11px] text-slate-500">Execute an action or run a scenario to see its transaction detail here.</p>}
      </section>
    </div>
  );
}
