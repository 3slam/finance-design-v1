import { useEffect, useState } from 'react';
import ActivityFeed from './components/ActivityFeed.js';
import CompletionCard from './components/CompletionCard.js';
import Controls from './components/Controls.js';
import IntroCard from './components/IntroCard.js';
import LedgerPeek from './components/LedgerPeek.js';
import StoryCard from './components/StoryCard.js';
import { useLedgerStory } from './store/useLedgerStory.js';
import { LEDGER_COMPANY_STORY, LEDGER_SHIPMENT_STORY } from './story/ledgerStorySteps.js';

/** "The Second Approach" — the same PantherExpress story, this time booked
 * through a real double-entry ledger (chart of accounts + balanced
 * FinanceTransactions/Entries) per the reference design document. */
export default function LedgerDesignView() {
  const init = useLedgerStory((s) => s.init);
  const loaded = useLedgerStory((s) => s.loaded);
  const phase = useLedgerStory((s) => s.phase);
  const index = useLedgerStory((s) => s.index);
  const order = useLedgerStory((s) => s.order);
  const results = useLedgerStory((s) => s.results);
  const rollup = useLedgerStory((s) => s.rollup);
  const playing = useLedgerStory((s) => s.playing);
  const error = useLedgerStory((s) => s.error);
  const beginShipmentStory = useLedgerStory((s) => s.beginShipmentStory);
  const beginCompanyStory = useLedgerStory((s) => s.beginCompanyStory);
  const next = useLedgerStory((s) => s.next);
  const prev = useLedgerStory((s) => s.prev);
  const play = useLedgerStory((s) => s.play);
  const pause = useLedgerStory((s) => s.pause);
  const restart = useLedgerStory((s) => s.restart);

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

  const steps = phase === 'shipment' ? LEDGER_SHIPMENT_STORY : phase === 'company' ? LEDGER_COMPANY_STORY : [];
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

        {phase === 'intro' && (
          <IntroCard
            onStart={beginShipmentStory}
            emoji="⚖️📓💰"
            title="The same story, booked on a real ledger"
            description="Same Ahmed, same Seller A, same three packages — but this time every step posts a balanced FinanceTransaction against a chart of accounts, per the double-entry ledger design document. Press start and watch each entry balance."
          />
        )}

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
        <LedgerPeek />
      </div>
    </div>
  );
}
