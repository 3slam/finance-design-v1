import type {
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
  ExpenseTransaction,
  Hub,
  Merchant,
  MerchantPricingConfig,
  Payout,
  RevenueTransaction,
  SellerAdjustment,
  SellerSettlement,
  Shipment,
  ShipmentFinancials,
} from './domain.js';

/** The full simulated database. Every table is a plain object keyed by id —
 * swapping this for a real database later means implementing the same
 * shape as repositories (see README "Replacing the simulated database"). */
export interface FinanceState {
  merchants: Record<string, Merchant>;
  couriers: Record<string, Courier>;
  hubs: Record<string, Hub>;
  merchantPricingConfigs: Record<string, MerchantPricingConfig>;
  shipments: Record<string, Shipment>;
  shipmentFinancials: Record<string, ShipmentFinancials>;
  courierReconciliations: Record<string, CourierReconciliation>;
  sellerSettlements: Record<string, SellerSettlement>;
  courierSettlements: Record<string, CourierSettlement>;
  sellerAdjustments: Record<string, SellerAdjustment>;
  courierAdjustments: Record<string, CourierAdjustment>;
  payouts: Record<string, Payout>;
  expenseTransactions: Record<string, ExpenseTransaction>;
  revenueTransactions: Record<string, RevenueTransaction>;
  advances: Record<string, Advance>;
  advanceMovements: Record<string, AdvanceMovement>;
  capitalTransactions: Record<string, CapitalTransaction>;
  cashCustodies: Record<string, CashCustody>;
  custodyDebts: Record<string, CustodyDebt>;
  auditLog: AuditLogEntry[];
  events: DomainEvent[];
}

export function emptyState(): FinanceState {
  return {
    merchants: {},
    couriers: {},
    hubs: {},
    merchantPricingConfigs: {},
    shipments: {},
    shipmentFinancials: {},
    courierReconciliations: {},
    sellerSettlements: {},
    courierSettlements: {},
    sellerAdjustments: {},
    courierAdjustments: {},
    payouts: {},
    expenseTransactions: {},
    revenueTransactions: {},
    advances: {},
    advanceMovements: {},
    capitalTransactions: {},
    cashCustodies: {},
    custodyDebts: {},
    auditLog: [],
    events: [],
  };
}
