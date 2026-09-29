import { create } from 'zustand';
import type {
  ActionDefinition,
  ActionExecutionResult,
  ActionId,
  ActionOutcome,
  ActionValidationError,
  AuditLogEntry,
  FinanceState,
  PeriodRollup,
  ScenarioDefinition,
  TableName,
  TableSchema,
} from '@pfx/shared';
import { isActionSuccess } from '@pfx/shared';
import { api } from '../api/client.js';
import { applyMutations, cloneState } from '../replay.js';

export type PlaybackSpeed = 0.25 | 0.5 | 1 | 2;

interface ActiveReplay {
  transaction: ActionExecutionResult;
  /** true = user is inspecting a past action from history; false = an action was just executed live. */
  isHistorical: boolean;
}

interface SimStoreState {
  loading: boolean;
  loaded: boolean;
  schema: TableSchema[];
  actionDefs: ActionDefinition[];
  scenarioDefs: ScenarioDefinition[];

  dbState: FinanceState | null;
  displayState: FinanceState | null;
  rollup: PeriodRollup | null;
  auditLog: AuditLogEntry[];
  history: ActionOutcome[];

  lastError: ActionValidationError | null;
  lastFailedActionId: string | null;

  mode: 'presentation' | 'developer';
  selectedTable: TableName | null;
  selectedRecord: { table: TableName; id: string } | null;

  activeReplay: ActiveReplay | null;
  replayQueue: ActionExecutionResult[];
  replayBeforeState: FinanceState | null;
  stepIndex: number;
  playing: boolean;
  speed: PlaybackSpeed;

  loadInitial: () => Promise<void>;
  runAction: (actionId: ActionId, input: Record<string, unknown>, actorName?: string) => Promise<void>;
  runScenario: (scenarioId: string) => Promise<void>;
  reset: () => Promise<void>;
  refreshAuditAndHistory: () => Promise<void>;

  play: () => void;
  pause: () => void;
  stepForward: () => void;
  stepBackward: () => void;
  restart: () => void;
  skipToComplete: () => void;
  setSpeed: (s: PlaybackSpeed) => void;

  inspectTransaction: (tx: ActionExecutionResult) => void;
  closeReplay: () => void;

  setMode: (mode: 'presentation' | 'developer') => void;
  selectTable: (table: TableName | null) => void;
  selectRecord: (table: TableName, id: string) => void;
  clearError: () => void;
}

let tickHandle: ReturnType<typeof setInterval> | null = null;
function clearTick() {
  if (tickHandle) {
    clearInterval(tickHandle);
    tickHandle = null;
  }
}

const BASE_STEP_MS = 1600;

export const useSimStore = create<SimStoreState>((set, get) => ({
  loading: false,
  loaded: false,
  schema: [],
  actionDefs: [],
  scenarioDefs: [],

  dbState: null,
  displayState: null,
  rollup: null,
  auditLog: [],
  history: [],

  lastError: null,
  lastFailedActionId: null,

  mode: 'presentation',
  selectedTable: null,
  selectedRecord: null,

  activeReplay: null,
  replayQueue: [],
  replayBeforeState: null,
  stepIndex: -1,
  playing: false,
  speed: 1,

  async loadInitial() {
    set({ loading: true });
    const [schema, actionDefs, scenarioDefs, dbState, rollup, auditLog, history] = await Promise.all([
      api.getSchema(),
      api.getActions(),
      api.getScenarios(),
      api.getState(),
      api.getRollup(),
      api.getAuditLog(),
      api.getHistory(),
    ]);
    set({ schema, actionDefs, scenarioDefs, dbState, displayState: dbState, rollup, auditLog, history, loading: false, loaded: true });
  },

  async refreshAuditAndHistory() {
    const [auditLog, history] = await Promise.all([api.getAuditLog(), api.getHistory()]);
    set({ auditLog, history });
  },

  async runAction(actionId, input, actorName) {
    const before = get().dbState;
    if (!before) return;
    const response = await api.executeAction(actionId, input, actorName);
    const { result } = response;
    if (!isActionSuccess(result)) {
      set({ lastError: result, lastFailedActionId: actionId });
      await get().refreshAuditAndHistory();
      return;
    }
    set({ lastError: null, lastFailedActionId: null });
    startLiveReplay(set, get, [result], before, response.state, response.rollup);
    await get().refreshAuditAndHistory();
  },

  async runScenario(scenarioId) {
    const before = get().dbState;
    if (!before) return;
    const response = await api.runScenario(scenarioId);
    const failure = response.results.find((r) => !isActionSuccess(r)) as ActionValidationError | undefined;
    const successes = response.results.filter(isActionSuccess) as ActionExecutionResult[];
    if (successes.length > 0) {
      startLiveReplay(set, get, successes, before, response.state, response.rollup);
    }
    if (failure) {
      set({ lastError: failure, lastFailedActionId: failure.actionId });
    } else {
      set({ lastError: null, lastFailedActionId: null });
    }
    await get().refreshAuditAndHistory();
  },

  async reset() {
    clearTick();
    const response = await api.reset();
    set({
      dbState: response.state,
      displayState: response.state,
      rollup: response.rollup,
      activeReplay: null,
      replayQueue: [],
      replayBeforeState: null,
      stepIndex: -1,
      playing: false,
      lastError: null,
      lastFailedActionId: null,
      selectedRecord: null,
    });
    await get().refreshAuditAndHistory();
  },

  play() {
    if (!get().activeReplay) return;
    set({ playing: true });
    scheduleTick(set, get);
  },

  pause() {
    clearTick();
    set({ playing: false });
  },

  stepForward() {
    advanceStep(set, get);
  },

  stepBackward() {
    const { activeReplay, replayBeforeState, stepIndex } = get();
    if (!activeReplay || !replayBeforeState) return;
    const newIndex = Math.max(-1, stepIndex - 1);
    const display = newIndex < 0 ? replayBeforeState : applyMutations(replayBeforeState, flattenMutations(activeReplay.transaction, newIndex));
    set({ stepIndex: newIndex, displayState: activeReplay.isHistorical ? get().displayState : display, playing: false });
    clearTick();
  },

  restart() {
    const { activeReplay, replayBeforeState } = get();
    if (!activeReplay) return;
    clearTick();
    set({ stepIndex: -1, displayState: activeReplay.isHistorical ? get().displayState : replayBeforeState, playing: false });
  },

  skipToComplete() {
    clearTick();
    // Fast-forward through every queued transaction at once: complete the
    // current one, let finishTransaction shift the next one in, and stop
    // once we've just completed the last transaction in the queue.
    let state = get();
    while (state.activeReplay) {
      const isLast = state.replayQueue.length === 0;
      finishTransaction(set, get);
      state = get();
      if (isLast) break;
    }
    clearTick();
    set({ playing: false });
  },

  setSpeed(s) {
    set({ speed: s });
    if (get().playing) scheduleTick(set, get);
  },

  inspectTransaction(tx) {
    clearTick();
    set({
      activeReplay: { transaction: tx, isHistorical: true },
      replayQueue: [],
      replayBeforeState: null,
      stepIndex: tx.steps.length,
      playing: false,
    });
  },

  closeReplay() {
    clearTick();
    set({ activeReplay: null, replayQueue: [], replayBeforeState: null, stepIndex: -1, playing: false });
  },

  setMode(mode) {
    set({ mode });
  },

  selectTable(table) {
    set({ selectedTable: table, selectedRecord: null });
  },

  selectRecord(table, id) {
    set({ selectedTable: table, selectedRecord: { table, id } });
  },

  clearError() {
    set({ lastError: null, lastFailedActionId: null });
  },
}));

function flattenMutations(tx: ActionExecutionResult, upToStepIndex: number) {
  return tx.steps.slice(0, upToStepIndex + 1).flatMap((s) => s.mutations);
}

function startLiveReplay(
  set: (partial: Partial<SimStoreState>) => void,
  get: () => SimStoreState,
  transactions: ActionExecutionResult[],
  before: FinanceState,
  finalState: FinanceState,
  rollup: PeriodRollup,
) {
  clearTick();
  const [first, ...rest] = transactions;
  set({
    activeReplay: { transaction: first, isHistorical: false },
    replayQueue: rest,
    replayBeforeState: cloneState(before),
    displayState: cloneState(before),
    stepIndex: -1,
    playing: true,
    dbState: finalState,
    rollup,
  });
  scheduleTick(set, get);
}

function scheduleTick(set: (partial: Partial<SimStoreState>) => void, get: () => SimStoreState) {
  clearTick();
  const ms = BASE_STEP_MS / get().speed;
  tickHandle = setInterval(() => {
    advanceStep(set, get);
  }, ms);
}

function advanceStep(set: (partial: Partial<SimStoreState>) => void, get: () => SimStoreState) {
  const { activeReplay, replayBeforeState, stepIndex } = get();
  if (!activeReplay) {
    clearTick();
    return;
  }
  const totalSteps = activeReplay.transaction.steps.length;
  if (stepIndex + 1 >= totalSteps) {
    finishTransaction(set, get);
    return;
  }
  const newIndex = stepIndex + 1;
  if (!activeReplay.isHistorical && replayBeforeState) {
    const display = applyMutations(replayBeforeState, flattenMutations(activeReplay.transaction, newIndex));
    set({ stepIndex: newIndex, displayState: display });
  } else {
    set({ stepIndex: newIndex });
  }
}

function finishTransaction(set: (partial: Partial<SimStoreState>) => void, get: () => SimStoreState) {
  const { activeReplay, replayQueue, dbState } = get();
  if (!activeReplay) {
    clearTick();
    return;
  }
  if (!activeReplay.isHistorical) {
    set({ stepIndex: activeReplay.transaction.steps.length, displayState: cloneState(dbState as FinanceState) });
  } else {
    set({ stepIndex: activeReplay.transaction.steps.length });
  }
  if (replayQueue.length > 0) {
    const [next, ...rest] = replayQueue;
    set({
      activeReplay: { transaction: next, isHistorical: false },
      replayQueue: rest,
      replayBeforeState: cloneState(dbState as FinanceState),
      stepIndex: -1,
    });
    // continue the interval loop for the next transaction
  } else {
    clearTick();
    set({ playing: false });
  }
}
