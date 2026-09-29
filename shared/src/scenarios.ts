export interface ScenarioDefinition {
  id: string;
  title: string;
  description: string;
  sourceRef: string;
  /** Human-readable note on which other scenario should run first, if any. */
  prerequisite?: string;
}

/**
 * Predefined scenarios — every one of these reproduces a worked example from
 * doc §6 (Shipment Finance) or §9 (Company Expenses & Revenue). Execution
 * logic lives in `FinanceEngine.runScenario`; this file is UI-facing
 * metadata only (title/description/ordering hints for the Scenario Player).
 */
export const SCENARIOS: ScenarioDefinition[] = [
  {
    id: 'complete-shipment-delivery',
    title: 'Complete Shipment Delivery',
    description: 'Ahmed delivers PN001 and PN002 (COD) and completes the PN003 replacement with a refund paid out of cash already in hand — the §6.1/§6.2 worked example.',
    sourceRef: '§6.1, §6.2',
  },
  {
    id: 'courier-cash-reconciliation',
    title: 'Courier Cash Reconciliation',
    description: 'Ahmed hands over 1,600 EGP — exactly Expected Courier Cash (1000 + 800 − 200) — and the reconciliation closes Matched.',
    sourceRef: '§6.3',
    prerequisite: 'Run "Complete Shipment Delivery" first.',
  },
  {
    id: 'seller-settlement',
    title: 'Seller Settlement',
    description: "Groups Seller A's unsettled shipment financials into one settlement (940 + 740 − 250 = 1,430 EGP net).",
    sourceRef: '§6.4',
    prerequisite: 'Run "Complete Shipment Delivery" first.',
  },
  {
    id: 'courier-settlement',
    title: 'Courier Settlement',
    description: "Groups Ahmed's unsettled earnings into one settlement (45 + 45 + 35 = 125 EGP).",
    sourceRef: '§6.5',
    prerequisite: 'Run "Complete Shipment Delivery" first.',
  },
  {
    id: 'seller-compensation-next-settlement',
    title: 'Seller Compensation → Next Settlement',
    description: 'A week after the first settlement closes, Seller A is approved for a 500 EGP compensation on PN001 — it never reopens the closed settlement, only the next one picks it up.',
    sourceRef: '§6.6',
    prerequisite: 'Run "Seller Settlement" first.',
  },
  {
    id: 'merchant-payout',
    title: 'Merchant Payout (Failed → Retry)',
    description: "The first payout attempt for Seller A's settlement fails; a retry succeeds — both attempts are tracked as their own Payout records.",
    sourceRef: '§6.7',
    prerequisite: 'Run "Seller Settlement" first.',
  },
  {
    id: 'courier-payout',
    title: 'Courier Payout',
    description: "Pays Ahmed's settlement in full on the first attempt.",
    sourceRef: '§6.7',
    prerequisite: 'Run "Courier Settlement" first.',
  },
  {
    id: 'company-expenses-and-revenue',
    title: 'Company Expenses & Revenue — Hub 7, September',
    description: 'Records the five expenses and one revenue line from §9.1/§9.2 (Fuel, Vehicle Maintenance, Rent, Utilities, Customer Compensation, Other Revenue) so the period roll-up in §9.3 can be inspected.',
    sourceRef: '§9.1, §9.2, §9.3',
  },
];
