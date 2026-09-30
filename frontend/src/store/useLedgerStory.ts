import { create } from 'zustand';
import type { Ledger, PeriodRollup } from '@pfx/shared';
import { ledgerApi } from '../api/client.js';
import { LEDGER_COMPANY_STORY, LEDGER_SHIPMENT_STORY, type LedgerStoryStep } from '../story/ledgerStorySteps.js';

export type LedgerStoryPhase = 'intro' | 'shipment' | 'company';

interface LedgerStoryStoreState {
  loaded: boolean;
  dbState: Ledger.LedgerState | null;
  rollup: PeriodRollup | null;
  trialBalance: Ledger.TrialBalanceView | null;

  phase: LedgerStoryPhase;
  index: number;
  results: Record<string, Ledger.LedgerActionExecutionResult>;
  order: string[];
  playing: boolean;
  error: string | null;

  init: () => Promise<void>;
  beginShipmentStory: () => void;
  beginCompanyStory: () => void;
  next: () => Promise<void>;
  prev: () => void;
  play: () => void;
  pause: () => void;
  restart: () => Promise<void>;
}

function stepsFor(phase: LedgerStoryPhase): LedgerStoryStep[] {
  if (phase === 'shipment') return LEDGER_SHIPMENT_STORY;
  if (phase === 'company') return LEDGER_COMPANY_STORY;
  return [];
}

let tickHandle: ReturnType<typeof setInterval> | null = null;
function clearTick() {
  if (tickHandle) {
    clearInterval(tickHandle);
    tickHandle = null;
  }
}

const STAGE_DELAY_MS = 2600;

export const useLedgerStory = create<LedgerStoryStoreState>((set, get) => ({
  loaded: false,
  dbState: null,
  rollup: null,
  trialBalance: null,

  phase: 'intro',
  index: -1,
  results: {},
  order: [],
  playing: false,
  error: null,

  async init() {
    const [dbState, rollup, trialBalance] = await Promise.all([ledgerApi.getState(), ledgerApi.getRollup(), ledgerApi.getTrialBalance()]);
    set({ dbState, rollup, trialBalance, loaded: true });
  },

  beginShipmentStory() {
    clearTick();
    set({ phase: 'shipment', index: -1, playing: false, error: null });
    void get().next();
  },

  beginCompanyStory() {
    clearTick();
    set({ phase: 'company', index: -1, playing: false, error: null });
    void get().next();
  },

  async next() {
    const { phase, index, results, order } = get();
    const steps = stepsFor(phase);
    if (index + 1 > steps.length) return;
    if (index + 1 === steps.length) {
      set({ index: index + 1 });
      clearTick();
      set({ playing: false });
      return;
    }
    const step = steps[index + 1];
    const state = get().dbState;
    if (!state) return;
    try {
      const response = await ledgerApi.executeAction(step.actionId, step.input(state));
      if (!response.result.success) {
        set({ error: response.result.reason, playing: false });
        clearTick();
        return;
      }
      set({
        dbState: response.state,
        rollup: response.rollup,
        trialBalance: response.trialBalance,
        results: { ...results, [step.id]: response.result },
        order: [...order, step.id],
        index: index + 1,
        error: null,
      });
    } catch (err) {
      set({ error: err instanceof Error ? err.message : String(err), playing: false });
      clearTick();
    }
  },

  prev() {
    set({ index: Math.max(-1, get().index - 1) });
  },

  play() {
    set({ playing: true });
    clearTick();
    tickHandle = setInterval(() => {
      const { phase, index } = get();
      const steps = stepsFor(phase);
      if (index >= steps.length) {
        clearTick();
        set({ playing: false });
        return;
      }
      void get().next();
    }, STAGE_DELAY_MS);
  },

  pause() {
    clearTick();
    set({ playing: false });
  },

  async restart() {
    clearTick();
    const response = await ledgerApi.reset();
    set({
      dbState: response.state,
      rollup: response.rollup,
      trialBalance: response.trialBalance,
      phase: 'intro',
      index: -1,
      results: {},
      order: [],
      playing: false,
      error: null,
    });
  },
}));

export { stepsFor as ledgerStepsFor };
