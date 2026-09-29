import type { TableName } from '@pfx/shared';

/** Hand-placed ERD grid positions, grouped by business area. The table
 * *content* (columns, PK/FK badges) is generated from the shared schema —
 * only these x/y coordinates are a presentation-layer concern, same as any
 * ERD tool's "arrange" step. */
export const ERD_POSITIONS: Record<TableName, { x: number; y: number }> = {
  merchants: { x: 0, y: 0 },
  couriers: { x: 280, y: 0 },
  hubs: { x: 560, y: 0 },
  merchant_pricing_configs: { x: 0, y: 200 },

  shipments: { x: 900, y: 80 },
  shipment_financials: { x: 1240, y: 80 },

  courier_reconciliations: { x: 1600, y: -120 },
  courier_settlements: { x: 1600, y: 60 },
  courier_adjustments: { x: 1960, y: 60 },

  seller_settlements: { x: 1600, y: 300 },
  seller_adjustments: { x: 1960, y: 300 },

  payouts: { x: 1960, y: 480 },

  expense_transactions: { x: 0, y: 480 },
  revenue_transactions: { x: 360, y: 480 },
  capital_transactions: { x: 0, y: 700 },

  advances: { x: 360, y: 700 },
  advance_movements: { x: 720, y: 700 },
  cash_custodies: { x: 0, y: 900 },
  custody_debts: { x: 360, y: 900 },

  audit_log: { x: 2340, y: 300 },
};
