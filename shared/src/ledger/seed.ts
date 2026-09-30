import type { Courier, Hub, Merchant, MerchantPricingConfig } from '../domain.js';
import type { FinanceAccount } from './domain.js';
import { emptyLedgerState, type LedgerState } from './state.js';

/**
 * Seed data. Same actors, hubs and shipments as the flat design's seed
 * (`../seed.ts`) — same Ahmed, same Seller A, same PN001/PN002/PN003 — so
 * the two tabs are visibly the same business, booked two different ways.
 * The chart of accounts follows doc §5.2's `family:owner:purpose` code
 * format exactly, scoped to the accounts the guided story exercises.
 */

function account(code: string, name: string, ownerType: FinanceAccount['ownerType'], ownerId: string | null, accountType: FinanceAccount['accountType'], normalSide: FinanceAccount['normalSide']): FinanceAccount {
  return { id: code, code, name, ownerType, ownerId, accountType, normalSide, status: 'Active' };
}

export function courierCashAccountCode(courierId: string): string {
  return `courier:${courierId}:cash`;
}
export function courierPayableAccountCode(courierId: string): string {
  return `courier:${courierId}:payable`;
}
export function hubCashAccountCode(hubId: string): string {
  return `hub:${hubId}:cash`;
}
export function sellerPayableAccountCode(merchantId: string): string {
  return `seller:${merchantId}:payable`;
}
export const BANK_MAIN = 'bank:main';
export const CASH_SUSPENSE = 'cash:suspense';
export const REV_SHIPPING = 'revenue:shipping';
export const REV_REPLACEMENT = 'revenue:replacement';
export const REV_OTHER = 'revenue:other';
export const EXP_COURIER = 'expense:courier';
export const EXP_FUEL = 'expense:fuel';
export const EXP_MAINTENANCE = 'expense:maintenance';
export const EXP_RENT = 'expense:rent';
export const EXP_UTILITIES = 'expense:utilities';
export const EXP_COMPENSATION = 'expense:compensation';

export function buildLedgerSeedState(): LedgerState {
  const state = emptyLedgerState();

  const hub7: Hub = { id: 'HUB-7', name: 'Hub 7' };
  const hub3: Hub = { id: 'HUB-3', name: 'Hub 3 — Alexandria' };
  state.hubs[hub7.id] = hub7;
  state.hubs[hub3.id] = hub3;

  const sellerA: Merchant = { id: 'MER-A', name: 'Seller A' };
  const cairoHomeGoods: Merchant = { id: 'MER-B', name: 'Cairo Home Goods' };
  state.merchants[sellerA.id] = sellerA;
  state.merchants[cairoHomeGoods.id] = cairoHomeGoods;

  const ahmed: Courier = { id: 'COU-AHMED', name: 'Ahmed', hubId: hub7.id };
  const mona: Courier = { id: 'COU-MONA', name: 'Mona', hubId: hub7.id };
  state.couriers[ahmed.id] = ahmed;
  state.couriers[mona.id] = mona;

  const sellerAPricing: MerchantPricingConfig = {
    merchantId: sellerA.id,
    codDeliveryFee: 60,
    codDeliveryCommission: 45,
    exchangeFee: 50,
    exchangeCommission: 35,
    refusalFee: 40,
    cancellationFee: 25,
    returnFee: 35,
    returnCommission: 20,
  };
  const cairoHomeGoodsPricing: MerchantPricingConfig = {
    merchantId: cairoHomeGoods.id,
    codDeliveryFee: 55,
    codDeliveryCommission: 40,
    exchangeFee: 45,
    exchangeCommission: 30,
    refusalFee: 35,
    cancellationFee: 20,
    returnFee: 30,
    returnCommission: 18,
  };
  state.merchantPricingConfigs[sellerA.id] = sellerAPricing;
  state.merchantPricingConfigs[cairoHomeGoods.id] = cairoHomeGoodsPricing;

  state.shipments['PN001'] = { id: 'PN001', waybill: 'PN001', merchantId: sellerA.id, courierId: ahmed.id, hubId: hub7.id, serviceType: 'COD', status: 'OutForDelivery', codAmount: 1000, settlementAmount: 0, settlementDirection: null, deliveredAt: null };
  state.shipments['PN002'] = { id: 'PN002', waybill: 'PN002', merchantId: sellerA.id, courierId: ahmed.id, hubId: hub7.id, serviceType: 'COD', status: 'OutForDelivery', codAmount: 800, settlementAmount: 0, settlementDirection: null, deliveredAt: null };
  state.shipments['PN003'] = {
    id: 'PN003',
    waybill: 'PN003',
    merchantId: sellerA.id,
    courierId: ahmed.id,
    hubId: hub7.id,
    serviceType: 'Replacement',
    status: 'OutForDelivery',
    codAmount: 0,
    settlementAmount: 200,
    settlementDirection: 'Refund',
    deliveredAt: null,
  };
  state.shipments['PN004'] = { id: 'PN004', waybill: 'PN004', merchantId: cairoHomeGoods.id, courierId: mona.id, hubId: hub7.id, serviceType: 'COD', status: 'OutForDelivery', codAmount: 450, settlementAmount: 0, settlementDirection: null, deliveredAt: null };

  const accounts: FinanceAccount[] = [
    account(courierCashAccountCode(ahmed.id), `Courier Cash-in-Hand — ${ahmed.name}`, 'Courier', ahmed.id, 'Asset', 'Debit'),
    account(courierCashAccountCode(mona.id), `Courier Cash-in-Hand — ${mona.name}`, 'Courier', mona.id, 'Asset', 'Debit'),
    account(courierPayableAccountCode(ahmed.id), `Owed to Courier — ${ahmed.name}`, 'Courier', ahmed.id, 'Liability', 'Credit'),
    account(courierPayableAccountCode(mona.id), `Owed to Courier — ${mona.name}`, 'Courier', mona.id, 'Liability', 'Credit'),
    account(hubCashAccountCode(hub7.id), `${hub7.name} Cash (Safe)`, 'Hub', hub7.id, 'Asset', 'Debit'),
    account(hubCashAccountCode(hub3.id), `${hub3.name} Cash (Safe)`, 'Hub', hub3.id, 'Asset', 'Debit'),
    account(BANK_MAIN, 'Company Bank Account', 'Bank', null, 'Asset', 'Debit'),
    account(sellerPayableAccountCode(sellerA.id), `Accounts Payable — ${sellerA.name}`, 'Seller', sellerA.id, 'Liability', 'Credit'),
    account(sellerPayableAccountCode(cairoHomeGoods.id), `Accounts Payable — ${cairoHomeGoods.name}`, 'Seller', cairoHomeGoods.id, 'Liability', 'Credit'),
    account(CASH_SUSPENSE, 'Cash Suspense (unknown origin)', 'Company', null, 'Liability', 'Credit'),
    account(REV_SHIPPING, 'Revenue — Shipping Fees', 'Company', null, 'Revenue', 'Credit'),
    account(REV_REPLACEMENT, 'Revenue — Replacement Fees', 'Company', null, 'Revenue', 'Credit'),
    account(REV_OTHER, 'Revenue — Other', 'Company', null, 'Revenue', 'Credit'),
    account(EXP_COURIER, 'Expense — Courier Commissions', 'Company', null, 'Expense', 'Debit'),
    account(EXP_FUEL, 'Expense — Fuel', 'Company', null, 'Expense', 'Debit'),
    account(EXP_MAINTENANCE, 'Expense — Vehicle Maintenance', 'Company', null, 'Expense', 'Debit'),
    account(EXP_RENT, 'Expense — Rent', 'Company', null, 'Expense', 'Debit'),
    account(EXP_UTILITIES, 'Expense — Utilities', 'Company', null, 'Expense', 'Debit'),
    account(EXP_COMPENSATION, 'Expense — Customer Compensation', 'Company', null, 'Expense', 'Debit'),
  ];
  for (const a of accounts) state.financeAccounts[a.id] = a;

  return state;
}
