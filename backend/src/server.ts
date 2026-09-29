import cors from 'cors';
import express, { type Request, type Response } from 'express';
import {
  ACTION_DEFINITIONS,
  FinanceEngine,
  SCENARIOS,
  TABLE_SCHEMAS,
  type ActionId,
  type ActionOutcome,
} from '@pfx/shared';

const app = express();
app.use(cors());
app.use(express.json());

const engine = new FinanceEngine();

/**
 * Server-side history of every executed action/scenario, in addition to the
 * engine's own audit log — this keeps the FULL result object (steps,
 * mutations, events, money flows) for every past action so the UI's Action
 * History (doc-driven demo requirement: inspect an old action's timeline /
 * before-after state) has something to look up by transactionId.
 */
let history: ActionOutcome[] = [];

const PORT = process.env.PORT ? Number(process.env.PORT) : 4000;

app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ ok: true });
});

app.get('/api/schema', (_req: Request, res: Response) => {
  res.json(TABLE_SCHEMAS);
});

app.get('/api/actions', (_req: Request, res: Response) => {
  res.json(ACTION_DEFINITIONS);
});

app.get('/api/scenarios', (_req: Request, res: Response) => {
  res.json(SCENARIOS);
});

app.get('/api/state', (_req: Request, res: Response) => {
  res.json(engine.getState());
});

app.get('/api/audit-log', (_req: Request, res: Response) => {
  res.json(engine.getAuditLog());
});

app.get('/api/events', (_req: Request, res: Response) => {
  res.json(engine.getEvents());
});

app.get('/api/rollup', (_req: Request, res: Response) => {
  res.json(engine.getPeriodRollup());
});

app.get('/api/history', (_req: Request, res: Response) => {
  res.json(history);
});

app.get('/api/history/:transactionId', (req: Request, res: Response) => {
  const found = history.find((h) => 'transactionId' in h && h.transactionId === req.params.transactionId);
  if (!found) {
    res.status(404).json({ error: `No transaction ${req.params.transactionId} in history.` });
    return;
  }
  res.json(found);
});

app.post('/api/actions/:actionId/execute', (req: Request, res: Response) => {
  const actionId = req.params.actionId as ActionId;
  const known = ACTION_DEFINITIONS.some((a) => a.id === actionId);
  if (!known) {
    res.status(404).json({ error: `Unknown action: ${actionId}` });
    return;
  }
  const input = (req.body?.input ?? {}) as Record<string, unknown>;
  const actorName = typeof req.body?.actorName === 'string' ? req.body.actorName : undefined;
  const result = engine.execute(actionId, input, actorName);
  history.push(result);
  res.json({ result, state: engine.getState(), rollup: engine.getPeriodRollup() });
});

app.post('/api/scenarios/:scenarioId/run', (req: Request, res: Response) => {
  const scenarioId = req.params.scenarioId;
  const known = SCENARIOS.some((s) => s.id === scenarioId);
  if (!known) {
    res.status(404).json({ error: `Unknown scenario: ${scenarioId}` });
    return;
  }
  const results = engine.runScenario(scenarioId);
  history.push(...results);
  res.json({ results, state: engine.getState(), rollup: engine.getPeriodRollup() });
});

app.post('/api/reset', (_req: Request, res: Response) => {
  engine.reset();
  history = [];
  res.json({ state: engine.getState(), rollup: engine.getPeriodRollup() });
});

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`PantherExpress Finance simulator API listening on :${PORT}`);
});
