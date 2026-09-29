import { useEffect, useState } from 'react';
import ActivityFeed from './components/ActivityFeed.js';
import CompletionCard from './components/CompletionCard.js';
import Controls from './components/Controls.js';
import DatabasePeek from './components/DatabasePeek.js';
import IntroCard from './components/IntroCard.js';
import StoryCard from './components/StoryCard.js';
import { useStory } from './store/useStory.js';
import { COMPANY_STORY, SHIPMENT_STORY } from './story/storySteps.js';

export default function App() {
  const init = useStory((s) => s.init);
  const loaded = useStory((s) => s.loaded);
  const phase = useStory((s) => s.phase);
  const index = useStory((s) => s.index);
  const results = useStory((s) => s.results);
  const rollup = useStory((s) => s.rollup);
  const playing = useStory((s) => s.playing);
  const error = useStory((s) => s.error);
  const beginShipmentStory = useStory((s) => s.beginShipmentStory);
  const beginCompanyStory = useStory((s) => s.beginCompanyStory);
  const next = useStory((s) => s.next);
  const prev = useStory((s) => s.prev);
  const play = useStory((s) => s.play);
  const pause = useStory((s) => s.pause);
  const restart = useStory((s) => s.restart);

  const [playKey, setPlayKey] = useState(0);
  useEffect(() => {
    setPlayKey((k) => k + 1);
  }, [phase, index]);

  useEffect(() => {
    init();
  }, [init]);

  if (!loaded) {
    return <div className="flex h-screen items-center justify-center bg-surface-0 text-sm text-slate-500">Loading…</div>;
  }

  const steps = phase === 'shipment' ? SHIPMENT_STORY : phase === 'company' ? COMPANY_STORY : [];
  const currentStep = index >= 0 && index < steps.length ? steps[index] : null;
  const currentResult = currentStep ? results[currentStep.id] : null;

  return (
    <div className="min-h-screen bg-surface-0 text-slate-100">
      <header className="border-b border-surface-border bg-surface-1 px-6 py-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-semibold text-slate-100">PantherExpress Finance Simulator</div>
            <div className="text-[11px] text-slate-500">A shipment's money, step by step</div>
          </div>
          <button onClick={restart} className="rounded-md border border-surface-border px-3 py-1.5 text-[11px] text-slate-400 hover:bg-surface-2">
            ↻ Restart
          </button>
        </div>
      </header>

      <main className="grid w-full grid-cols-1 gap-6 px-6 py-8 lg:grid-cols-2">
        <div className="space-y-4">
          {error && (
            <div className="rounded-lg border border-danger/50 bg-danger/10 px-4 py-2.5 text-[12.5px] text-danger">
              <strong>Something went wrong:</strong> {error}
            </div>
          )}

          {phase === 'intro' && <IntroCard onStart={beginShipmentStory} />}

          {phase !== 'intro' && index === -1 && (
            <div className="rounded-2xl border border-surface-border bg-surface-1 p-8 text-center shadow-xl">
              <p className="text-sm text-slate-400">Getting started…</p>
            </div>
          )}

          {currentStep && currentResult && (
            <>
              <StoryCard step={currentStep} result={currentResult} stageNumber={index + 1} totalStages={steps.length} playKey={playKey} />
              <Controls index={index} total={steps.length} playing={playing} onPrev={prev} onNext={next} onPlay={play} onPause={pause} />
            </>
          )}

          {phase === 'shipment' && index === steps.length && <CompletionCard variant="shipment-done" onContinue={beginCompanyStory} onRestart={restart} />}
          {phase === 'company' && index === steps.length && rollup && <CompletionCard variant="company-done" rollup={rollup} onRestart={restart} />}

          {phase !== 'intro' && <ActivityFeed />}
        </div>

        <div>
          <DatabasePeek />
        </div>
      </main>
    </div>
  );
}
