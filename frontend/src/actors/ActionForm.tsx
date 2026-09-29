import { useEffect, useState } from 'react';
import type { ActionDefinition, InputFieldOption } from '@pfx/shared';
import { useSimStore } from '../store/useSimStore.js';
import { getOptionsForTable } from '../utils/options.js';

interface Props {
  action: ActionDefinition;
  onExecute: (input: Record<string, unknown>) => void;
}

export default function ActionForm({ action, onExecute }: Props) {
  const dbState = useSimStore((s) => s.dbState);
  const [values, setValues] = useState<Record<string, unknown>>({});

  useEffect(() => {
    const defaults: Record<string, unknown> = {};
    for (const f of action.inputs) if (f.defaultValue !== undefined) defaults[f.name] = f.defaultValue;
    setValues(defaults);
  }, [action]);

  if (!dbState) return null;

  const optionsFor = (fieldName: string): InputFieldOption[] => {
    const field = action.inputs.find((f) => f.name === fieldName)!;
    if ((action.id === 'executePayout' || action.id === 'retryPayout') && fieldName === 'settlementId') {
      const party = values.party ?? 'Seller';
      const table = party === 'Seller' ? 'seller_settlements' : 'courier_settlements';
      return getOptionsForTable(dbState, table as never);
    }
    if (field.optionsFrom) return getOptionsForTable(dbState, field.optionsFrom);
    return field.options ?? [];
  };

  return (
    <form
      className="space-y-2.5"
      onSubmit={(e) => {
        e.preventDefault();
        onExecute(values);
      }}
    >
      {action.inputs.map((field) => (
        <div key={field.name}>
          <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-slate-500">
            {field.label} {field.required && <span className="text-danger">*</span>}
          </label>
          {field.type === 'select' && (
            <select
              required={field.required}
              value={(values[field.name] as string) ?? ''}
              onChange={(e) => setValues((v) => ({ ...v, [field.name]: e.target.value }))}
              className="w-full rounded border border-surface-border bg-surface-2 px-2 py-1.5 text-xs text-slate-200 focus:border-accent focus:outline-none"
            >
              <option value="" disabled>
                Select…
              </option>
              {optionsFor(field.name).map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          )}
          {field.type === 'number' && (
            <input
              type="number"
              required={field.required}
              value={(values[field.name] as number) ?? ''}
              onChange={(e) => setValues((v) => ({ ...v, [field.name]: e.target.value === '' ? undefined : Number(e.target.value) }))}
              className="w-full rounded border border-surface-border bg-surface-2 px-2 py-1.5 text-xs text-slate-200 focus:border-accent focus:outline-none"
            />
          )}
          {field.type === 'text' && (
            <input
              type="text"
              required={field.required}
              value={(values[field.name] as string) ?? ''}
              onChange={(e) => setValues((v) => ({ ...v, [field.name]: e.target.value }))}
              className="w-full rounded border border-surface-border bg-surface-2 px-2 py-1.5 text-xs text-slate-200 focus:border-accent focus:outline-none"
            />
          )}
          {field.type === 'boolean' && (
            <label className="flex items-center gap-2 text-xs text-slate-300">
              <input
                type="checkbox"
                checked={Boolean(values[field.name] ?? field.defaultValue ?? false)}
                onChange={(e) => setValues((v) => ({ ...v, [field.name]: e.target.checked }))}
                className="accent-accent"
              />
              {field.defaultValue !== undefined ? 'Enabled' : 'Yes'}
            </label>
          )}
        </div>
      ))}
      <button type="submit" className="w-full rounded-md bg-accent px-3 py-1.5 text-xs font-semibold text-white hover:bg-accent/90">
        Execute — {action.label}
      </button>
    </form>
  );
}
