import type { NodeId } from './types';

export interface TopologyRow {
  id: string;
  nodeIds: NodeId[];
  direction: 'horizontal' | 'vertical';
}

export interface TopologyConnection {
  from: NodeId;
  to: NodeId;
  fromRow: string;
  toRow: string;
}

const ROWS: TopologyRow[] = [
  { id: 'preparation', nodeIds: ['preparation'], direction: 'vertical' },
  { id: 'analysis', nodeIds: ['agent_test_analyst', 'checkpoint_1'], direction: 'horizontal' },
  { id: 'design', nodeIds: ['agent_test_designer', 'checkpoint_2'], direction: 'horizontal' },
  { id: 'quality', nodeIds: ['agent_quality_manager', 'checkpoint_3'], direction: 'horizontal' },
  { id: 'complete', nodeIds: ['complete'], direction: 'vertical' },
];

const CONNECTIONS: TopologyConnection[] = [
  { from: 'preparation', to: 'agent_test_analyst', fromRow: 'preparation', toRow: 'analysis' },
  { from: 'agent_test_analyst', to: 'checkpoint_1', fromRow: 'analysis', toRow: 'analysis' },
  { from: 'checkpoint_1', to: 'agent_test_designer', fromRow: 'analysis', toRow: 'design' },
  { from: 'agent_test_designer', to: 'checkpoint_2', fromRow: 'design', toRow: 'design' },
  { from: 'checkpoint_2', to: 'agent_quality_manager', fromRow: 'design', toRow: 'quality' },
  { from: 'agent_quality_manager', to: 'checkpoint_3', fromRow: 'quality', toRow: 'quality' },
  { from: 'checkpoint_3', to: 'complete', fromRow: 'quality', toRow: 'complete' },
];

const NODE_ID_TO_ROW = new Map<string, TopologyRow>();
for (const row of ROWS) {
  for (const nodeId of row.nodeIds) {
    NODE_ID_TO_ROW.set(nodeId, row);
  }
}

export const pipelineTopology = {
  rows: ROWS,
  connections: CONNECTIONS,

  nodesByRow(rowId: string): NodeId[] {
    return ROWS.find(r => r.id === rowId)?.nodeIds ?? [];
  },

  rowOf(nodeId: NodeId): TopologyRow | undefined {
    return NODE_ID_TO_ROW.get(nodeId);
  },

  get allNodeIds(): NodeId[] {
    return ROWS.flatMap(r => r.nodeIds);
  },

  connectionsFrom(nodeId: NodeId): TopologyConnection[] {
    return CONNECTIONS.filter(c => c.from === nodeId);
  },

  connectionsTo(nodeId: NodeId): TopologyConnection[] {
    return CONNECTIONS.filter(c => c.to === nodeId);
  },

  betweenRows(fromRow: string, toRow: string): TopologyConnection[] {
    return CONNECTIONS.filter(c => c.fromRow === fromRow && c.toRow === toRow);
  },

  previousRows(rowId: string): TopologyRow[] {
    const idx = ROWS.findIndex(r => r.id === rowId);
    return ROWS.slice(0, idx);
  },

  nextRows(rowId: string): TopologyRow[] {
    const idx = ROWS.findIndex(r => r.id === rowId);
    return ROWS.slice(idx + 1);
  },
};
