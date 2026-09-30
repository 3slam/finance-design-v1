import { IdGenerator } from '../id.js';
import { ValidationError } from '../engine.js';
import type { Courier, Merchant, MerchantPricingConfig } from '../domain.js';
import {
  BANK_MAIN,
  buildLedgerSeedState,
  CASH_SUSPENSE,
  courierCashAccountCode,
  courierPayableAccountCode,
  EXP_COMPENSATION,
  EXP_COURIER,
  EXP_FUEL,
  EXP_MAINTENANCE,
  EXP_RENT,
  EXP_UTILITIES,
  hubCashAccountCode,
  REV_OTHER,
  REV_REPLACEMENT,
  REV_SHIPPING,
  sellerPayableAccountCode,
} from './seed.js';
import { getAccountBalance, getLedgerPeriodRollup } from './calculations.js';
import type {
  ActorRole,
  AuditLogEntry,
  CashDeposit,
  CourierReconciliation,
  CourierReconciliationLine,
  EntryDirection,
  FinanceEntry,
  FinanceTransaction,
  FinanceTransactionType,
  ID,
  LedgerActionExecutionResult,
  LedgerActionOutcome,
  LedgerActionStep,
  LedgerActionValidationError,
  LedgerDomainEvent,
  LedgerDomainEventType,
  LedgerRecordMutation,
  LedgerShipment,
  LedgerTableName,
  MoneyFlow,
  MoneyFlowKind,
  MoneyFlowParty,
  Payout,
  Settlement,
  SettlementLine,
  SettlementPartyType,
} from './domain.js';
import type { LedgerState } from './state.js';
import { LEDGER_TABLE_STATE_KEY } from './tableKeys.js';

export type LedgerActionId =
  | 'deliverShipment'
  | 'processReplacement'
  | 'startCourierReconciliation'
  | 'depositToBank'
  | 'calculateSellerSettlement'
  | 'calculateCourierSettlement'
  | 'executePayout'
  | 'retryPayout'
  | 'recordExpense'
  | 'recordRevenue';

export const LEDGER_ACTION_IDS: readonly LedgerActionId[] = [
  'deliverShipment',
  'processReplacement',
  'startCourierReconciliation',
  'depositToBank',
  'calculateSellerSettlement',
  'calculateCourierSettlement',
  'executePayout',
  'retryPayout',
  'recordExpense',
  'recordRevenue',
];

const ACTION_LABELS: Record<LedgerActionId, string> = {
  deliverShipment: 'Deliver Shipment',
  processReplacement: 'Process Replacement',
  startCourierReconciliation: 'Start Courier Reconciliation',
  depositToBank: 'Deposit Hub Cash to Bank',
  calculateSellerSettlement: 'Calculate Seller Settlement',
  calculateCourierSettlement: 'Calculate Courier Settlement',
  executePayout: 'Execute Payout',
  retryPayout: 'Retry Payout',
  recordExpense: 'Record Expense',
  recordRevenue: 'Record Other Revenue',
};

interface PostedLine {
  accountId: ID;
  direction: EntryDirection;
  amount: number;
  lineType: string;
  memo?: string;
}

interface TxContext {
  transactionId: ID;
  actionId: string;
  actionLabel: string;
  actor: ActorRole;
  actorName: string;
  timestamp: string;
  steps: LedgerActionStep[];
  mutations: LedgerRecordMutation[];
  events: LedgerDomainEvent[];
  auditEntries: AuditLogEntry[];
  moneyFlows: MoneyFlow[];
  affectedTables: Set<LedgerTableName>;
  isAssumedRule: boolean;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * The "second approach" engine — a faithful implementation of the reference
 * document's Ledger Core + Workflow tables (see `domain.ts` file header).
 * Every action posts one or more balanced `FinanceTransaction`s; nothing is
 * ever mutated on an existing FinanceTransaction/FinanceEntry once posted
 * (doc §6.1, §2.6) — corrections would be a REVERSAL or ADJUSTMENT
 * transaction, neither of which the guided story needs.
 */
export class LedgerEngine {
  private state: LedgerState;
  private ids = new IdGenerator();
  private clock: () => string;
  private tx: TxContext | null = null;

  constructor(opts?: { clock?: () => string }) {
    this.clock = opts?.clock ?? (() => new Date().toISOString());
    this.state = buildLedgerSeedState();
  }

  reset(): void {
    this.ids.reset();
    this.tx = null;
    this.state = buildLedgerSeedState();
  }

  getState(): LedgerState {
    return clone(this.state);
  }

  getAuditLog(): AuditLogEntry[] {
    return clone(this.state.auditLog);
  }

  getEvents(): LedgerDomainEvent[] {
    return clone(this.state.events);
  }

  getPeriodRollup() {
    return getLedgerPeriodRollup(this.state);
  }

  // ---------------------------------------------------------------------
  // Transaction plumbing (mirrors ../engine.ts's private helpers, adapted
  // to this ERD's table list; `post()` below is this engine's one addition
  // — the doc's actual double-entry posting primitive).
  // ---------------------------------------------------------------------

  private beginTx(actionId: string, actionLabel: string, actor: ActorRole, actorName: string): void {
    this.tx = {
      transactionId: this.ids.next('OP'),
      actionId,
      actionLabel,
      actor,
      actorName,
      timestamp: this.clock(),
      steps: [],
      mutations: [],
      events: [],
      auditEntries: [],
      moneyFlows: [],
      affectedTables: new Set(),
      isAssumedRule: false,
    };
  }

  private commitTx(): LedgerActionExecutionResult {
    const tx = this.tx;
    if (!tx) throw new Error('No active transaction to commit.');
    this.tx = null;
    return {
      success: true,
      transactionId: tx.transactionId,
      actionId: tx.actionId,
      actionLabel: tx.actionLabel,
      actor: tx.actor,
      actorName: tx.actorName,
      timestamp: tx.timestamp,
      steps: tx.steps,
      mutations: tx.mutations,
      events: tx.events,
      auditEntries: tx.auditEntries,
      affectedTables: Array.from(tx.affectedTables),
      moneyFlows: tx.moneyFlows,
      isAssumedRule: tx.isAssumedRule,
    };
  }

  private abortTx(err: unknown): LedgerActionValidationError {
    const tx = this.tx;
    this.tx = null;
    const reason = err instanceof ValidationError ? err.reason : err instanceof Error ? err.message : String(err);
    return { success: false, actionId: tx?.actionId ?? 'unknown', actionLabel: tx?.actionLabel ?? 'unknown', actor: tx?.actor ?? 'System', reason, relatedIds: {}, timestamp: tx?.timestamp ?? this.clock() };
  }

  private step(actor: ActorRole, title: string, description: string, fn: () => void): void {
    const tx = this.tx;
    if (!tx) throw new Error('No active transaction.');
    const mutStart = tx.mutations.length;
    const evStart = tx.events.length;
    fn();
    tx.steps.push({ order: tx.steps.length + 1, actor, title, description, mutations: tx.mutations.slice(mutStart), events: tx.events.slice(evStart) });
  }

  private insert<T extends { id: ID }>(table: LedgerTableName, record: T): T {
    const tx = this.tx;
    if (!tx) throw new Error('No active transaction.');
    const key = LEDGER_TABLE_STATE_KEY[table];
    (this.state[key] as unknown as Record<string, T>)[record.id] = record;
    tx.mutations.push({ table, op: 'INSERT', recordId: record.id, before: null, after: clone(record) as unknown as Record<string, unknown> });
    tx.affectedTables.add(table);
    return record;
  }

  private update<T extends { id: ID }>(table: LedgerTableName, id: ID, patch: Partial<T>): T {
    const tx = this.tx;
    if (!tx) throw new Error('No active transaction.');
    const key = LEDGER_TABLE_STATE_KEY[table];
    const bucket = this.state[key] as unknown as Record<string, T>;
    const existing = bucket[id];
    if (!existing) throw new Error(`Record not found: ${table}/${id}`);
    const before = clone(existing);
    Object.assign(existing as object, patch);
    tx.mutations.push({ table, op: 'UPDATE', recordId: id, before: before as unknown as Record<string, unknown>, after: clone(existing) as unknown as Record<string, unknown> });
    tx.affectedTables.add(table);
    return existing;
  }

  private emitEvent(type: LedgerDomainEventType, payload: Record<string, unknown>): void {
    const tx = this.tx;
    if (!tx) throw new Error('No active transaction.');
    const event: LedgerDomainEvent = { id: this.ids.next('EVT'), type, timestamp: this.clock(), transactionId: tx.transactionId, payload };
    tx.events.push(event);
    this.state.events.push(event);
  }

  private audit(message: string, relatedIds: Record<string, ID> = {}): void {
    const tx = this.tx;
    if (!tx) throw new Error('No active transaction.');
    const entry: AuditLogEntry = { id: this.ids.next('AUD'), timestamp: this.clock(), transactionId: tx.transactionId, actor: tx.actor, actorName: tx.actorName, actionId: tx.actionId, actionLabel: tx.actionLabel, message, relatedIds };
    tx.auditEntries.push(entry);
    tx.affectedTables.add('audit_log');
    this.state.auditLog.push(entry);
  }

  private moneyFlow(kind: MoneyFlowKind, amount: number, from: MoneyFlowParty, to: MoneyFlowParty, status: 'Completed' | 'Failed' = 'Completed'): void {
    const tx = this.tx;
    if (!tx) throw new Error('No active transaction.');
    if (amount <= 0) return;
    tx.moneyFlows.push({ id: this.ids.next('MF'), kind, amount, currency: 'EGP', from, to, status });
  }

  /**
   * doc §6/§7/§2.7 — the one primitive every action funnels through: post
   * one balanced FinanceTransaction. `sourceEventId` is the idempotency
   * guard — a second post with the same id is a no-op, returning the
   * original transaction untouched (see `deliverShipmentIdempotently`-style
   * tests in engine.test.ts).
   */
  private post(
    type: FinanceTransactionType,
    sourceEventId: string,
    memo: string,
    lines: PostedLine[],
    meta: { shipmentId?: ID; sellerId?: ID; courierId?: ID; hubId?: ID; referenceType?: FinanceTransaction['referenceType']; referenceId?: ID } = {},
  ): FinanceTransaction {
    const existing = Object.values(this.state.financeTransactions).find((t) => t.sourceEventId === sourceEventId);
    if (existing) {
      this.audit(`(idempotent no-op) ${sourceEventId} already posted as ${existing.id}.`, {});
      return existing;
    }
    const totalDebit = lines.reduce((s, l) => s + (l.direction === 'Debit' ? l.amount : 0), 0);
    const totalCredit = lines.reduce((s, l) => s + (l.direction === 'Credit' ? l.amount : 0), 0);
    if (totalDebit !== totalCredit) {
      throw new ValidationError(`Unbalanced posting for ${type}: debits ${totalDebit} ≠ credits ${totalCredit}.`, {});
    }
    const now = this.clock();
    const transaction = this.insert<FinanceTransaction>('finance_transactions', {
      id: this.ids.next('TX'),
      type,
      sourceEventId,
      shipmentId: meta.shipmentId ?? null,
      sellerId: meta.sellerId ?? null,
      courierId: meta.courierId ?? null,
      hubId: meta.hubId ?? null,
      referenceType: meta.referenceType ?? null,
      referenceId: meta.referenceId ?? null,
      status: 'Posted',
      effectiveAt: now,
      createdAt: now,
      memo,
      createdBy: this.tx?.actorName ?? 'system',
    });
    for (const line of lines) {
      if (line.amount <= 0) continue;
      this.insert<FinanceEntry>('finance_entries', {
        id: this.ids.next('FE'),
        transactionId: transaction.id,
        accountId: line.accountId,
        direction: line.direction,
        amount: line.amount,
        lineType: line.lineType,
        memo: line.memo ?? memo,
      });
    }
    this.emitEvent('TransactionPosted', { transactionId: transaction.id, type, lines: lines.length });
    this.audit(`${transaction.id} ${type} posted: ${memo}`, { transactionId: transaction.id });
    return transaction;
  }

  /** A positive net credits `accountId`; a negative net debits it instead —
   * doc §50.1's "Careful" box: the Ledger only ever sees positive amounts. */
  private netLine(accountId: ID, net: number, lineType: string): PostedLine | null {
    if (net === 0) return null;
    return net > 0 ? { accountId, direction: 'Credit', amount: net, lineType } : { accountId, direction: 'Debit', amount: -net, lineType };
  }

  // ---------------------------------------------------------------------
  // Public entry point
  // ---------------------------------------------------------------------

  execute(actionId: LedgerActionId, input: Record<string, unknown>): LedgerActionOutcome {
    this.beginTx(actionId, ACTION_LABELS[actionId], 'FinanceOperator', 'Finance Operator');
    try {
      switch (actionId) {
        case 'deliverShipment':
          this.tx!.actor = 'Courier';
          this.doDeliverShipment(input as { shipmentId: ID });
          break;
        case 'processReplacement':
          this.tx!.actor = 'Courier';
          this.doProcessReplacement(input as { shipmentId: ID; subOutcome?: 'ReplacementCleanSwap' | 'ReplacementTotalRefusal' });
          break;
        case 'startCourierReconciliation':
          this.doStartCourierReconciliation(input as { courierId: ID; actualCash: number });
          break;
        case 'depositToBank':
          this.doDepositToBank(input as { hubId: ID });
          break;
        case 'calculateSellerSettlement':
          this.doCalculateSellerSettlement(input as { merchantId: ID });
          break;
        case 'calculateCourierSettlement':
          this.doCalculateCourierSettlement(input as { courierId: ID });
          break;
        case 'executePayout':
          this.doAttemptPayout(input as { party: SettlementPartyType; settlementId: ID; simulateFailure?: boolean }, false);
          break;
        case 'retryPayout':
          this.doAttemptPayout(input as { party: SettlementPartyType; settlementId: ID; simulateFailure?: boolean }, true);
          break;
        case 'recordExpense':
          this.doRecordExpense(
            input as { type: 'Fuel' | 'VehicleMaintenance' | 'Rent' | 'Utilities' | 'CustomerCompensation'; attributedToId?: ID; amount: number; paidBy: 'Company' | 'CourierReimbursable'; description?: string },
          );
          break;
        case 'recordRevenue':
          this.doRecordRevenue(input as { amount: number; notes?: string });
          break;
        default:
          throw new ValidationError(`Unknown action: ${actionId as string}`);
      }
      return this.commitTx();
    } catch (err) {
      return this.abortTx(err);
    }
  }

  private requireShipment(shipmentId: ID): LedgerShipment {
    const shipment = this.state.shipments[shipmentId];
    if (!shipment) throw new ValidationError(`Shipment ${shipmentId} does not exist.`, {});
    return shipment;
  }

  private requireMerchant(merchantId: ID): Merchant {
    const merchant = this.state.merchants[merchantId];
    if (!merchant) throw new ValidationError(`Merchant ${merchantId} does not exist.`, {});
    return merchant;
  }

  private requireCourier(courierId: ID): Courier {
    const courier = this.state.couriers[courierId];
    if (!courier) throw new ValidationError(`Courier ${courierId} does not exist.`, {});
    return courier;
  }

  private requirePricing(merchantId: ID): MerchantPricingConfig {
    const pricing = this.state.merchantPricingConfigs[merchantId];
    if (!pricing) throw new ValidationError(`No pricing configuration for merchant ${merchantId}.`, {});
    return pricing;
  }

  // ---------------------------------------------------------------------
  // Shipment events (doc §6.2.A) — DeliveryOutcomeRecorded / ReplacementRecorded
  // ---------------------------------------------------------------------

  private doDeliverShipment(input: { shipmentId: ID }): void {
    const shipment = this.requireShipment(input.shipmentId);
    if (shipment.serviceType !== 'COD') throw new ValidationError(`Shipment ${shipment.waybill} is a Replacement-service shipment.`, {});
    if (shipment.status !== 'OutForDelivery') throw new ValidationError(`Shipment ${shipment.waybill} is not Out For Delivery.`, {});
    const courier = this.requireCourier(shipment.courierId);
    const merchant = this.requireMerchant(shipment.merchantId);
    const pricing = this.requirePricing(merchant.id);
    this.tx!.actorName = courier.name;

    const codCollected = shipment.codAmount;
    const sellerFee = pricing.codDeliveryFee;
    const courierEarning = pricing.codDeliveryCommission;

    this.step('Courier', 'Courier confirms delivery', `${courier.name} confirms delivery of ${shipment.waybill}; the customer pays ${codCollected} EGP cash.`, () => {
      this.audit(`Courier ${courier.name} delivered ${shipment.waybill}, collected ${codCollected} EGP.`, { shipmentId: shipment.id });
    });

    this.step('System', 'Resolve fee & commission (Pricing Snapshot)', `Resolves ${merchant.name}'s pricing: seller fee ${sellerFee} EGP, courier commission ${courierEarning} EGP — snapshotted onto this event, doc §14.4.`, () => {
      this.audit(`Resolved seller fee (${sellerFee} EGP) and courier earning (${courierEarning} EGP).`, { merchantId: merchant.id });
    });

    this.step('System', 'Post DELIVERY_POSTED', 'One balanced FinanceTransaction — the same event Operations and Finance both react to (doc §14.1).', () => {
      this.update<LedgerShipment>('shipments', shipment.id, { status: 'Delivered', deliveredAt: this.clock() });
      const lines: PostedLine[] = [
        { accountId: courierCashAccountCode(courier.id), direction: 'Debit', amount: codCollected, lineType: 'COD' },
        { accountId: EXP_COURIER, direction: 'Debit', amount: courierEarning, lineType: 'COURIER_EARNING' },
      ];
      const sellerNet = this.netLine(sellerPayableAccountCode(merchant.id), codCollected - sellerFee, 'SELLER_NET');
      if (sellerNet) lines.push(sellerNet);
      if (sellerFee > 0) lines.push({ accountId: REV_SHIPPING, direction: 'Credit', amount: sellerFee, lineType: 'SELLER_FEE' });
      if (courierEarning > 0) lines.push({ accountId: courierPayableAccountCode(courier.id), direction: 'Credit', amount: courierEarning, lineType: 'COURIER_EARNING' });
      this.post('DELIVERY_POSTED', `EVT-deliver-${shipment.id}`, `${courier.name} delivered ${shipment.waybill}: COD ${codCollected}, fee ${sellerFee}, commission ${courierEarning}.`, lines, {
        shipmentId: shipment.id,
        sellerId: merchant.id,
        courierId: courier.id,
        hubId: shipment.hubId,
      });
      this.emitEvent('ShipmentDelivered', { shipmentId: shipment.id, codCollected });
    });

    this.moneyFlow('CODCollection', codCollected, { type: 'Customer', id: null, label: 'Customer' }, { type: 'Courier', id: courier.id, label: courier.name });
    this.moneyFlow('FeeRecognition', sellerFee, { type: 'Merchant', id: merchant.id, label: merchant.name }, { type: 'CompanyAccount', id: null, label: 'Company' });
    this.moneyFlow('CommissionRecognition', courierEarning, { type: 'CompanyAccount', id: null, label: 'Company' }, { type: 'Courier', id: courier.id, label: courier.name });
  }

  private doProcessReplacement(input: { shipmentId: ID; subOutcome?: 'ReplacementCleanSwap' | 'ReplacementTotalRefusal' }): void {
    const shipment = this.requireShipment(input.shipmentId);
    if (shipment.serviceType !== 'Replacement') throw new ValidationError(`Shipment ${shipment.waybill} is not a Replacement-service shipment.`, {});
    if (shipment.status !== 'OutForDelivery') throw new ValidationError(`Shipment ${shipment.waybill} is not Out For Delivery.`, {});
    const courier = this.requireCourier(shipment.courierId);
    const merchant = this.requireMerchant(shipment.merchantId);
    const pricing = this.requirePricing(merchant.id);
    this.tx!.actorName = courier.name;

    let collected = 0;
    let refund = 0;
    if (shipment.settlementDirection === 'Collect') collected = shipment.settlementAmount;
    else if (shipment.settlementDirection === 'Refund') refund = shipment.settlementAmount;

    const fee = pricing.exchangeFee;
    const isTotalRefusal = input.subOutcome === 'ReplacementTotalRefusal';
    const earning = isTotalRefusal ? 0 : pricing.exchangeCommission;

    this.step('Courier', 'Courier completes replacement', `${courier.name} completes the replacement for ${shipment.waybill}.${refund > 0 ? ` Pays ${refund} EGP refund out of COD cash already in hand — doc §28: not a separate company payment.` : ''}`, () => {
      this.audit(`Courier ${courier.name} completed replacement for ${shipment.waybill}.`, { shipmentId: shipment.id });
    });

    this.step('System', 'Post REPLACEMENT_POSTED', 'Seller bears the refund and the fee as two separate lines (doc §18.2 — kept apart deliberately, for clean statements).', () => {
      this.update<LedgerShipment>('shipments', shipment.id, { status: 'Replaced' });
      const sellerPayable = sellerPayableAccountCode(merchant.id);
      const courierCash = courierCashAccountCode(courier.id);
      const lines: PostedLine[] = [];
      if (refund > 0) {
        lines.push({ accountId: sellerPayable, direction: 'Debit', amount: refund, lineType: 'REFUND', memo: 'Seller bears the refund' });
        lines.push({ accountId: courierCash, direction: 'Credit', amount: refund, lineType: 'REFUND', memo: 'Cash left the courier’s pocket' });
      }
      if (collected > 0) {
        lines.push({ accountId: courierCash, direction: 'Debit', amount: collected, lineType: 'CUSTOMER_EXTRA_PAYMENT' });
        lines.push({ accountId: sellerPayable, direction: 'Credit', amount: collected, lineType: 'CUSTOMER_EXTRA_PAYMENT' });
      }
      if (fee > 0) {
        lines.push({ accountId: sellerPayable, direction: 'Debit', amount: fee, lineType: 'SELLER_FEE', memo: 'Replacement fee' });
        lines.push({ accountId: REV_REPLACEMENT, direction: 'Credit', amount: fee, lineType: 'SELLER_FEE' });
      }
      if (earning > 0) {
        lines.push({ accountId: EXP_COURIER, direction: 'Debit', amount: earning, lineType: 'COURIER_EARNING' });
        lines.push({ accountId: courierPayableAccountCode(courier.id), direction: 'Credit', amount: earning, lineType: 'COURIER_EARNING' });
      }
      this.post('REPLACEMENT_POSTED', `EVT-replace-${shipment.id}`, `${courier.name} replaced ${shipment.waybill}: refund ${refund}, fee ${fee}, commission ${earning}.`, lines, {
        shipmentId: shipment.id,
        sellerId: merchant.id,
        courierId: courier.id,
        hubId: shipment.hubId,
      });
    });

    if (refund > 0) this.moneyFlow('RefundPayout', refund, { type: 'Courier', id: courier.id, label: courier.name }, { type: 'Customer', id: null, label: 'Customer' });
    if (collected > 0) this.moneyFlow('CODCollection', collected, { type: 'Customer', id: null, label: 'Customer' }, { type: 'Courier', id: courier.id, label: courier.name });
    this.moneyFlow('FeeRecognition', fee, { type: 'Merchant', id: merchant.id, label: merchant.name }, { type: 'CompanyAccount', id: null, label: 'Company' });
    this.moneyFlow('CommissionRecognition', earning, { type: 'CompanyAccount', id: null, label: 'Company' }, { type: 'Courier', id: courier.id, label: courier.name });
  }

  // ---------------------------------------------------------------------
  // Courier Cash Reconciliation (doc §8, §19) — Preview -> Start -> Count ->
  // Confirm, all narrated inside one call (the guided story's single stage).
  // ---------------------------------------------------------------------

  private doStartCourierReconciliation(input: { courierId: ID; actualCash: number }): void {
    const courier = this.requireCourier(input.courierId);
    this.tx!.actorName = 'Mohamed (Hub Employee)';

    const cashAccountId = courierCashAccountCode(courier.id);
    const expectedCash = getAccountBalance(this.state, cashAccountId);
    if (expectedCash <= 0) throw new ValidationError(`${courier.name} has no cash to reconcile.`, {});

    const unclaimedTxIds = new Set(Object.values(this.state.financeEntries).filter((e) => e.accountId === cashAccountId).map((e) => e.transactionId));
    for (const line of Object.values(this.state.courierReconciliationLines)) unclaimedTxIds.delete(line.financeTransactionId);
    const claimable = Array.from(unclaimedTxIds)
      .map((id) => this.state.financeTransactions[id])
      .filter((t): t is FinanceTransaction => Boolean(t));

    this.step('FinanceOperator', 'Preview reconciliation totals (GET only)', `Expected cash = the current balance of ${cashAccountId} = ${expectedCash} EGP across ${claimable.length} transaction(s). Nothing recorded yet (doc §19.2).`, () => {
      this.audit(`Previewed reconciliation for ${courier.name}: expected ${expectedCash} EGP.`, { courierId: courier.id });
    });

    let recon!: CourierReconciliation;
    this.step('FinanceOperator', 'Start Reconciliation', 'Freezes the claimable transactions into this reconciliation — still no Ledger transaction; the cash hasn’t moved yet (doc §19.3).', () => {
      recon = this.insert<CourierReconciliation>('courier_reconciliations', {
        id: this.ids.next('REC'),
        courierId: courier.id,
        hubId: courier.hubId,
        businessDate: this.clock(),
        expectedCash,
        actualCash: null,
        variance: null,
        status: 'Open',
        financeTransactionId: null,
        openedBy: 'Mohamed (Hub Employee)',
        countedBy: null,
        createdAt: this.clock(),
        closedAt: null,
        notes: null,
      });
      for (const t of claimable) {
        const cashEffect = Object.values(this.state.financeEntries)
          .filter((e) => e.transactionId === t.id && e.accountId === cashAccountId)
          .reduce((sum, e) => sum + (e.direction === 'Debit' ? e.amount : -e.amount), 0);
        this.insert<CourierReconciliationLine>('courier_reconciliation_lines', { id: this.ids.next('RECL'), reconciliationId: recon.id, shipmentId: t.shipmentId ?? '', financeTransactionId: t.id, cashEffect });
      }
      this.audit(`Reconciliation ${recon.id} opened for ${courier.name}: expected ${expectedCash} EGP across ${claimable.length} shipment(s).`, { reconciliationId: recon.id });
    });

    const variance = input.actualCash - expectedCash;
    const status: CourierReconciliation['status'] = variance === 0 ? 'Matched' : variance < 0 ? 'Short' : 'Over';

    this.step('FinanceOperator', 'Count & Confirm Handover', `Mohamed counts ${input.actualCash} EGP (variance ${variance}). Posts COURIER_CASH_HANDOVER for the actual amount received (doc §19.4-19.6 — never for the expected amount).`, () => {
      this.update<CourierReconciliation>('courier_reconciliations', recon.id, { actualCash: input.actualCash, variance, status, countedBy: 'Mohamed (Hub Employee)', closedAt: this.clock() });
      const hubCash = hubCashAccountCode(courier.hubId);
      const lines: PostedLine[] = [{ accountId: hubCash, direction: 'Debit', amount: input.actualCash, lineType: 'CASH_HANDOVER' }];
      if (variance > 0) {
        lines.push({ accountId: cashAccountId, direction: 'Credit', amount: expectedCash, lineType: 'CASH_HANDOVER' });
        lines.push({ accountId: CASH_SUSPENSE, direction: 'Credit', amount: variance, lineType: 'OVERAGE' });
      } else {
        // Matched or Short: credit exactly what was actually received —
        // any shortfall stays on the courier's own cash-custody balance
        // (doc §19.5), to be picked up by the next reconciliation.
        lines.push({ accountId: cashAccountId, direction: 'Credit', amount: input.actualCash, lineType: 'CASH_HANDOVER' });
      }
      const transaction = this.post('COURIER_CASH_HANDOVER', `EVT-handover-${recon.id}`, `${courier.name} handed over ${input.actualCash} EGP to ${courier.hubId} (expected ${expectedCash}, ${status}).`, lines, {
        courierId: courier.id,
        hubId: courier.hubId,
        referenceType: 'Reconciliation',
        referenceId: recon.id,
      });
      this.update<CourierReconciliation>('courier_reconciliations', recon.id, { financeTransactionId: transaction.id });
    });

    this.moneyFlow('CashHandover', input.actualCash, { type: 'Courier', id: courier.id, label: courier.name }, { type: 'CompanyAccount', id: courier.hubId, label: 'Hub Cash Office' });
  }

  // ---------------------------------------------------------------------
  // Cash Deposits (doc §9, §20) — the hub safe sweeps to the bank. Without
  // this step, settlements/payouts would credit bank:main with money that
  // was never actually deposited into it.
  // ---------------------------------------------------------------------

  private doDepositToBank(input: { hubId: ID }): void {
    const hub = this.state.hubs[input.hubId];
    if (!hub) throw new ValidationError(`Hub ${input.hubId} does not exist.`, {});
    this.tx!.actorName = 'Mohamed (Hub Employee)';

    const hubCashAccount = hubCashAccountCode(hub.id);
    const amount = getAccountBalance(this.state, hubCashAccount);
    if (!(amount > 0)) throw new ValidationError(`${hub.name}'s safe has no cash to deposit.`, {});

    let deposit!: CashDeposit;
    this.step('FinanceOperator', 'Deposit to bank', `Mohamed deposits everything in ${hub.name}'s safe — ${amount} EGP — into the company bank account (doc §20).`, () => {
      deposit = this.insert<CashDeposit>('cash_deposits', {
        id: this.ids.next('DEP'),
        hubId: hub.id,
        amount,
        bankAccountCode: BANK_MAIN,
        bankReference: `BANK-${this.ids.next('REF')}`,
        depositedBy: 'Mohamed (Hub Employee)',
        status: 'Confirmed',
        financeTransactionId: null,
        depositedAt: this.clock(),
        confirmedAt: this.clock(),
      });
      const transaction = this.post(
        'HUB_BANK_DEPOSIT',
        `EVT-deposit-${deposit.id}`,
        `Deposited ${amount} EGP from ${hub.name}'s safe to the company bank account.`,
        [
          { accountId: BANK_MAIN, direction: 'Debit', amount, lineType: 'BANK_DEPOSIT' },
          { accountId: hubCashAccount, direction: 'Credit', amount, lineType: 'BANK_DEPOSIT' },
        ],
        { hubId: hub.id, referenceType: 'CashDeposit', referenceId: deposit.id },
      );
      this.update<CashDeposit>('cash_deposits', deposit.id, { financeTransactionId: transaction.id });
    });

    this.moneyFlow('CashHandover', amount, { type: 'CompanyAccount', id: hub.id, label: `${hub.name} Safe` }, { type: 'CompanyAccount', id: null, label: 'Company Bank' });
  }

  // ---------------------------------------------------------------------
  // Settlements (doc §10) — collect Transactions, compute nothing new.
  // ---------------------------------------------------------------------

  private unclaimedTransactionsFor(accountId: ID, partyType: SettlementPartyType): FinanceTransaction[] {
    const touching = new Set(Object.values(this.state.financeEntries).filter((e) => e.accountId === accountId).map((e) => e.transactionId));
    for (const line of Object.values(this.state.settlementLines)) {
      if (this.state.settlements[line.settlementId]?.partyType === partyType) touching.delete(line.financeTransactionId);
    }
    return Array.from(touching)
      .map((id) => this.state.financeTransactions[id])
      .filter((t): t is FinanceTransaction => Boolean(t));
  }

  private netEffect(transactionId: ID, accountId: ID): number {
    return Object.values(this.state.financeEntries)
      .filter((e) => e.transactionId === transactionId && e.accountId === accountId)
      .reduce((sum, e) => sum + (e.direction === 'Credit' ? e.amount : -e.amount), 0);
  }

  private doCalculateSellerSettlement(input: { merchantId: ID }): void {
    const merchant = this.requireMerchant(input.merchantId);
    const accountId = sellerPayableAccountCode(merchant.id);
    const claimable = this.unclaimedTransactionsFor(accountId, 'Seller');
    if (claimable.length === 0) throw new ValidationError(`${merchant.name} has no unsettled transactions.`, {});

    let gross = 0;
    let deductions = 0;
    for (const t of claimable) {
      const effect = this.netEffect(t.id, accountId);
      if (effect >= 0) gross += effect;
      else deductions += -effect;
    }
    const net = gross - deductions;
    const balanceCheck = getAccountBalance(this.state, accountId);

    let settlement!: Settlement;
    this.step('FinanceOperator', 'Calculate & Save Settlement', `Query: every Posted transaction touching ${accountId} with no existing Settlement Line (doc §10.2's query, verbatim). Net = ${net} EGP, matching the account balance ${balanceCheck} EGP.`, () => {
      settlement = this.insert<Settlement>('settlements', {
        id: this.ids.next('SET-S'),
        partyType: 'Seller',
        partyId: merchant.id,
        accountId,
        gross,
        deductions,
        net,
        status: net < 0 ? 'Negative' : 'Calculated',
        calculatedBy: 'Sara (Accountant)',
        approvedBy: null,
        createdAt: this.clock(),
        approvedAt: null,
      });
      for (const t of claimable) {
        this.insert<SettlementLine>('settlement_lines', { id: this.ids.next('SETL'), settlementId: settlement.id, financeTransactionId: t.id, shipmentId: t.shipmentId, lineType: t.type, amount: this.netEffect(t.id, accountId) });
      }
      this.emitEvent('SettlementCalculated', { settlementId: settlement.id, partyType: 'Seller', net });
      this.audit(`Settlement ${settlement.id} calculated for ${merchant.name}: net ${net} EGP (gross ${gross}, deductions ${deductions}).`, { settlementId: settlement.id });
    });

    this.step('FinanceOperator', 'Approve Settlement', 'A different person reviews and approves (Maker-Checker, doc §10.1) — the Ledger balance is unchanged; nothing has been paid yet.', () => {
      this.update<Settlement>('settlements', settlement.id, { status: settlement.status === 'Negative' ? 'Negative' : 'Approved', approvedBy: 'Finance Manager', approvedAt: this.clock() });
      this.audit(`Settlement ${settlement.id} approved by Finance Manager.`, { settlementId: settlement.id });
    });
  }

  private doCalculateCourierSettlement(input: { courierId: ID }): void {
    const courier = this.requireCourier(input.courierId);
    const accountId = courierPayableAccountCode(courier.id);
    const claimable = this.unclaimedTransactionsFor(accountId, 'Courier');
    if (claimable.length === 0) throw new ValidationError(`${courier.name} has no unsettled transactions.`, {});

    let gross = 0;
    let deductions = 0;
    for (const t of claimable) {
      const effect = this.netEffect(t.id, accountId);
      if (effect >= 0) gross += effect;
      else deductions += -effect;
    }
    const net = gross - deductions;

    let settlement!: Settlement;
    this.step('FinanceOperator', 'Calculate & Save Settlement', `Every Posted transaction touching ${accountId} with no existing Settlement Line. Net = ${net} EGP.`, () => {
      settlement = this.insert<Settlement>('settlements', {
        id: this.ids.next('SET-C'),
        partyType: 'Courier',
        partyId: courier.id,
        accountId,
        gross,
        deductions,
        net,
        status: net < 0 ? 'Negative' : 'Calculated',
        calculatedBy: 'Sara (Accountant)',
        approvedBy: null,
        createdAt: this.clock(),
        approvedAt: null,
      });
      for (const t of claimable) {
        this.insert<SettlementLine>('settlement_lines', { id: this.ids.next('SETL'), settlementId: settlement.id, financeTransactionId: t.id, shipmentId: t.shipmentId, lineType: t.type, amount: this.netEffect(t.id, accountId) });
      }
      this.emitEvent('SettlementCalculated', { settlementId: settlement.id, partyType: 'Courier', net });
      this.audit(`Settlement ${settlement.id} calculated for ${courier.name}: net ${net} EGP.`, { settlementId: settlement.id });
    });

    this.step('FinanceOperator', 'Approve Settlement', 'Maker-Checker: a different person approves before any Payout can reference this settlement.', () => {
      this.update<Settlement>('settlements', settlement.id, { status: settlement.status === 'Negative' ? 'Negative' : 'Approved', approvedBy: 'Finance Manager', approvedAt: this.clock() });
      this.audit(`Settlement ${settlement.id} approved by Finance Manager.`, { settlementId: settlement.id });
    });
  }

  // ---------------------------------------------------------------------
  // Payouts (doc §12) — only a successful attempt touches the Ledger.
  // ---------------------------------------------------------------------

  private doAttemptPayout(input: { party: SettlementPartyType; settlementId: ID; simulateFailure?: boolean }, isRetry: boolean): void {
    const settlement = this.state.settlements[input.settlementId];
    if (!settlement) throw new ValidationError(`Settlement ${input.settlementId} does not exist.`, {});
    if (settlement.status === 'Paid') throw new ValidationError(`Settlement ${input.settlementId} is already Paid.`, {});

    const priorAttempts = Object.values(this.state.payouts).filter((p) => p.settlementId === settlement.id).sort((a, b) => a.id.localeCompare(b.id));
    const latest = priorAttempts.at(-1);
    if (isRetry && (!latest || latest.status !== 'Failed')) throw new ValidationError(`Settlement ${input.settlementId} has no Failed payout to retry.`, {});
    if (!isRetry && latest) throw new ValidationError(`Settlement ${input.settlementId} already has a payout attempt.`, {});

    const partyRecord = input.party === 'Seller' ? this.state.merchants[settlement.partyId] : this.state.couriers[settlement.partyId];
    const partyLabel = partyRecord?.name ?? settlement.partyId;
    const failed = Boolean(input.simulateFailure);
    const attemptNumber = priorAttempts.length + 1;

    let payout!: Payout;
    this.step('FinanceOperator', isRetry ? 'Retry Payout' : 'Execute Payout', `${isRetry ? 'Retries' : 'Attempts'} paying ${settlement.net} EGP to ${partyLabel} (attempt #${attemptNumber}). A failed attempt posts nothing to the Ledger (doc §33.1).`, () => {
      payout = this.insert<Payout>('payouts', {
        id: this.ids.next('PAY'),
        settlementId: settlement.id,
        payeeType: input.party,
        payeeId: settlement.partyId,
        amount: settlement.net,
        method: 'BankTransfer',
        bankReference: failed ? null : `BANK-${this.ids.next('REF')}`,
        status: failed ? 'Failed' : 'Paid',
        failureReason: failed ? 'Bank transfer rejected (simulated failure).' : null,
        financeTransactionId: null,
        initiatedAt: this.clock(),
        confirmedAt: failed ? null : this.clock(),
      });
      if (failed) {
        this.update<Settlement>('settlements', settlement.id, { status: 'Failed' });
        this.audit(`Payout ${payout.id} attempt #${attemptNumber} for ${settlement.id} failed: ${payout.failureReason}`, { settlementId: settlement.id });
        return;
      }
      const transaction = this.post(
        input.party === 'Seller' ? 'SELLER_PAYOUT' : 'COURIER_PAYOUT',
        `EVT-payout-${settlement.id}-attempt-${attemptNumber}`,
        `Paid ${settlement.net} EGP to ${partyLabel} for settlement ${settlement.id}.`,
        [
          { accountId: settlement.accountId, direction: 'Debit', amount: settlement.net, lineType: 'SETTLEMENT_PAYOUT' },
          { accountId: BANK_MAIN, direction: 'Credit', amount: settlement.net, lineType: 'SETTLEMENT_PAYOUT' },
        ],
        { sellerId: input.party === 'Seller' ? settlement.partyId : undefined, courierId: input.party === 'Courier' ? settlement.partyId : undefined, referenceType: 'Payout', referenceId: payout.id },
      );
      this.update<Payout>('payouts', payout.id, { financeTransactionId: transaction.id });
      this.update<Settlement>('settlements', settlement.id, { status: 'Paid' });
      this.emitEvent('PayoutAttempted', { payoutId: payout.id, settlementId: settlement.id, status: 'Paid' });
      this.audit(`Payout ${payout.id} attempt #${attemptNumber} for ${settlement.id} succeeded (${transaction.id}).`, { settlementId: settlement.id, payoutId: payout.id });
    });

    this.moneyFlow('SettlementPayout', settlement.net, { type: 'CompanyAccount', id: null, label: 'Company' }, { type: input.party === 'Seller' ? 'Merchant' : 'Courier', id: settlement.partyId, label: partyLabel }, failed ? 'Failed' : 'Completed');
  }

  // ---------------------------------------------------------------------
  // Company expenses & revenue (doc §32.3, extended: doc's own account
  // list already has expense:rent/utilities/fuel/maintenance/other and
  // revenue:other — OTHER_REVENUE_RECEIVED is this engine's one addition,
  // trivially inferable from that same account list and the doc's own
  // "money entered an Asset -> Debit it" pattern).
  // ---------------------------------------------------------------------

  private static EXPENSE_ACCOUNTS: Record<'Fuel' | 'VehicleMaintenance' | 'Rent' | 'Utilities' | 'CustomerCompensation', string> = {
    Fuel: EXP_FUEL,
    VehicleMaintenance: EXP_MAINTENANCE,
    Rent: EXP_RENT,
    Utilities: EXP_UTILITIES,
    CustomerCompensation: EXP_COMPENSATION,
  };

  private doRecordExpense(input: { type: 'Fuel' | 'VehicleMaintenance' | 'Rent' | 'Utilities' | 'CustomerCompensation'; attributedToId?: ID; amount: number; paidBy: 'Company' | 'CourierReimbursable'; description?: string }): void {
    if (!(input.amount > 0)) throw new ValidationError('Amount must be greater than zero.', {});
    const expenseAccount = LedgerEngine.EXPENSE_ACCOUNTS[input.type];
    const creditAccount = input.paidBy === 'CourierReimbursable' && input.attributedToId ? courierPayableAccountCode(input.attributedToId) : BANK_MAIN;
    const memo = input.description ?? `${input.type} expense`;

    this.step(
      'FinanceOperator',
      'Post EXPENSE_PAID',
      input.paidBy === 'Company' ? `Paid directly from the company bank account. ${memo}` : `${this.state.couriers[input.attributedToId ?? '']?.name ?? 'The courier'} fronted it — the company now owes it back (doc §5.2's courier payable account covers reimbursements too).`,
      () => {
        this.post('EXPENSE_PAID', `EVT-expense-${this.ids.next('EXP')}`, memo, [
          { accountId: expenseAccount, direction: 'Debit', amount: input.amount, lineType: 'EXPENSE' },
          { accountId: creditAccount, direction: 'Credit', amount: input.amount, lineType: 'EXPENSE' },
        ]);
      },
    );

    if (input.paidBy === 'Company') {
      this.moneyFlow('ExpensePayment', input.amount, { type: 'CompanyAccount', id: null, label: 'Company' }, { type: 'Vendor', id: null, label: memo });
    } else {
      this.moneyFlow('ExpensePayment', input.amount, { type: 'Courier', id: input.attributedToId ?? null, label: this.state.couriers[input.attributedToId ?? '']?.name ?? 'Courier' }, { type: 'Vendor', id: null, label: 'Vendor' });
    }
  }

  private doRecordRevenue(input: { amount: number; notes?: string }): void {
    if (!(input.amount > 0)) throw new ValidationError('Amount must be greater than zero.', {});
    this.step('FinanceOperator', 'Post OTHER_REVENUE_RECEIVED', `Records ${input.amount} EGP of other revenue, not tied to any shipment. ${input.notes ?? ''}`, () => {
      this.post('OTHER_REVENUE_RECEIVED', `EVT-revenue-${this.ids.next('REV')}`, input.notes ?? 'Other revenue', [
        { accountId: BANK_MAIN, direction: 'Debit', amount: input.amount, lineType: 'REVENUE' },
        { accountId: REV_OTHER, direction: 'Credit', amount: input.amount, lineType: 'REVENUE' },
      ]);
    });
    this.moneyFlow('RevenueReceipt', input.amount, { type: 'Vendor', id: null, label: 'Buyer' }, { type: 'CompanyAccount', id: null, label: 'Company' });
  }
}
