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
    <div className="rounded-xl border border-surface-border bg-surface-1 p-4">
      <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        {phase === 'shipment' ? "Today's deliveries" : 'This month’s expenses & revenue'}
      </h3>
      <ol className="space-y-2">
        {steps.map((step, i) => {
          const done = i <= index;
          const current = i === index;
          const result = results[step.id];
          return (
            <li key={step.id} className={`flex items-start gap-2 text-[12.5px] ${current ? 'text-slate-100' : done ? 'text-slate-400' : 'text-slate-600'}`}>
              <span className={`mt-0.5 ${done ? 'text-money' : 'text-slate-700'}`}>{done ? '✓' : '○'}</span>
              <div>
                <div className={current ? 'font-semibold' : ''}>{step.title}</div>
                {done && result && result.moneyFlows.length > 0 && (
                  <div className="text-[11px] text-slate-600">{result.moneyFlows.reduce((s, f) => s + f.amount, 0)} EGP moved</div>
                )}
              </div>
            </li>
          );
        })}
      </ol>
      {order.length > 0 && <p className="mt-3 text-[10.5px] text-slate-600">{order.length} action(s) executed so far — this is the real engine, not a mockup.</p>}
    </div>
  );
}
