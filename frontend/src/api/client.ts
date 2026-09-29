import type {
  ActionDefinition,
  ActionOutcome,
  AuditLogEntry,
  DomainEvent,
  FinanceState,
  PeriodRollup,
  ScenarioDefinition,
  TableSchema,
} from '@pfx/shared';

async function req<T>(path: string, opts?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`${res.status} ${res.statusText}: ${body}`);
  }
  return res.json() as Promise<T>;
}

export interface ExecuteResponse {
  result: ActionOutcome;
  state: FinanceState;
  rollup: PeriodRollup;
}

export interface ScenarioRunResponse {
  results: ActionOutcome[];
  state: FinanceState;
  rollup: PeriodRollup;
}

export const api = {
  getState: () => req<FinanceState>('/state'),
  getSchema: () => req<TableSchema[]>('/schema'),
  getActions: () => req<ActionDefinition[]>('/actions'),
  getScenarios: () => req<ScenarioDefinition[]>('/scenarios'),
  getAuditLog: () => req<AuditLogEntry[]>('/audit-log'),
  getEvents: () => req<DomainEvent[]>('/events'),
  getRollup: () => req<PeriodRollup>('/rollup'),
  getHistory: () => req<ActionOutcome[]>('/history'),
  executeAction: (actionId: string, input: Record<string, unknown>, actorName?: string) =>
    req<ExecuteResponse>(`/actions/${actionId}/execute`, {
      method: 'POST',
      body: JSON.stringify({ input, actorName }),
    }),
  runScenario: (scenarioId: string) =>
    req<ScenarioRunResponse>(`/scenarios/${scenarioId}/run`, { method: 'POST' }),
  reset: () => req<{ state: FinanceState; rollup: PeriodRollup }>('/reset', { method: 'POST' }),
};
