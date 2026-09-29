import { create } from 'zustand';
import { isActionSuccess, type ActionExecutionResult, type FinanceState, type PeriodRollup } from '@pfx/shared';
import { api } from '../api/client.js';
import { COMPANY_STORY, SHIPMENT_STORY, type StoryStep } from '../story/storySteps.js';

export type StoryPhase = 'intro' | 'shipment' | 'company';

interface StoryStoreState {
  loaded: boolean;
  dbState: FinanceState | null;
  rollup: PeriodRollup | null;

  phase: StoryPhase;
  /** -1 = phase not started yet; N = stage N has been executed and is being shown; steps.length = phase complete. */
  index: number;
  results: Record<string, ActionExecutionResult>;
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

function stepsFor(phase: StoryPhase): StoryStep[] {
  if (phase === 'shipment') return SHIPMENT_STORY;
  if (phase === 'company') return COMPANY_STORY;
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

export const useStory = create<StoryStoreState>((set, get) => ({
  loaded: false,
  dbState: null,
  rollup: null,

  phase: 'intro',
  index: -1,
  results: {},
  order: [],
  playing: false,
  error: null,

  async init() {
    const [dbState, rollup] = await Promise.all([api.getState(), api.getRollup()]);
    set({ dbState, rollup, loaded: true });
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
      const response = await api.executeAction(step.actionId, step.input(state));
      if (!isActionSuccess(response.result)) {
        set({ error: response.result.reason, playing: false });
        clearTick();
        return;
      }
      set({
        dbState: response.state,
        rollup: response.rollup,
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
    const response = await api.reset();
    set({
      dbState: response.state,
      rollup: response.rollup,
      phase: 'intro',
      index: -1,
      results: {},
      order: [],
      playing: false,
      error: null,
    });
  },
}));

export { stepsFor };
