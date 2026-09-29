import { Handle, Position, type NodeProps } from 'reactflow';
import clsx from 'clsx';
import type { TableSchema } from '@pfx/shared';

export interface TableNodeData {
  schema: TableSchema;
  recordCount: number;
  isNew: boolean;
  highlighted: boolean;
  selected: boolean;
  onSelect: (table: TableSchema['table']) => void;
}

export default function TableNode({ data }: NodeProps<TableNodeData>) {
  const { schema, recordCount, highlighted, selected, onSelect } = data;
  return (
    <div
      onClick={() => onSelect(schema.table)}
      className={clsx(
        'w-64 rounded-md border bg-surface-2 font-mono text-[11px] shadow-lg cursor-pointer transition-all duration-300',
        highlighted ? 'border-accent shadow-[0_0_0_2px_rgba(79,140,255,0.5)] ring-2 ring-accent/60' : 'border-surface-border',
        selected && !highlighted && 'border-slate-400',
      )}
    >
      <Handle type="target" position={Position.Left} className="!bg-slate-500 !w-2 !h-2" />
      <Handle type="source" position={Position.Right} className="!bg-slate-500 !w-2 !h-2" />
      <div className={clsx('flex items-center justify-between rounded-t-md px-2 py-1.5 border-b border-surface-border', highlighted ? 'bg-accent-soft' : 'bg-surface-3')}>
        <span className="font-sans font-semibold text-slate-100 tracking-wide">{schema.label}</span>
        <span className="text-slate-400">{recordCount}</span>
      </div>
      <div className="max-h-48 overflow-hidden">
        {schema.columns.slice(0, 9).map((col) => (
          <div key={col.name} className="flex items-center gap-1.5 px-2 py-0.5 border-b border-surface-border/50 last:border-none">
            <span className={clsx('w-3 text-center', col.pk ? 'text-warn' : col.fk ? 'text-accent' : 'text-transparent')}>{col.pk ? '#' : col.fk ? '↗' : '·'}</span>
            <span className={clsx('flex-1 truncate', col.pk && 'text-warn', col.fk && 'text-accent-DEFAULT')}>{col.name}</span>
            <span className="text-slate-500">{col.type}</span>
          </div>
        ))}
        {schema.columns.length > 9 && <div className="px-2 py-0.5 text-slate-500">+{schema.columns.length - 9} more…</div>}
      </div>
    </div>
  );
}
