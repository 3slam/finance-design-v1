import type { ActorRole, AuditLogEntry, MoneyFlow } from '@pfx/shared';
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

/** Structural, not the flat design's concrete `ActionExecutionResult` —
 * both engines' result shapes satisfy this, so this card renders either. */
export interface StoryCardResult {
  actor: ActorRole;
  isAssumedRule: boolean;
  moneyFlows: MoneyFlow[];
  auditEntries: AuditLogEntry[];
}

interface Props {
  step: { title: string; blurb: string };
  result: StoryCardResult;
  stageNumber: number;
  totalStages: number;
  playKey: number;
}

export default function StoryCard({ step, result, stageNumber, totalStages, playKey }: Props) {
  return (
    <div className="rounded-2xl border border-border bg-bg-surface p-6 shadow-sm">
      <div className="mb-3 flex items-center justify-between text-body-s text-text-muted">
        <span>
          Step {stageNumber} of {totalStages}
        </span>
        <span className="flex items-center gap-1.5 rounded-full bg-bg-field px-2.5 py-1">
          <span>{ACTOR_ICON[result.actor]}</span>
          <span className="font-medium text-text-secondary">{ACTOR_LABEL[result.actor]}</span>
        </span>
      </div>

      <h2 className="text-heading-l text-ink">{step.title}</h2>
      <p className="mt-1.5 text-body-l text-text-secondary">{step.blurb}</p>

      {result.isAssumedRule && (
        <div className="mt-3 rounded-lg bg-warning-bg px-3 py-1.5 text-body-s text-warning">
          This step uses a small assumption where the source document left a rule undecided.
        </div>
      )}

      <div className="mt-4">
        <FlowDiagram flows={result.moneyFlows} playKey={playKey} />
      </div>

      <div className="mt-4 space-y-1.5 border-t border-border pt-4">
        {result.auditEntries.map((a) => (
          <div key={a.id} className="flex items-start gap-2 text-body-m text-text-secondary">
            <span className="mt-0.5 text-success">✓</span>
            <span>{a.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
