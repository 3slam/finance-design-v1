import { useMemo } from 'react';
import ReactFlow, { Background, Controls, MiniMap, type Edge, type Node } from 'reactflow';
import 'reactflow/dist/style.css';
import { TABLE_SCHEMAS, TABLE_STATE_KEY, type TableName } from '@pfx/shared';
import { useSimStore } from '../store/useSimStore.js';
import { ERD_POSITIONS } from './layout.js';
import TableNode, { type TableNodeData } from './TableNode.js';

const nodeTypes = { table: TableNode };

export default function ErdCanvas() {
  const dbState = useSimStore((s) => s.dbState);
  const displayState = useSimStore((s) => s.displayState);
  const activeReplay = useSimStore((s) => s.activeReplay);
  const stepIndex = useSimStore((s) => s.stepIndex);
  const selectedTable = useSimStore((s) => s.selectedTable);
  const selectRecord = useSimStore((s) => s.selectRecord);
  const selectTable = useSimStore((s) => s.selectTable);

  const state = displayState ?? dbState;

  const highlightedTables = useMemo(() => {
    const set = new Set<TableName>();
    if (activeReplay) {
      for (const step of activeReplay.transaction.steps.slice(0, stepIndex + 1)) {
        for (const m of step.mutations) set.add(m.table);
      }
    }
    return set;
  }, [activeReplay, stepIndex]);

  const nodes: Node<TableNodeData>[] = useMemo(() => {
    if (!state) return [];
    return TABLE_SCHEMAS.map((schema) => {
      const key = TABLE_STATE_KEY[schema.table];
      const bucket = state[key] as unknown;
      const recordCount = Array.isArray(bucket) ? bucket.length : Object.keys(bucket as object).length;
      return {
        id: schema.table,
        type: 'table',
        position: ERD_POSITIONS[schema.table],
        data: {
          schema,
          recordCount,
          isNew: schema.isNew,
          highlighted: highlightedTables.has(schema.table),
          selected: selectedTable === schema.table,
          onSelect: (table: TableName) => selectTable(table),
        },
      };
    });
  }, [state, highlightedTables, selectedTable, selectTable]);

  const edges: Edge[] = useMemo(() => {
    const list: Edge[] = [];
    for (const schema of TABLE_SCHEMAS) {
      for (const col of schema.columns) {
        if (!col.fk) continue;
        const id = `${schema.table}.${col.name}->${col.fk.table}`;
        const active = highlightedTables.has(schema.table) && highlightedTables.has(col.fk.table);
        list.push({
          id,
          source: schema.table,
          target: col.fk.table,
          label: col.name,
          animated: active,
          style: { stroke: active ? '#4f8cff' : '#39404d', strokeWidth: active ? 2 : 1 },
          labelStyle: { fill: '#8892a4', fontSize: 9 },
          labelBgStyle: { fill: '#111318' },
        });
      }
    }
    return list;
  }, [highlightedTables]);

  void selectRecord;

  return (
    <div className="h-full w-full">
      <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} minZoom={0.2} maxZoom={1.5} defaultViewport={{ x: 60, y: 260, zoom: 0.55 }} proOptions={{ hideAttribution: true }}>
        <Background color="#20242c" gap={24} />
        <Controls showInteractive={false} className="!bg-surface-2 !border !border-surface-border [&>button]:!bg-surface-2 [&>button]:!border-surface-border [&>button]:!text-slate-300" />
        <MiniMap pannable zoomable className="!bg-surface-1 !border !border-surface-border" maskColor="rgba(10,11,13,0.75)" nodeColor="#2a3f66" />
      </ReactFlow>
    </div>
  );
}
