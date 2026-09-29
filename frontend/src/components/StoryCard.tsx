import type { ActionExecutionResult, ActorRole } from '@pfx/shared';
import type { StoryStep } from '../story/storySteps.js';
import FlowDiagram from './FlowDiagram.js';

const ACTOR_LABEL: Record<ActorRole, string> = {
  Courier: 'Ahmed (Courier)',
  Merchant: 'Seller A',
  FinanceOperator: 'Finance',
  System: 'System',
};

const ACTOR_ICON: Record<ActorRole, string> = {
  Courier: '🛵',
  Merchant: '🏬',
  FinanceOperator: '🏢',
  System: '⚙️',
};

interface Props {
  step: StoryStep;
  result: ActionExecutionResult;
  stageNumber: number;
  totalStages: number;
  playKey: number;
}

export default function StoryCard({ step, result, stageNumber, totalStages, playKey }: Props) {
  return (
    <div className="rounded-2xl border border-surface-border bg-surface-1 p-6 shadow-xl">
      <div className="mb-3 flex items-center justify-between text-[11px] text-slate-500">
        <span>
          Step {stageNumber} of {totalStages}
        </span>
        <span className="flex items-center gap-1.5 rounded-full bg-surface-2 px-2.5 py-1">
          <span>{ACTOR_ICON[result.actor]}</span>
          <span className="font-medium text-slate-300">{ACTOR_LABEL[result.actor]}</span>
        </span>
      </div>

      <h2 className="text-lg font-semibold text-slate-50">{step.title}</h2>
      <p className="mt-1.5 text-sm leading-relaxed text-slate-400">{step.blurb}</p>

      {result.isAssumedRule && (
        <div className="mt-3 rounded-lg bg-warn/10 px-3 py-1.5 text-[11px] text-warn">
          This step uses a small assumption where the source document left a rule undecided.
        </div>
      )}

      <div className="mt-4">
        <FlowDiagram flows={result.moneyFlows} playKey={playKey} />
      </div>

      <div className="mt-4 space-y-1.5 border-t border-surface-border pt-4">
        {result.auditEntries.map((a) => (
          <div key={a.id} className="flex items-start gap-2 text-[13px] text-slate-300">
            <span className="mt-0.5 text-money">✓</span>
            <span>{a.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
