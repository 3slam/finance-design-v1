import type { Courier, Hub, Merchant, MerchantPricingConfig, Shipment } from './domain.js';
import { emptyState, type FinanceState } from './state.js';

/**
 * Seed data. PN001/PN002/PN003, Seller A, Ahmed, and Hub 7 reproduce the
 * worked example's setup in doc §6 exactly, so the engine's output for
 * those records can be checked against the document's own numbers. The
 * §9 expenses/revenue (EXP001-EXP005, REV001) are deliberately NOT
 * pre-seeded as static rows — the "Company Expenses & Revenue" scenario
 * creates them live via `recordExpense`/`recordRevenue` so the demo shows
 * them being created, not just sitting there. A handful of extra
 * shipments/couriers/merchants are added purely to give the Playground
 * more to explore — they carry no numbers from the document and are
 * clearly separate from the worked example.
 */
export function buildSeedState(): FinanceState {
  const state = emptyState();

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

  // Pricing config: codDeliveryFee/commission and exchangeFee/commission are
  // the exact figures used in doc §6's worked example. refusalFee,
  // cancellationFee, returnFee and returnCommission have no worked numbers
  // in the source — these are documented placeholder ASSUMPTIONS (README
  // "Assumptions").
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

  const shipments: Shipment[] = [
    {
      id: 'PN001',
      waybill: 'PN001',
      merchantId: sellerA.id,
      courierId: ahmed.id,
      hubId: hub7.id,
      serviceType: 'COD',
      status: 'OutForDelivery',
      codAmount: 1000,
      collectedAmount: 0,
      refundAmount: 0,
      settlementAmount: 0,
      settlementDirection: null,
      deliveredAt: null,
      financialsId: null,
    },
    {
      id: 'PN002',
      waybill: 'PN002',
      merchantId: sellerA.id,
      courierId: ahmed.id,
      hubId: hub7.id,
      serviceType: 'COD',
      status: 'OutForDelivery',
      codAmount: 800,
      collectedAmount: 0,
      refundAmount: 0,
      settlementAmount: 0,
      settlementDirection: null,
      deliveredAt: null,
      financialsId: null,
    },
    {
      id: 'PN003',
      waybill: 'PN003',
      merchantId: sellerA.id,
      courierId: ahmed.id,
      hubId: hub7.id,
      serviceType: 'Replacement',
      status: 'OutForDelivery',
      codAmount: 0,
      collectedAmount: 0,
      refundAmount: 0,
      // Doc §6.2: "customer keeps nothing and is owed 200 EGP back" — settlement
      // amount/direction already exist on the real Shipment record per §2.
      settlementAmount: 200,
      settlementDirection: 'Refund',
      deliveredAt: null,
      financialsId: null,
    },
    // --- Extra sample data for Playground exploration (not from the worked example) ---
    {
      id: 'PN004',
      waybill: 'PN004',
      merchantId: cairoHomeGoods.id,
      courierId: mona.id,
      hubId: hub7.id,
      serviceType: 'COD',
      status: 'OutForDelivery',
      codAmount: 450,
      collectedAmount: 0,
      refundAmount: 0,
      settlementAmount: 0,
      settlementDirection: null,
      deliveredAt: null,
      financialsId: null,
    },
    {
      id: 'PN005',
      waybill: 'PN005',
      merchantId: sellerA.id,
      courierId: ahmed.id,
      hubId: hub7.id,
      serviceType: 'COD',
      status: 'OutForDelivery',
      codAmount: 650,
      collectedAmount: 0,
      refundAmount: 0,
      settlementAmount: 0,
      settlementDirection: null,
      deliveredAt: null,
      financialsId: null,
    },
    {
      id: 'PN006',
      waybill: 'PN006',
      merchantId: cairoHomeGoods.id,
      courierId: mona.id,
      hubId: hub7.id,
      serviceType: 'Replacement',
      status: 'OutForDelivery',
      codAmount: 0,
      collectedAmount: 0,
      refundAmount: 0,
      settlementAmount: 150,
      settlementDirection: 'Collect',
      deliveredAt: null,
      financialsId: null,
    },
    {
      id: 'PN007',
      waybill: 'PN007',
      merchantId: cairoHomeGoods.id,
      courierId: mona.id,
      hubId: hub3.id,
      serviceType: 'COD',
      status: 'OutForDelivery',
      codAmount: 300,
      collectedAmount: 0,
      refundAmount: 0,
      settlementAmount: 0,
      settlementDirection: null,
      deliveredAt: null,
      financialsId: null,
    },
    {
      id: 'PN008',
      waybill: 'PN008',
      merchantId: sellerA.id,
      courierId: ahmed.id,
      hubId: hub7.id,
      serviceType: 'COD',
      status: 'OutForDelivery',
      codAmount: 900,
      collectedAmount: 0,
      refundAmount: 0,
      settlementAmount: 0,
      settlementDirection: null,
      deliveredAt: null,
      financialsId: null,
    },
  ];
  // PN010: referenced by name only in doc §9.1 ("Shipment: PN010") as the
  // shipment whose customer-compensation expense is recorded. Added as a
  // minimal real record purely so that expense's shipment reference resolves
  // to something clickable in the UI — it carries no worked-example numbers
  // of its own.
  const pn010: Shipment = {
    id: 'PN010',
    waybill: 'PN010',
    merchantId: sellerA.id,
    courierId: ahmed.id,
    hubId: hub7.id,
    serviceType: 'COD',
    status: 'RefusedFailed',
    codAmount: 250,
    collectedAmount: 0,
    refundAmount: 0,
    settlementAmount: 0,
    settlementDirection: null,
    deliveredAt: null,
    financialsId: null,
  };
  state.shipments[pn010.id] = pn010;
  for (const s of shipments) state.shipments[s.id] = s;

  return state;
}
