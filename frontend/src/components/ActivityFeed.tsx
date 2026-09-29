import { useStory } from '../store/useStory.js';
import { COMPANY_STORY, SHIPMENT_STORY } from '../story/storySteps.js';

export default function ActivityFeed() {
  const phase = useStory((s) => s.phase);
  const index = useStory((s) => s.index);
  const order = useStory((s) => s.order);
  const results = useStory((s) => s.results);

  if (phase === 'intro') return null;

  const steps = phase === 'shipment' ? SHIPMENT_STORY : COMPANY_STORY;

  return (
    <div className="rounded-xl border border-border bg-bg-surface p-4">
      <h3 className="mb-3 text-body-s font-semibold uppercase tracking-wide text-text-muted">
        {phase === 'shipment' ? "Today's deliveries" : 'This month’s expenses & revenue'}
      </h3>
      <ol className="space-y-2">
        {steps.map((step, i) => {
          const done = i <= index;
          const current = i === index;
          const result = results[step.id];
          return (
            <li key={step.id} className={`flex items-start gap-2 text-body-m ${current ? 'text-ink' : done ? 'text-text-secondary' : 'text-text-muted'}`}>
              <span className={`mt-0.5 ${done ? 'text-success' : 'text-border'}`}>{done ? '✓' : '○'}</span>
              <div>
                <div className={current ? 'font-semibold' : ''}>{step.title}</div>
                {done && result && result.moneyFlows.length > 0 && (
                  <div className="text-body-s text-text-muted">{result.moneyFlows.reduce((s, f) => s + f.amount, 0)} EGP moved</div>
                )}
              </div>
            </li>
          );
        })}
      </ol>
      {order.length > 0 && <p className="mt-3 text-body-s text-text-muted">{order.length} action(s) executed so far — this is the real engine, not a mockup.</p>}
    </div>
  );
}
