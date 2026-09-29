import type {
  CourierAdjustmentType,
  ExpenseTransaction,
  RevenueTransaction,
  SellerAdjustmentType,
  ShipmentFinancials,
  Shipment,
} from './domain.js';

/** Doc §1 core formula: Seller Base Effect = Collected − Refund − Seller Fee. */
export function sellerBaseEffect(shipment: Shipment, financials: ShipmentFinancials): number {
  return shipment.collectedAmount - shipment.refundAmount - financials.sellerFee;
}

/** Doc §1 core formula: Expected Courier Cash = SUM(Collected) − SUM(Refund). */
export function expectedCourierCash(shipments: Shipment[]): number {
  return shipments.reduce((sum, s) => sum + (s.collectedAmount - s.refundAmount), 0);
}

/** Doc §1 core formula: Company Shipment Contribution = Seller Fee − Courier Earning. */
export function companyShipmentContribution(financials: ShipmentFinancials): number {
  return financials.sellerFee - financials.courierEarning;
}

/** Compensation/Credit add to what the merchant is owed; Claim/Deduction subtract. */
export function signedSellerAdjustment(type: SellerAdjustmentType, amount: number): number {
  return type === 'Compensation' || type === 'Credit' ? amount : -amount;
}

/** Bonus/Correction add to what the courier is owed; Penalty subtracts. */
export function signedCourierAdjustment(type: CourierAdjustmentType, amount: number): number {
  return type === 'Penalty' ? -amount : amount;
}

export interface PeriodRollup {
  shipmentFeesEarned: number;
  courierCommissionsPaid: number;
  companyShipmentContribution: number;
  otherRevenue: number;
  totalExpenses: number;
  expenseLines: Array<{ label: string; amount: number }>;
  netResult: number;
}

/** Doc §9.3 period roll-up: shipment contribution + other revenue − every recorded expense. */
export function computePeriodRollup(
  financials: ShipmentFinancials[],
  expenses: ExpenseTransaction[],
  revenues: RevenueTransaction[],
): PeriodRollup {
  const shipmentFeesEarned = financials.reduce((sum, f) => sum + f.sellerFee, 0);
  const courierCommissionsPaid = financials.reduce((sum, f) => sum + f.courierEarning, 0);
  const contribution = shipmentFeesEarned - courierCommissionsPaid;
  const otherRevenue = revenues.reduce((sum, r) => sum + r.amount, 0);
  const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);
  const expenseLines = expenses.map((e) => ({ label: `${e.type} (${e.id})`, amount: -e.amount }));
  const netResult = contribution + otherRevenue - totalExpenses;
  return {
    shipmentFeesEarned,
    courierCommissionsPaid,
    companyShipmentContribution: contribution,
    otherRevenue,
    totalExpenses,
    expenseLines,
    netResult,
  };
}
