import { TABLE_STATE_KEY, type FinanceState, type InputFieldOption, type TableName } from '@pfx/shared';

export function getOptionsForTable(state: FinanceState, table: TableName): InputFieldOption[] {
  const key = TABLE_STATE_KEY[table];
  const bucket = state[key] as unknown;
  const records: Array<Record<string, unknown>> = Array.isArray(bucket) ? bucket : Object.values(bucket as object);
  return records.map((r) => ({ value: String(r.id), label: labelFor(table, r) })).sort((a, b) => a.value.localeCompare(b.value));
}

function labelFor(table: TableName, r: Record<string, unknown>): string {
  switch (table) {
    case 'shipments':
      return `${r.waybill} — ${r.status} (${r.serviceType})`;
    case 'couriers':
    case 'merchants':
    case 'hubs':
      return String(r.name);
    case 'advances':
      return `${r.id} — ${r.partyId} (${r.outstandingAmount} EGP outstanding)`;
    case 'cash_custodies':
      return `${r.id} — ${r.holderId} (${r.status})`;
    case 'seller_settlements':
      return `${r.id} — ${r.totalNet} EGP (${r.status})`;
    case 'courier_settlements':
      return `${r.id} — ${r.totalNet} EGP (${r.status})`;
    default:
      return String(r.id);
  }
}
