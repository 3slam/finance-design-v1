import { useEffect, useState } from 'react';
import ActivityFeed from './components/ActivityFeed.js';
import CompletionCard from './components/CompletionCard.js';
import Controls from './components/Controls.js';
import DatabasePeek from './components/DatabasePeek.js';
import IntroCard from './components/IntroCard.js';
import StoryCard from './components/StoryCard.js';
import { useStory } from './store/useStory.js';
import { COMPANY_STORY, SHIPMENT_STORY } from './story/storySteps.js';

/** "What We Did" — the original Level 2 finance design (no double-entry
 * ledger): the guided story that was here before the second approach. */
export default function FlatDesignView() {
  const init = useStory((s) => s.init);
  const loaded = useStory((s) => s.loaded);
  const phase = useStory((s) => s.phase);
  const index = useStory((s) => s.index);
  const order = useStory((s) => s.order);
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
    return <div className="flex h-64 items-center justify-center text-sm text-text-tertiary">Loading…</div>;
  }

  const steps = phase === 'shipment' ? SHIPMENT_STORY : phase === 'company' ? COMPANY_STORY : [];
  const currentStep = index >= 0 && index < steps.length ? steps[index] : null;
  const currentResult = currentStep ? results[currentStep.id] : null;

  return (
    <div className="grid w-full grid-cols-1 gap-6 lg:grid-cols-2">
      <div className="space-y-4">
        {error && (
          <div className="rounded-lg border border-danger/30 bg-danger-bg px-4 py-2.5 text-body-m text-danger">
            <strong>Something went wrong:</strong> {error}
          </div>
        )}

        {phase === 'intro' && <IntroCard onStart={beginShipmentStory} />}

        {phase !== 'intro' && index === -1 && (
          <div className="rounded-2xl border border-border bg-bg-surface p-8 text-center shadow-sm">
            <p className="text-body-l text-text-tertiary">Getting started…</p>
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

        {phase !== 'intro' && (
          <ActivityFeed heading={phase === 'shipment' ? "Today's deliveries" : 'This month’s expenses & revenue'} steps={steps} index={index} order={order} results={results} />
        )}
      </div>

      <div>
        <DatabasePeek />
      </div>
    </div>
  );
}
