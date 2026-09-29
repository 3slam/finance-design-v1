import type { ActionId } from './actions.js';
import { getActionDefinition } from './actions.js';
import { computePeriodRollup as computePeriodRollupCalc, signedCourierAdjustment, signedSellerAdjustment } from './calculations.js';
import type {
  ActionExecutionResult,
  ActionOutcome,
  ActionStep,
  ActionValidationError,
  ActorRole,
  Advance,
  AdvanceMovement,
  AuditLogEntry,
  CapitalTransaction,
  CashCustody,
  Courier,
  CourierAdjustment,
  CourierReconciliation,
  CourierSettlement,
  CustodyDebt,
  DomainEvent,
  DomainEventType,
  ExpenseTransaction,
  ID,
  Merchant,
  MoneyFlow,
  MoneyFlowKind,
  MoneyFlowParty,
  Payout,
  PayoutParty,
  RecordMutation,
  RevenueTransaction,
  SellerAdjustment,
  SellerSettlement,
  Shipment,
  ShipmentFinancials,
  TableName,
} from './domain.js';
import { IdGenerator } from './id.js';
import { SCENARIOS } from './scenarios.js';
import { buildSeedState } from './seed.js';
import type { FinanceState } from './state.js';
import { TABLE_STATE_KEY } from './tableKeys.js';

export class ValidationError extends Error {
  constructor(public reason: string, public relatedIds: Record<string, ID> = {}) {
    super(reason);
  }
}

interface TxContext {
  transactionId: ID;
  actionId: string;
  actionLabel: string;
  actor: ActorRole;
  actorName: string;
  timestamp: string;
  steps: ActionStep[];
  mutations: RecordMutation[];
  events: DomainEvent[];
  auditEntries: AuditLogEntry[];
  moneyFlows: MoneyFlow[];
  affectedTables: Set<TableName>;
  isAssumedRule: boolean;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/**
 * The simulation engine: holds the in-memory "database" (FinanceState) and
 * exposes one entry point, `execute`, that runs a named business action
 * against it, returning every mutation/event/audit-entry/money-flow the
 * action produced so the UI can animate it. See README "Architecture" for
 * how this maps to the source document, and "Replacing the simulated
 * database" for how to swap this for a real persistence layer later.
 */
export class FinanceEngine {
  private state: FinanceState;
  private ids = new IdGenerator();
  private clock: () => string;
  private tx: TxContext | null = null;

  constructor(opts?: { clock?: () => string }) {
    this.clock = opts?.clock ?? (() => new Date().toISOString());
    this.state = buildSeedState();
  }

  reset(): void {
    this.ids.reset();
    this.tx = null;
    this.state = buildSeedState();
  }

  getState(): FinanceState {
    return clone(this.state);
  }

  getAuditLog(): AuditLogEntry[] {
    return clone(this.state.auditLog);
  }

  getEvents(): DomainEvent[] {
    return clone(this.state.events);
  }

  getPeriodRollup() {
    return computePeriodRollupCalc(
      Object.values(this.state.shipmentFinancials),
      Object.values(this.state.expenseTransactions),
      Object.values(this.state.revenueTransactions),
    );
  }

  // ---------------------------------------------------------------------
  // Transaction plumbing
  // ---------------------------------------------------------------------

  private beginTx(actionId: string, actionLabel: string, actor: ActorRole, actorName: string): void {
    this.tx = {
      transactionId: this.ids.next('TX'),
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

  private commitTx(): ActionExecutionResult {
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

  private abortTx(err: unknown): ActionValidationError {
    const tx = this.tx;
    this.tx = null;
    const reason = err instanceof ValidationError ? err.reason : err instanceof Error ? err.message : String(err);
    const relatedIds = err instanceof ValidationError ? err.relatedIds : {};
    return {
      success: false,
      actionId: tx?.actionId ?? 'unknown',
      actionLabel: tx?.actionLabel ?? 'unknown',
      actor: tx?.actor ?? 'System',
      reason,
      relatedIds,
      timestamp: tx?.timestamp ?? this.clock(),
    };
  }

  private setActorName(name: string): void {
    if (this.tx) this.tx.actorName = name;
  }

  private flagAssumed(): void {
    if (this.tx) this.tx.isAssumedRule = true;
  }

  private step(actor: ActorRole, title: string, description: string, fn: () => void): void {
    const tx = this.tx;
    if (!tx) throw new Error('No active transaction.');
    const mutStart = tx.mutations.length;
    const evStart = tx.events.length;
    fn();
    tx.steps.push({
      order: tx.steps.length + 1,
      actor,
      title,
      description,
      mutations: tx.mutations.slice(mutStart),
      events: tx.events.slice(evStart),
    });
  }

  private insert<T extends { id: ID }>(table: TableName, record: T): T {
    const tx = this.tx;
    if (!tx) throw new Error('No active transaction.');
    const key = TABLE_STATE_KEY[table];
    const bucket = this.state[key] as unknown as Record<string, T>;
    bucket[record.id] = record;
    tx.mutations.push({ table, op: 'INSERT', recordId: record.id, before: null, after: clone(record) as unknown as Record<string, unknown> });
    tx.affectedTables.add(table);
    return record;
  }

  private update<T extends { id: ID }>(table: TableName, id: ID, patch: Partial<T>): T {
    const tx = this.tx;
    if (!tx) throw new Error('No active transaction.');
    const key = TABLE_STATE_KEY[table];
    const bucket = this.state[key] as unknown as Record<string, T>;
    const existing = bucket[id];
    if (!existing) throw new Error(`Record not found: ${table}/${id}`);
    const before = clone(existing);
    Object.assign(existing as object, patch);
    tx.mutations.push({ table, op: 'UPDATE', recordId: id, before: before as unknown as Record<string, unknown>, after: clone(existing) as unknown as Record<string, unknown> });
    tx.affectedTables.add(table);
    return existing;
  }

  private emitEvent(type: DomainEventType, payload: Record<string, unknown>): DomainEvent {
    const tx = this.tx;
    if (!tx) throw new Error('No active transaction.');
    const event: DomainEvent = { id: this.ids.next('EVT'), type, timestamp: this.clock(), transactionId: tx.transactionId, payload };
    tx.events.push(event);
    this.state.events.push(event);
    return event;
  }

  private audit(message: string, relatedIds: Record<string, ID> = {}): AuditLogEntry {
    const tx = this.tx;
    if (!tx) throw new Error('No active transaction.');
    const entry: AuditLogEntry = {
      id: this.ids.next('AUD'),
      timestamp: this.clock(),
      transactionId: tx.transactionId,
      actor: tx.actor,
      actorName: tx.actorName,
      actionId: tx.actionId,
      actionLabel: tx.actionLabel,
      message,
      relatedIds,
    };
    tx.auditEntries.push(entry);
    tx.affectedTables.add('audit_log');
    this.state.auditLog.push(entry);
    return entry;
  }

  private moneyFlow(kind: MoneyFlowKind, amount: number, from: MoneyFlowParty, to: MoneyFlowParty, status: 'Completed' | 'Failed' = 'Completed'): void {
    const tx = this.tx;
    if (!tx) throw new Error('No active transaction.');
    if (amount <= 0) return;
    tx.moneyFlows.push({ id: this.ids.next('MF'), kind, amount, currency: 'EGP', from, to, status });
  }

  // ---------------------------------------------------------------------
  // Public entry point
  // ---------------------------------------------------------------------

  execute(actionId: ActionId, input: Record<string, unknown>, actorNameOverride?: string): ActionOutcome {
    const def = getActionDefinition(actionId);
    this.beginTx(actionId, def.label, def.actor, actorNameOverride ?? def.actor);
    try {
      for (const field of def.inputs) {
        if (field.required && (input[field.name] === undefined || input[field.name] === null || input[field.name] === '')) {
          throw new ValidationError(`${field.label} is required.`, {});
        }
      }
      switch (actionId) {
        case 'deliverShipment':
          this.doDeliverShipment(input as { shipmentId: ID });
          break;
        case 'processReplacement':
          this.doProcessReplacement(input as { shipmentId: ID; subOutcome: 'ReplacementCleanSwap' | 'ReplacementKeepsNew' | 'ReplacementTotalRefusal' });
          break;
        case 'resolveShipmentException':
          this.doResolveShipmentException(input as {
            shipmentId: ID;
            outcome: 'PartialDelivery' | 'RefusedFailed' | 'Cancelled' | 'ReturnedShippingPaid';
            approvedKeptAmount?: number;
            pastNoCostPoint?: boolean;
          });
          break;
        case 'startCourierReconciliation':
          this.doStartCourierReconciliation(input as { courierId: ID; actualCash: number });
          break;
        case 'calculateSellerSettlement':
          this.doCalculateSellerSettlement(input as { merchantId: ID });
          break;
        case 'calculateCourierSettlement':
          this.doCalculateCourierSettlement(input as { courierId: ID });
          break;
        case 'createSellerAdjustment':
          this.doCreateSellerAdjustment(input as { merchantId: ID; shipmentId?: ID; type: SellerAdjustment['type']; amount: number; reason: string });
          break;
        case 'createCourierAdjustment':
          this.doCreateCourierAdjustment(input as { courierId: ID; shipmentId?: ID; type: CourierAdjustment['type']; amount: number; reason: string });
          break;
        case 'executePayout':
          this.doAttemptPayout(input as { party: PayoutParty; settlementId: ID; simulateFailure?: boolean }, false);
          break;
        case 'retryPayout':
          this.doAttemptPayout(input as { party: PayoutParty; settlementId: ID; simulateFailure?: boolean }, true);
          break;
        case 'recordExpense':
          this.doRecordExpense(input as {
            type: ExpenseTransaction['type'];
            attributedToType: ExpenseTransaction['attributedToType'];
            attributedToId?: ID;
            amount: number;
            paidBy: ExpenseTransaction['paidBy'];
            description?: string;
          });
          break;
        case 'recordRevenue':
          this.doRecordRevenue(input as { amount: number; notes?: string });
          break;
        case 'issueAdvance':
          this.doIssueAdvance(input as { partyType: Advance['partyType']; partyId: string; amount: number });
          break;
        case 'recordAdvanceMovement':
          this.doRecordAdvanceMovement(input as { advanceId: ID; movementType: 'Deduction' | 'Repayment'; amount: number });
          break;
        case 'recordCapitalTransaction':
          this.doRecordCapitalTransaction(input as { type: CapitalTransaction['type']; amount: number });
          break;
        case 'issueCashCustody':
          this.doIssueCashCustody(input as { holderId: string; purpose: string; amount: number });
          break;
        case 'returnCashCustody':
          this.doReturnCashCustody(input as { custodyId: ID; returnedAmount: number });
          break;
        default:
          throw new ValidationError(`Unknown action: ${actionId as string}`);
      }
      return this.commitTx();
    } catch (err) {
      return this.abortTx(err);
    }
  }

  runScenario(scenarioId: string): ActionOutcome[] {
    const scenario = SCENARIOS.find((s) => s.id === scenarioId);
    if (!scenario) return [this.notReady(scenarioId, `Unknown scenario: ${scenarioId}`)];

    switch (scenarioId) {
      case 'complete-shipment-delivery':
        return [
          this.execute('deliverShipment', { shipmentId: 'PN001' }),
          this.execute('deliverShipment', { shipmentId: 'PN002' }),
          this.execute('processReplacement', { shipmentId: 'PN003', subOutcome: 'ReplacementCleanSwap' }),
        ];
      case 'courier-cash-reconciliation':
        return [this.execute('startCourierReconciliation', { courierId: 'COU-AHMED', actualCash: 1600 })];
      case 'seller-settlement':
        return [this.execute('calculateSellerSettlement', { merchantId: 'MER-A' })];
      case 'courier-settlement':
        return [this.execute('calculateCourierSettlement', { courierId: 'COU-AHMED' })];
      case 'seller-compensation-next-settlement':
        return [
          this.execute('createSellerAdjustment', {
            merchantId: 'MER-A',
            shipmentId: 'PN001',
            type: 'Compensation',
            amount: 500,
            reason: 'Approved compensation on PN001',
          }),
          this.execute('calculateSellerSettlement', { merchantId: 'MER-A' }),
        ];
      case 'merchant-payout': {
        const settlement = this.findLatestSellerSettlement('MER-A');
        if (!settlement) return [this.notReady(scenarioId, 'Run "Seller Settlement" first — there is no calculated settlement for Seller A yet.')];
        return [
          this.execute('executePayout', { party: 'Seller', settlementId: settlement.id, simulateFailure: true }),
          this.execute('retryPayout', { party: 'Seller', settlementId: settlement.id, simulateFailure: false }),
        ];
      }
      case 'courier-payout': {
        const settlement = this.findLatestCourierSettlement('COU-AHMED');
        if (!settlement) return [this.notReady(scenarioId, 'Run "Courier Settlement" first — there is no calculated settlement for Ahmed yet.')];
        return [this.execute('executePayout', { party: 'Courier', settlementId: settlement.id, simulateFailure: false })];
      }
      case 'company-expenses-and-revenue':
        return [
          this.execute('recordExpense', {
            type: 'Fuel',
            attributedToType: 'Courier',
            attributedToId: 'COU-AHMED',
            amount: 300,
            paidBy: 'CourierReimbursable',
            description: 'Motorcycle fuel — September',
          }),
          this.execute('recordExpense', {
            type: 'VehicleMaintenance',
            attributedToType: 'Courier',
            attributedToId: 'COU-AHMED',
            amount: 1200,
            paidBy: 'Company',
            description: 'Paid to garage directly',
          }),
          this.execute('recordExpense', { type: 'Rent', attributedToType: 'Hub', attributedToId: 'HUB-7', amount: 30000, paidBy: 'Company' }),
          this.execute('recordExpense', { type: 'Utilities', attributedToType: 'Hub', attributedToId: 'HUB-7', amount: 2500, paidBy: 'Company' }),
          this.execute('recordExpense', {
            type: 'CustomerCompensation',
            attributedToType: 'Shipment',
            attributedToId: 'PN010',
            amount: 400,
            paidBy: 'Company',
            description: "Paid directly, not from a courier's cash",
          }),
          this.execute('recordRevenue', { amount: 800, notes: 'Sold surplus packaging materials to another vendor' }),
        ];
      default:
        return [this.notReady(scenarioId, `Scenario "${scenarioId}" has no runner implemented.`)];
    }
  }

  private notReady(scenarioId: string, reason: string): ActionValidationError {
    return { success: false, actionId: scenarioId, actionLabel: scenarioId, actor: 'FinanceOperator', reason, relatedIds: {}, timestamp: this.clock() };
  }

  private findLatestSellerSettlement(merchantId: ID): SellerSettlement | undefined {
    return Object.values(this.state.sellerSettlements)
      .filter((s) => s.merchantId === merchantId)
      .sort((a, b) => a.id.localeCompare(b.id))
      .at(-1);
  }

  private findLatestCourierSettlement(courierId: ID): CourierSettlement | undefined {
    return Object.values(this.state.courierSettlements)
      .filter((s) => s.courierId === courierId)
      .sort((a, b) => a.id.localeCompare(b.id))
      .at(-1);
  }

  // ---------------------------------------------------------------------
  // Actions — Shipment Lifecycle (doc §5, §6)
  // ---------------------------------------------------------------------

  private requireShipment(shipmentId: ID): Shipment {
    const shipment = this.state.shipments[shipmentId];
    if (!shipment) throw new ValidationError(`Shipment ${shipmentId} does not exist.`, { shipmentId });
    return shipment;
  }

  private requireMerchant(merchantId: ID): Merchant {
    const merchant = this.state.merchants[merchantId];
    if (!merchant) throw new ValidationError(`Merchant ${merchantId} does not exist.`, { merchantId });
    return merchant;
  }

  private requireCourier(courierId: ID): Courier {
    const courier = this.state.couriers[courierId];
    if (!courier) throw new ValidationError(`Courier ${courierId} does not exist.`, { courierId });
    return courier;
  }

  private doDeliverShipment(input: { shipmentId: ID }): void {
    const shipment = this.requireShipment(input.shipmentId);
    if (shipment.serviceType !== 'COD') {
      throw new ValidationError(`Shipment ${shipment.waybill} is a Replacement-service shipment — use "Process Replacement" instead.`, { shipmentId: shipment.id });
    }
    if (shipment.status !== 'OutForDelivery') {
      throw new ValidationError(`Shipment ${shipment.waybill} cannot be delivered — its status is "${shipment.status}", not Out For Delivery.`, { shipmentId: shipment.id });
    }
    const courier = this.requireCourier(shipment.courierId);
    const merchant = this.requireMerchant(shipment.merchantId);
    const pricing = this.state.merchantPricingConfigs[shipment.merchantId];
    if (!pricing) throw new ValidationError(`No pricing configuration for merchant ${merchant.name}.`, { merchantId: merchant.id });

    this.setActorName(courier.name);
    const now = this.clock();
    const sellerFee = pricing.codDeliveryFee;
    const courierEarning = pricing.codDeliveryCommission;

    this.step('Courier', 'Courier confirms delivery', `${courier.name} confirms delivery of ${shipment.waybill} and collects ${shipment.codAmount} EGP COD at the door.`, () => {
      this.audit(`Courier ${courier.name} delivered ${shipment.waybill} and collected ${shipment.codAmount} EGP.`, { shipmentId: shipment.id });
    });

    this.step('System', 'Resolve fee & commission', `System resolves ${merchant.name}'s pricing configuration: seller fee ${sellerFee} EGP, courier commission ${courierEarning} EGP.`, () => {
      this.audit(`Resolved seller fee (${sellerFee} EGP) and courier earning (${courierEarning} EGP) from ${merchant.name}'s pricing configuration.`, {
        shipmentId: shipment.id,
        merchantId: merchant.id,
      });
    });

    let financials!: ShipmentFinancials;
    this.step('System', 'Update shipment & create Shipment Financials', 'Shipment is marked Delivered and one Shipment Financials record is created holding the resolved fee, commission, and outcome.', () => {
      this.update<Shipment>('shipments', shipment.id, { status: 'Delivered', collectedAmount: shipment.codAmount, deliveredAt: now });
      financials = this.insert<ShipmentFinancials>('shipment_financials', {
        id: this.ids.next('SF'),
        shipmentId: shipment.id,
        sellerFee,
        courierEarning,
        outcome: 'SuccessDelivery',
        finalizedAt: now,
        courierReconciliationId: null,
        sellerSettlementId: null,
        courierSettlementId: null,
        isAssumedRule: false,
      });
      this.update<Shipment>('shipments', shipment.id, { financialsId: financials.id });
      this.emitEvent('ShipmentDelivered', { shipmentId: shipment.id, collectedAmount: shipment.codAmount });
      this.emitEvent('ShipmentFinancialsCreated', { shipmentFinancialsId: financials.id, shipmentId: shipment.id, sellerFee, courierEarning, outcome: 'SuccessDelivery' });
      this.audit(`Shipment Financials ${financials.id} created for ${shipment.waybill} (fee ${sellerFee} EGP, earning ${courierEarning} EGP).`, {
        shipmentId: shipment.id,
        shipmentFinancialsId: financials.id,
      });
    });

    this.moneyFlow('CODCollection', shipment.codAmount, { type: 'Customer', id: null, label: 'Customer' }, { type: 'Courier', id: courier.id, label: courier.name });
    this.moneyFlow('FeeRecognition', sellerFee, { type: 'Merchant', id: merchant.id, label: merchant.name }, { type: 'CompanyAccount', id: null, label: 'Company' });
    this.moneyFlow('CommissionRecognition', courierEarning, { type: 'CompanyAccount', id: null, label: 'Company' }, { type: 'Courier', id: courier.id, label: courier.name });
  }

  private doProcessReplacement(input: { shipmentId: ID; subOutcome: 'ReplacementCleanSwap' | 'ReplacementKeepsNew' | 'ReplacementTotalRefusal' }): void {
    const shipment = this.requireShipment(input.shipmentId);
    if (shipment.serviceType !== 'Replacement') {
      throw new ValidationError(`Shipment ${shipment.waybill} is not a Replacement-service shipment.`, { shipmentId: shipment.id });
    }
    if (shipment.status !== 'OutForDelivery') {
      throw new ValidationError(`Shipment ${shipment.waybill} cannot be processed — its status is "${shipment.status}", not Out For Delivery.`, { shipmentId: shipment.id });
    }
    const courier = this.requireCourier(shipment.courierId);
    const merchant = this.requireMerchant(shipment.merchantId);
    const pricing = this.state.merchantPricingConfigs[shipment.merchantId];
    if (!pricing) throw new ValidationError(`No pricing configuration for merchant ${merchant.name}.`, { merchantId: merchant.id });

    this.setActorName(courier.name);
    const now = this.clock();

    let collected = 0;
    let refund = 0;
    if (shipment.settlementDirection === 'Collect') collected = shipment.settlementAmount;
    else if (shipment.settlementDirection === 'Refund') refund = shipment.settlementAmount;

    const fee = pricing.exchangeFee;
    // Doc §5: "Exchange commission, reversed on total refusal."
    const earning = input.subOutcome === 'ReplacementTotalRefusal' ? 0 : pricing.exchangeCommission;

    const subOutcomeLabel = { ReplacementCleanSwap: 'clean swap', ReplacementKeepsNew: 'keeps new items', ReplacementTotalRefusal: 'total refusal' }[input.subOutcome];

    this.step('Courier', 'Courier completes replacement', `${courier.name} completes the replacement for ${shipment.waybill} (${subOutcomeLabel}).${refund > 0 ? ` Pays ${refund} EGP refund out of COD cash already in hand — not a separate company payment.` : ''}`, () => {
      this.audit(`Courier ${courier.name} completed replacement for ${shipment.waybill} (${subOutcomeLabel}).`, { shipmentId: shipment.id });
    });

    this.step('System', 'Resolve exchange fee & commission', `System resolves exchange fee ${fee} EGP and exchange commission ${earning} EGP${earning === 0 ? ' (reversed — total refusal)' : ''}.`, () => {
      this.audit(`Resolved exchange fee (${fee} EGP) and commission (${earning} EGP) for ${shipment.waybill}.`, { shipmentId: shipment.id });
    });

    let financials!: ShipmentFinancials;
    this.step('System', 'Update shipment & create Shipment Financials', 'Shipment is marked Replaced and one Shipment Financials record is created.', () => {
      this.update<Shipment>('shipments', shipment.id, { status: 'Replaced', collectedAmount: collected, refundAmount: refund });
      financials = this.insert<ShipmentFinancials>('shipment_financials', {
        id: this.ids.next('SF'),
        shipmentId: shipment.id,
        sellerFee: fee,
        courierEarning: earning,
        outcome: input.subOutcome,
        finalizedAt: now,
        courierReconciliationId: null,
        sellerSettlementId: null,
        courierSettlementId: null,
        isAssumedRule: false,
      });
      this.update<Shipment>('shipments', shipment.id, { financialsId: financials.id });
      this.emitEvent('ShipmentFinancialsCreated', { shipmentFinancialsId: financials.id, shipmentId: shipment.id, sellerFee: fee, courierEarning: earning, outcome: input.subOutcome });
      this.audit(`Shipment Financials ${financials.id} created for ${shipment.waybill} (fee ${fee} EGP, earning ${earning} EGP).`, { shipmentId: shipment.id, shipmentFinancialsId: financials.id });
    });

    if (refund > 0) this.moneyFlow('RefundPayout', refund, { type: 'Courier', id: courier.id, label: courier.name }, { type: 'Customer', id: null, label: 'Customer' });
    if (collected > 0) this.moneyFlow('CODCollection', collected, { type: 'Customer', id: null, label: 'Customer' }, { type: 'Courier', id: courier.id, label: courier.name });
    this.moneyFlow('FeeRecognition', fee, { type: 'Merchant', id: merchant.id, label: merchant.name }, { type: 'CompanyAccount', id: null, label: 'Company' });
    this.moneyFlow('CommissionRecognition', earning, { type: 'CompanyAccount', id: null, label: 'Company' }, { type: 'Courier', id: courier.id, label: courier.name });
  }

  private doResolveShipmentException(input: {
    shipmentId: ID;
    outcome: 'PartialDelivery' | 'RefusedFailed' | 'Cancelled' | 'ReturnedShippingPaid';
    approvedKeptAmount?: number;
    pastNoCostPoint?: boolean;
  }): void {
    const shipment = this.requireShipment(input.shipmentId);
    if (shipment.status !== 'OutForDelivery') {
      throw new ValidationError(`Shipment ${shipment.waybill} cannot be resolved — its status is "${shipment.status}", not Out For Delivery.`, { shipmentId: shipment.id });
    }
    const courier = this.requireCourier(shipment.courierId);
    const merchant = this.requireMerchant(shipment.merchantId);
    const pricing = this.state.merchantPricingConfigs[shipment.merchantId];
    if (!pricing) throw new ValidationError(`No pricing configuration for merchant ${merchant.name}.`, { merchantId: merchant.id });

    this.setActorName(courier.name);
    const now = this.clock();

    let collected = 0;
    let refund = 0;
    let fee = 0;
    let earning = 0;
    let statusNew: Shipment['status'];
    let outcomeNote: string;

    switch (input.outcome) {
      case 'PartialDelivery': {
        const kept = input.approvedKeptAmount ?? 0;
        if (!(kept > 0) || kept > shipment.codAmount) {
          throw new ValidationError(`Approved kept-items total must be greater than 0 and no more than the shipment's COD amount (${shipment.codAmount} EGP).`, { shipmentId: shipment.id });
        }
        collected = kept;
        fee = pricing.codDeliveryFee;
        earning = pricing.codDeliveryCommission;
        statusNew = 'PartiallyDelivered';
        this.flagAssumed();
        outcomeNote = `ASSUMPTION (doc §12, proration not yet defined): full delivery fee/commission applied, un-prorated, on the ${kept} EGP kept.`;
        break;
      }
      case 'RefusedFailed': {
        fee = pricing.refusalFee;
        earning = 0;
        statusNew = 'RefusedFailed';
        this.flagAssumed();
        outcomeNote = 'ASSUMPTION (doc §12, reversal-by-reason not yet modeled): refusal fee charged in full, courier earning fully reversed.';
        break;
      }
      case 'Cancelled': {
        const past = input.pastNoCostPoint ?? true;
        fee = past ? pricing.cancellationFee : 0;
        earning = 0;
        statusNew = 'Cancelled';
        this.flagAssumed();
        outcomeNote = `Cancellation fee ${past ? 'charged (past the no-cost point)' : 'waived (before the no-cost point)'}. ASSUMPTION (doc §12): courier earning policy for cancellation is unspecified, treated as 0.`;
        break;
      }
      case 'ReturnedShippingPaid': {
        fee = pricing.returnFee;
        earning = pricing.returnCommission;
        statusNew = 'Returned';
        outcomeNote = 'Return fee charged to seller, return commission paid to courier — directly named in doc §5.';
        break;
      }
    }

    this.step('Courier', `Resolve shipment as ${input.outcome}`, `${courier.name} resolves ${shipment.waybill} as ${input.outcome}. ${outcomeNote}`, () => {
      this.audit(`Courier ${courier.name} resolved ${shipment.waybill} as ${input.outcome}.`, { shipmentId: shipment.id });
    });

    let financials!: ShipmentFinancials;
    this.step('System', 'Update shipment & create Shipment Financials', `Fee ${fee} EGP, courier earning ${earning} EGP.`, () => {
      this.update<Shipment>('shipments', shipment.id, { status: statusNew, collectedAmount: collected, refundAmount: refund });
      financials = this.insert<ShipmentFinancials>('shipment_financials', {
        id: this.ids.next('SF'),
        shipmentId: shipment.id,
        sellerFee: fee,
        courierEarning: earning,
        outcome: input.outcome,
        finalizedAt: now,
        courierReconciliationId: null,
        sellerSettlementId: null,
        courierSettlementId: null,
        isAssumedRule: input.outcome !== 'ReturnedShippingPaid',
      });
      this.update<Shipment>('shipments', shipment.id, { financialsId: financials.id });
      this.emitEvent('ShipmentFinancialsCreated', { shipmentFinancialsId: financials.id, shipmentId: shipment.id, sellerFee: fee, courierEarning: earning, outcome: input.outcome });
      this.audit(`Shipment Financials ${financials.id} created for ${shipment.waybill} (fee ${fee} EGP, earning ${earning} EGP).`, { shipmentId: shipment.id, shipmentFinancialsId: financials.id });
    });

    if (collected > 0) this.moneyFlow('CODCollection', collected, { type: 'Customer', id: null, label: 'Customer' }, { type: 'Courier', id: courier.id, label: courier.name });
    if (fee > 0) this.moneyFlow('FeeRecognition', fee, { type: 'Merchant', id: merchant.id, label: merchant.name }, { type: 'CompanyAccount', id: null, label: 'Company' });
    if (earning > 0) this.moneyFlow('CommissionRecognition', earning, { type: 'CompanyAccount', id: null, label: 'Company' }, { type: 'Courier', id: courier.id, label: courier.name });
  }

  // ---------------------------------------------------------------------
  // Actions — Courier Cash Custody (doc §6.3)
  // ---------------------------------------------------------------------

  private doStartCourierReconciliation(input: { courierId: ID; actualCash: number }): void {
    const courier = this.requireCourier(input.courierId);
    this.setActorName('Finance Operator');

    const unclaimed = Object.values(this.state.shipmentFinancials).filter(
      (sf) => sf.courierReconciliationId === null && this.state.shipments[sf.shipmentId]?.courierId === courier.id,
    );
    if (unclaimed.length === 0) {
      throw new ValidationError(`Courier ${courier.name} has no unclaimed Shipment Financials rows to reconcile.`, { courierId: courier.id });
    }

    const expectedCash = unclaimed.reduce((sum, sf) => {
      const shipment = this.state.shipments[sf.shipmentId];
      return sum + (shipment.collectedAmount - shipment.refundAmount);
    }, 0);
    const variance = input.actualCash - expectedCash;
    const status: CourierReconciliation['status'] = variance === 0 ? 'MatchedClosed' : 'ShortNeedsDecision';
    const now = this.clock();

    this.step('FinanceOperator', 'Preview reconciliation totals', `Totals every unclaimed Shipment Financials row for ${courier.name}: Expected Cash = ${expectedCash} EGP across ${unclaimed.length} shipment(s). Nothing is recorded yet.`, () => {
      this.audit(`Previewed reconciliation for ${courier.name}: expected ${expectedCash} EGP.`, { courierId: courier.id });
    });

    let recon!: CourierReconciliation;
    this.step('FinanceOperator', 'Start Reconciliation', `Creates one reconciliation record and marks ${unclaimed.length} Shipment Financials row(s) as claimed.`, () => {
      recon = this.insert<CourierReconciliation>('courier_reconciliations', {
        id: this.ids.next('REC'),
        courierId: courier.id,
        hubId: courier.hubId,
        businessDate: now,
        expectedCash,
        actualCash: input.actualCash,
        variance,
        status,
        claimedShipmentFinancialsIds: unclaimed.map((sf) => sf.id),
        createdAt: now,
      });
      for (const sf of unclaimed) {
        this.update<ShipmentFinancials>('shipment_financials', sf.id, { courierReconciliationId: recon.id });
      }
      this.emitEvent('CourierReconciliationOpened', { reconciliationId: recon.id, courierId: courier.id, expectedCash, actualCash: input.actualCash, variance, status });
      this.audit(`Reconciliation ${recon.id} for ${courier.name}: expected ${expectedCash}, actual ${input.actualCash}, variance ${variance} (${status}).`, {
        courierId: courier.id,
        reconciliationId: recon.id,
      });
    });

    this.moneyFlow('CashHandover', input.actualCash, { type: 'Courier', id: courier.id, label: courier.name }, { type: 'CompanyAccount', id: courier.hubId, label: 'Hub Cash Office' });
  }

  // ---------------------------------------------------------------------
  // Actions — Seller / Courier Settlement (doc §6.4, §6.5)
  // ---------------------------------------------------------------------

  private doCalculateSellerSettlement(input: { merchantId: ID }): void {
    const merchant = this.requireMerchant(input.merchantId);
    this.setActorName('Finance Operator');

    const unsettledFinancials = Object.values(this.state.shipmentFinancials).filter(
      (sf) => sf.sellerSettlementId === null && this.state.shipments[sf.shipmentId]?.merchantId === merchant.id,
    );
    const unclaimedAdjustments = Object.values(this.state.sellerAdjustments).filter((a) => a.sellerSettlementId === null && a.merchantId === merchant.id);

    if (unsettledFinancials.length === 0 && unclaimedAdjustments.length === 0) {
      throw new ValidationError(`${merchant.name} has no unsettled shipment financials or adjustments to settle.`, { merchantId: merchant.id });
    }

    const shipmentNet = unsettledFinancials.reduce((sum, sf) => {
      const shipment = this.state.shipments[sf.shipmentId];
      return sum + (shipment.collectedAmount - shipment.refundAmount - sf.sellerFee);
    }, 0);
    const adjustmentsNet = unclaimedAdjustments.reduce((sum, a) => sum + signedSellerAdjustment(a.type, a.amount), 0);
    const totalNet = shipmentNet + adjustmentsNet;
    const now = this.clock();

    this.step('FinanceOperator', 'Group unsettled records', `Groups ${unsettledFinancials.length} Shipment Financials row(s) and ${unclaimedAdjustments.length} adjustment(s) for ${merchant.name}.`, () => {
      this.audit(`Grouped ${unsettledFinancials.length} shipment financials and ${unclaimedAdjustments.length} adjustments for ${merchant.name}.`, { merchantId: merchant.id });
    });

    let settlement!: SellerSettlement;
    this.step('FinanceOperator', 'Create settlement record', `Shipment Net ${shipmentNet} EGP + Adjustments Net ${adjustmentsNet} EGP = Total Net ${totalNet} EGP.`, () => {
      settlement = this.insert<SellerSettlement>('seller_settlements', {
        id: this.ids.next('SET-S'),
        merchantId: merchant.id,
        periodStart: now,
        periodEnd: now,
        shipmentNet,
        adjustmentsNet,
        totalNet,
        status: 'Calculated',
        claimedShipmentFinancialsIds: unsettledFinancials.map((s) => s.id),
        claimedSellerAdjustmentIds: unclaimedAdjustments.map((a) => a.id),
        createdAt: now,
      });
      for (const sf of unsettledFinancials) this.update<ShipmentFinancials>('shipment_financials', sf.id, { sellerSettlementId: settlement.id });
      for (const a of unclaimedAdjustments) this.update<SellerAdjustment>('seller_adjustments', a.id, { sellerSettlementId: settlement.id });
      this.emitEvent('SellerSettlementCalculated', { settlementId: settlement.id, merchantId: merchant.id, shipmentNet, adjustmentsNet, totalNet });
      this.audit(`Seller Settlement ${settlement.id} calculated for ${merchant.name}: total net ${totalNet} EGP.`, { merchantId: merchant.id, settlementId: settlement.id });
    });
  }

  private doCalculateCourierSettlement(input: { courierId: ID }): void {
    const courier = this.requireCourier(input.courierId);
    this.setActorName('Finance Operator');

    const unsettledFinancials = Object.values(this.state.shipmentFinancials).filter(
      (sf) => sf.courierSettlementId === null && this.state.shipments[sf.shipmentId]?.courierId === courier.id,
    );
    const unclaimedAdjustments = Object.values(this.state.courierAdjustments).filter((a) => a.courierSettlementId === null && a.courierId === courier.id);

    if (unsettledFinancials.length === 0 && unclaimedAdjustments.length === 0) {
      throw new ValidationError(`${courier.name} has no unsettled earnings or adjustments to settle.`, { courierId: courier.id });
    }

    const earningTotal = unsettledFinancials.reduce((sum, sf) => sum + sf.courierEarning, 0);
    const adjustmentTotal = unclaimedAdjustments.reduce((sum, a) => sum + signedCourierAdjustment(a.type, a.amount), 0);
    const totalNet = earningTotal + adjustmentTotal;
    const now = this.clock();

    this.step('FinanceOperator', 'Group unsettled records', `Groups ${unsettledFinancials.length} Shipment Financials row(s) and ${unclaimedAdjustments.length} adjustment(s) for ${courier.name}.`, () => {
      this.audit(`Grouped ${unsettledFinancials.length} shipment financials and ${unclaimedAdjustments.length} adjustments for ${courier.name}.`, { courierId: courier.id });
    });

    let settlement!: CourierSettlement;
    this.step('FinanceOperator', 'Create settlement record', `Earning Total ${earningTotal} EGP + Adjustments ${adjustmentTotal} EGP = Total ${totalNet} EGP.`, () => {
      settlement = this.insert<CourierSettlement>('courier_settlements', {
        id: this.ids.next('SET-C'),
        courierId: courier.id,
        periodStart: now,
        periodEnd: now,
        earningTotal,
        adjustmentTotal,
        totalNet,
        status: 'Calculated',
        claimedShipmentFinancialsIds: unsettledFinancials.map((s) => s.id),
        claimedCourierAdjustmentIds: unclaimedAdjustments.map((a) => a.id),
        createdAt: now,
      });
      for (const sf of unsettledFinancials) this.update<ShipmentFinancials>('shipment_financials', sf.id, { courierSettlementId: settlement.id });
      for (const a of unclaimedAdjustments) this.update<CourierAdjustment>('courier_adjustments', a.id, { courierSettlementId: settlement.id });
      this.emitEvent('CourierSettlementCalculated', { settlementId: settlement.id, courierId: courier.id, earningTotal, adjustmentTotal, totalNet });
      this.audit(`Courier Settlement ${settlement.id} calculated for ${courier.name}: total ${totalNet} EGP.`, { courierId: courier.id, settlementId: settlement.id });
    });
  }

  // ---------------------------------------------------------------------
  // Actions — Adjustments (doc §6.6, §12)
  // ---------------------------------------------------------------------

  private doCreateSellerAdjustment(input: { merchantId: ID; shipmentId?: ID; type: SellerAdjustment['type']; amount: number; reason: string }): void {
    const merchant = this.requireMerchant(input.merchantId);
    if (input.shipmentId) this.requireShipment(input.shipmentId);
    if (!(input.amount > 0)) throw new ValidationError('Amount must be greater than zero.', {});
    this.setActorName('Finance Operator');
    const now = this.clock();

    let adjustment!: SellerAdjustment;
    this.step(
      'FinanceOperator',
      'Approve adjustment',
      `Approves a ${input.type} of ${input.amount} EGP for ${merchant.name}${input.shipmentId ? ` on ${input.shipmentId}` : ''}. This never reopens a past settlement or changes the shipment's original COD/refund — it is only picked up by the next settlement cycle.`,
      () => {
        adjustment = this.insert<SellerAdjustment>('seller_adjustments', {
          id: this.ids.next('ADJ-S'),
          merchantId: merchant.id,
          shipmentId: input.shipmentId ?? null,
          type: input.type,
          amount: input.amount,
          status: 'Approved',
          sellerSettlementId: null,
          createdAt: now,
          reason: input.reason,
        });
        this.emitEvent('SellerAdjustmentCreated', { adjustmentId: adjustment.id, merchantId: merchant.id, type: input.type, amount: input.amount });
        this.audit(`Seller Adjustment ${adjustment.id} (${input.type}, ${input.amount} EGP) approved for ${merchant.name}.`, { merchantId: merchant.id, adjustmentId: adjustment.id });
      },
    );

    if (input.type === 'Compensation' || input.type === 'Credit') {
      this.moneyFlow('Compensation', input.amount, { type: 'CompanyAccount', id: null, label: 'Company' }, { type: 'Merchant', id: merchant.id, label: merchant.name });
    }
  }

  private doCreateCourierAdjustment(input: { courierId: ID; shipmentId?: ID; type: CourierAdjustment['type']; amount: number; reason: string }): void {
    const courier = this.requireCourier(input.courierId);
    if (input.shipmentId) this.requireShipment(input.shipmentId);
    if (!(input.amount > 0)) throw new ValidationError('Amount must be greater than zero.', {});
    this.setActorName('Finance Operator');
    const now = this.clock();

    let adjustment!: CourierAdjustment;
    this.step(
      'FinanceOperator',
      'Approve adjustment',
      `Approves a ${input.type} of ${input.amount} EGP for ${courier.name}${input.shipmentId ? ` on ${input.shipmentId}` : ''}. Picked up by the next courier settlement cycle.`,
      () => {
        adjustment = this.insert<CourierAdjustment>('courier_adjustments', {
          id: this.ids.next('ADJ-C'),
          courierId: courier.id,
          shipmentId: input.shipmentId ?? null,
          type: input.type,
          amount: input.amount,
          status: 'Approved',
          courierSettlementId: null,
          createdAt: now,
          reason: input.reason,
        });
        this.emitEvent('CourierAdjustmentCreated', { adjustmentId: adjustment.id, courierId: courier.id, type: input.type, amount: input.amount });
        this.audit(`Courier Adjustment ${adjustment.id} (${input.type}, ${input.amount} EGP) approved for ${courier.name}.`, { courierId: courier.id, adjustmentId: adjustment.id });
      },
    );

    if (input.type === 'Bonus' || input.type === 'Correction') {
      this.moneyFlow('Compensation', input.amount, { type: 'CompanyAccount', id: null, label: 'Company' }, { type: 'Courier', id: courier.id, label: courier.name });
    }
  }

  // ---------------------------------------------------------------------
  // Actions — Payout (doc §6.7)
  // ---------------------------------------------------------------------

  private doAttemptPayout(input: { party: PayoutParty; settlementId: ID; simulateFailure?: boolean }, isRetry: boolean): void {
    const table: TableName = input.party === 'Seller' ? 'seller_settlements' : 'courier_settlements';
    const bucket = input.party === 'Seller' ? this.state.sellerSettlements : this.state.courierSettlements;
    const settlement = bucket[input.settlementId];
    if (!settlement) throw new ValidationError(`${input.party} settlement ${input.settlementId} does not exist.`, { settlementId: input.settlementId });
    if (settlement.status === 'Paid') throw new ValidationError(`Settlement ${input.settlementId} is already fully paid.`, { settlementId: input.settlementId });

    const priorAttempts = Object.values(this.state.payouts)
      .filter((p) => p.settlementId === settlement.id)
      .sort((a, b) => a.attemptNumber - b.attemptNumber);
    const latest = priorAttempts.at(-1);

    if (isRetry && (!latest || latest.status !== 'Failed')) {
      throw new ValidationError(`Settlement ${input.settlementId} has no Failed payout attempt to retry.`, { settlementId: input.settlementId });
    }
    if (!isRetry && latest) {
      throw new ValidationError(`Settlement ${input.settlementId} already has a payout attempt (${latest.id}, ${latest.status}). Use Retry Payout instead.`, { settlementId: input.settlementId, payoutId: latest.id });
    }

    const partyId = input.party === 'Seller' ? (settlement as SellerSettlement).merchantId : (settlement as CourierSettlement).courierId;
    const partyRecord = input.party === 'Seller' ? this.state.merchants[partyId] : this.state.couriers[partyId];
    const partyLabel = partyRecord?.name ?? partyId;
    this.setActorName('Finance Operator');
    const now = this.clock();
    const attemptNumber = priorAttempts.length + 1;
    const failed = Boolean(input.simulateFailure);

    let payout!: Payout;
    this.step('FinanceOperator', isRetry ? 'Retry payout' : 'Attempt payout', `${isRetry ? 'Retries' : 'Attempts'} paying ${settlement.totalNet} EGP to ${partyLabel} for settlement ${settlement.id} (attempt #${attemptNumber}).`, () => {
      payout = this.insert<Payout>('payouts', {
        id: this.ids.next('PAY'),
        party: input.party,
        partyId,
        settlementId: settlement.id,
        amount: settlement.totalNet,
        status: failed ? 'Failed' : 'Paid',
        attemptNumber,
        createdAt: now,
        failureReason: failed ? 'Bank transfer rejected (simulated failure).' : undefined,
      });
      this.update(table, settlement.id, { status: failed ? 'PaymentFailed' : 'Paid' } as never);
      this.emitEvent('PayoutAttempted', { payoutId: payout.id, settlementId: settlement.id, party: input.party, amount: settlement.totalNet, attemptNumber, status: payout.status });
      this.audit(`Payout ${payout.id} attempt #${attemptNumber} for settlement ${settlement.id}: ${payout.status}.`, { settlementId: settlement.id, payoutId: payout.id });
    });

    this.moneyFlow(
      'SettlementPayout',
      settlement.totalNet,
      { type: 'CompanyAccount', id: null, label: 'Company' },
      { type: input.party === 'Seller' ? 'Merchant' : 'Courier', id: partyId, label: partyLabel },
      failed ? 'Failed' : 'Completed',
    );
  }

  // ---------------------------------------------------------------------
  // Actions — Company Expenses & Revenue (doc §8, §9)
  // ---------------------------------------------------------------------

  private doRecordExpense(input: {
    type: ExpenseTransaction['type'];
    attributedToType: ExpenseTransaction['attributedToType'];
    attributedToId?: ID;
    amount: number;
    paidBy: ExpenseTransaction['paidBy'];
    description?: string;
  }): void {
    if (!(input.amount > 0)) throw new ValidationError('Amount must be greater than zero.', {});
    if (input.type === 'OtherExpense' && !input.description) {
      throw new ValidationError('Other Expense requires a description.', {});
    }
    this.setActorName('Finance Operator');
    const now = this.clock();
    const reimbursementStatus: ExpenseTransaction['reimbursementStatus'] = input.paidBy === 'CourierReimbursable' ? 'Owed' : 'NotApplicable';
    const attributionLabel = this.describeAttribution(input.attributedToType, input.attributedToId);

    let expense!: ExpenseTransaction;
    this.step('FinanceOperator', 'Record expense', `Records a ${input.type} expense of ${input.amount} EGP attributed to ${attributionLabel}, paid by ${input.paidBy === 'Company' ? 'the company directly' : 'the courier (reimbursable)'}.`, () => {
      expense = this.insert<ExpenseTransaction>('expense_transactions', {
        id: this.ids.next('EXP'),
        type: input.type,
        attributedToType: input.attributedToType,
        attributedToId: input.attributedToId ?? null,
        amount: input.amount,
        paidBy: input.paidBy,
        reimbursementStatus,
        description: input.description ?? null,
        date: now,
        createdAt: now,
      });
      this.emitEvent('ExpenseRecorded', { expenseId: expense.id, type: input.type, amount: input.amount, paidBy: input.paidBy });
      this.audit(`Expense ${expense.id} recorded: ${input.type}, ${input.amount} EGP, ${attributionLabel}.`, { expenseId: expense.id });
    });

    if (input.paidBy === 'Company') {
      this.moneyFlow('ExpensePayment', input.amount, { type: 'CompanyAccount', id: null, label: 'Company' }, { type: 'Vendor', id: null, label: attributionLabel });
    } else {
      this.moneyFlow('ExpensePayment', input.amount, { type: 'Courier', id: input.attributedToId ?? null, label: attributionLabel }, { type: 'Vendor', id: null, label: 'Vendor' });
    }
  }

  private describeAttribution(type: ExpenseTransaction['attributedToType'], id?: ID): string {
    if (!id) return type;
    if (type === 'Courier') return this.state.couriers[id]?.name ?? id;
    if (type === 'Hub') return this.state.hubs[id]?.name ?? id;
    if (type === 'Shipment') return this.state.shipments[id]?.waybill ?? id;
    return id;
  }

  private doRecordRevenue(input: { amount: number; notes?: string }): void {
    if (!(input.amount > 0)) throw new ValidationError('Amount must be greater than zero.', {});
    this.setActorName('Finance Operator');
    const now = this.clock();

    let revenue!: RevenueTransaction;
    this.step('FinanceOperator', 'Record revenue', `Records ${input.amount} EGP of other revenue, not tied to any shipment.`, () => {
      revenue = this.insert<RevenueTransaction>('revenue_transactions', {
        id: this.ids.next('REV'),
        type: 'OtherRevenue',
        amount: input.amount,
        receivedStatus: 'Received',
        notes: input.notes ?? null,
        date: now,
        createdAt: now,
      });
      this.emitEvent('RevenueRecorded', { revenueId: revenue.id, amount: input.amount });
      this.audit(`Revenue ${revenue.id} recorded: ${input.amount} EGP.`, { revenueId: revenue.id });
    });

    this.moneyFlow('RevenueReceipt', input.amount, { type: 'Vendor', id: null, label: 'Buyer' }, { type: 'CompanyAccount', id: null, label: 'Company' });
  }

  // ---------------------------------------------------------------------
  // Actions — Advances, Capital, Cash Custody (doc §10)
  // ---------------------------------------------------------------------

  private doIssueAdvance(input: { partyType: Advance['partyType']; partyId: string; amount: number }): void {
    if (!(input.amount > 0)) throw new ValidationError('Amount must be greater than zero.', {});
    this.setActorName('Finance Operator');
    const now = this.clock();

    let advance!: Advance;
    this.step('FinanceOperator', 'Issue advance', `Issues ${input.amount} EGP to ${input.partyId} (${input.partyType}), who must pay it back.`, () => {
      advance = this.insert<Advance>('advances', {
        id: this.ids.next('ADV'),
        partyType: input.partyType,
        partyId: input.partyId,
        originalAmount: input.amount,
        outstandingAmount: input.amount,
        status: 'Open',
        createdAt: now,
      });
      this.insert<AdvanceMovement>('advance_movements', { id: this.ids.next('ADVM'), advanceId: advance.id, movementType: 'Issue', amount: input.amount, date: now });
      this.emitEvent('AdvanceIssued', { advanceId: advance.id, partyType: input.partyType, partyId: input.partyId, amount: input.amount });
      this.audit(`Advance ${advance.id} of ${input.amount} EGP issued to ${input.partyId}.`, { advanceId: advance.id });
    });

    this.moneyFlow('AdvanceIssuance', input.amount, { type: 'CompanyAccount', id: null, label: 'Company' }, { type: input.partyType, id: null, label: input.partyId });
  }

  private doRecordAdvanceMovement(input: { advanceId: ID; movementType: 'Deduction' | 'Repayment'; amount: number }): void {
    const advance = this.state.advances[input.advanceId];
    if (!advance) throw new ValidationError(`Advance ${input.advanceId} does not exist.`, { advanceId: input.advanceId });
    if (advance.status !== 'Open') throw new ValidationError(`Advance ${input.advanceId} is already Settled.`, { advanceId: input.advanceId });
    if (!(input.amount > 0)) throw new ValidationError('Amount must be greater than zero.', {});
    if (input.amount > advance.outstandingAmount) {
      throw new ValidationError(`Amount exceeds the outstanding balance (${advance.outstandingAmount} EGP).`, { advanceId: input.advanceId });
    }
    this.setActorName('Finance Operator');
    const now = this.clock();
    const newOutstanding = advance.outstandingAmount - input.amount;

    this.step('FinanceOperator', 'Record advance movement', `Records a ${input.movementType} of ${input.amount} EGP against advance ${advance.id}.`, () => {
      this.insert<AdvanceMovement>('advance_movements', { id: this.ids.next('ADVM'), advanceId: advance.id, movementType: input.movementType, amount: input.amount, date: now });
      this.update<Advance>('advances', advance.id, { outstandingAmount: newOutstanding, status: newOutstanding === 0 ? 'Settled' : 'Open' });
      this.emitEvent('AdvanceMovementRecorded', { advanceId: advance.id, movementType: input.movementType, amount: input.amount, newOutstanding });
      this.audit(`Advance ${advance.id}: ${input.movementType} of ${input.amount} EGP recorded; outstanding now ${newOutstanding} EGP.`, { advanceId: advance.id });
    });

    if (input.movementType === 'Repayment') {
      this.moneyFlow('AdvanceRepayment', input.amount, { type: advance.partyType, id: null, label: advance.partyId }, { type: 'CompanyAccount', id: null, label: 'Company' });
    }
  }

  private doRecordCapitalTransaction(input: { type: CapitalTransaction['type']; amount: number }): void {
    if (!(input.amount > 0)) throw new ValidationError('Amount must be greater than zero.', {});
    this.setActorName('Finance Operator');
    const now = this.clock();

    let capital!: CapitalTransaction;
    this.step('FinanceOperator', 'Record capital transaction', `Records a ${input.type} of ${input.amount} EGP.`, () => {
      capital = this.insert<CapitalTransaction>('capital_transactions', { id: this.ids.next('CAP'), type: input.type, amount: input.amount, date: now, createdAt: now });
      this.emitEvent('CapitalTransactionRecorded', { capitalTransactionId: capital.id, type: input.type, amount: input.amount });
      this.audit(`Capital Transaction ${capital.id} (${input.type}, ${input.amount} EGP) recorded.`, { capitalTransactionId: capital.id });
    });

    if (input.type === 'OwnerContribution') {
      this.moneyFlow('CapitalContribution', input.amount, { type: 'CompanyAccount', id: null, label: 'Owner' }, { type: 'CompanyAccount', id: null, label: 'Company' });
    } else {
      this.moneyFlow('ProfitDistribution', input.amount, { type: 'CompanyAccount', id: null, label: 'Company' }, { type: 'CompanyAccount', id: null, label: 'Owner' });
    }
  }

  private doIssueCashCustody(input: { holderId: string; purpose: string; amount: number }): void {
    if (!(input.amount > 0)) throw new ValidationError('Amount must be greater than zero.', {});
    this.setActorName('Finance Operator');
    const now = this.clock();

    let custody!: CashCustody;
    this.step('FinanceOperator', 'Issue cash custody', `Issues ${input.amount} EGP to ${input.holderId} for "${input.purpose}".`, () => {
      custody = this.insert<CashCustody>('cash_custodies', {
        id: this.ids.next('CUST'),
        holderId: input.holderId,
        purpose: input.purpose,
        issuedAmount: input.amount,
        returnedAmount: 0,
        outstandingAmount: input.amount,
        status: 'Open',
        createdAt: now,
      });
      this.emitEvent('CashCustodyIssued', { custodyId: custody.id, holderId: input.holderId, amount: input.amount, purpose: input.purpose });
      this.audit(`Cash Custody ${custody.id} of ${input.amount} EGP issued to ${input.holderId}.`, { custodyId: custody.id });
    });

    this.moneyFlow('CustodyIssuance', input.amount, { type: 'CompanyAccount', id: null, label: 'Company' }, { type: 'FinanceOperator', id: null, label: input.holderId });
  }

  private doReturnCashCustody(input: { custodyId: ID; returnedAmount: number }): void {
    const custody = this.state.cashCustodies[input.custodyId];
    if (!custody) throw new ValidationError(`Cash Custody ${input.custodyId} does not exist.`, { custodyId: input.custodyId });
    if (custody.status !== 'Open') throw new ValidationError(`Cash Custody ${input.custodyId} is already closed.`, { custodyId: input.custodyId });
    if (!(input.returnedAmount >= 0)) throw new ValidationError('Returned amount cannot be negative.', {});
    this.setActorName('Finance Operator');
    const now = this.clock();
    const shortfall = custody.issuedAmount - input.returnedAmount;

    this.step('FinanceOperator', 'Return cash custody', `Returns ${input.returnedAmount} EGP against custody ${custody.id} (issued ${custody.issuedAmount} EGP).`, () => {
      this.update<CashCustody>('cash_custodies', custody.id, {
        returnedAmount: input.returnedAmount,
        outstandingAmount: Math.max(shortfall, 0),
        status: shortfall > 0 ? 'ShortReturned' : 'Returned',
      });
      this.emitEvent('CashCustodyReturned', { custodyId: custody.id, returnedAmount: input.returnedAmount, shortfall: Math.max(shortfall, 0) });
      this.audit(`Cash Custody ${custody.id} returned: ${input.returnedAmount} of ${custody.issuedAmount} EGP.`, { custodyId: custody.id });

      if (shortfall > 0) {
        const debt = this.insert<CustodyDebt>('custody_debts', {
          id: this.ids.next('CDEBT'),
          partyId: custody.holderId,
          source: 'CashCustody',
          sourceId: custody.id,
          originalAmount: shortfall,
          settledAmount: 0,
          outstandingAmount: shortfall,
          createdAt: now,
        });
        this.emitEvent('CustodyDebtCreated', { custodyDebtId: debt.id, partyId: custody.holderId, amount: shortfall });
        this.audit(`Custody Debt ${debt.id} of ${shortfall} EGP created for ${custody.holderId}.`, { custodyDebtId: debt.id });
      }
    });

    if (input.returnedAmount > 0) {
      this.moneyFlow('CustodyReturn', input.returnedAmount, { type: 'FinanceOperator', id: null, label: custody.holderId }, { type: 'CompanyAccount', id: null, label: 'Company' });
    }
  }
}
