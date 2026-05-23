import React from 'react';
import { Activity, Brain, PenTool, Star, CheckCircle2, AlertCircle, Clock, Pause } from 'lucide-react';

interface NodeState {
  id: string;
  label: string;
  type: 'preparation' | 'agent' | 'checkpoint' | 'complete';
  agentName?: string;
  subSteps?: { label: string; done: boolean }[];
  status: 'pending' | 'running' | 'waiting' | 'done' | 'error' | 'auto-passed';
  meta?: { tokenUsage?: number; latencyMs?: number; outputCount?: number; outputLabel?: string };
}

interface PipelineFlowCanvasProps {
  nodes: NodeState[];
  batch: number;
  totalBatches: number;
  generatedCases: number;
  onNodeClick: (nodeId: string) => void;
  selectedNodeId: string | null;
  onAbort?: () => void;
  isRunning: boolean;
  onCheckpointAction?: (action: 'approve' | 'edit' | 'retry') => void;
}

const statusColors: Record<string, string> = {
  pending: 'border-slate-200 text-slate-400 bg-white',
  running: 'border-blue-400 text-blue-700 bg-blue-50 animate-pulse',
  waiting: 'border-orange-400 text-orange-700 bg-orange-50',
  done: 'border-green-400 text-green-700 bg-green-50',
  error: 'border-red-400 text-red-700 bg-red-50',
  'auto-passed': 'border-slate-300 text-slate-500 bg-slate-50 border-dashed',
};

const statusIcons: Record<string, React.ReactNode> = {
  pending: <Clock size={14} />,
  running: <Activity size={14} className="animate-spin" />,
  waiting: <Pause size={14} className="animate-pulse" />,
  done: <CheckCircle2 size={14} />,
  error: <AlertCircle size={14} />,
  'auto-passed': <CheckCircle2 size={14} />,
};

const agentIcons: Record<string, React.ReactNode> = {
  test_analyst: <Brain size={16} />,
  test_designer: <PenTool size={16} />,
  quality_manager: <Star size={16} />,
};

function NodeCard({ node, isSelected, onClick, onCheckpointAction }: {
  node: NodeState;
  isSelected: boolean;
  onClick: () => void;
  onCheckpointAction?: (action: 'approve' | 'edit' | 'retry') => void;
}) {
  return (
    <div className="flex flex-col items-center">
      <div
        onClick={onClick}
        className={`w-64 border-2 rounded-lg p-3 cursor-pointer transition-all ${statusColors[node.status]} ${isSelected ? 'ring-2 ring-blue-400 ring-offset-1' : ''}`}
      >
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-1.5">
            {node.type === 'agent' && node.agentName && agentIcons[node.agentName]}
            <span className="text-sm font-medium">{node.label}</span>
          </div>
          <span className="shrink-0">{statusIcons[node.status]}</span>
        </div>
        {node.type === 'agent' && node.subSteps && (
          <div className="text-xs text-slate-500 space-y-0.5 mt-1">
            {node.subSteps.map((step, i) => (
              <div key={i} className="flex items-center gap-1">
                <span>{step.done ? '\u2713' : '\u25CB'}</span>
                <span>{step.label}</span>
              </div>
            ))}
          </div>
        )}
        {node.type === 'checkpoint' && node.status === 'waiting' && onCheckpointAction && (
          <div className="flex gap-1 mt-2">
            <button onClick={(e) => { e.stopPropagation(); onCheckpointAction('approve'); }} className="px-2 py-0.5 bg-green-500 text-white text-xs rounded hover:bg-green-600">Approve</button>
            <button onClick={(e) => { e.stopPropagation(); onCheckpointAction('edit'); }} className="px-2 py-0.5 bg-blue-500 text-white text-xs rounded hover:bg-blue-600">Edit</button>
            <button onClick={(e) => { e.stopPropagation(); onCheckpointAction('retry'); }} className="px-2 py-0.5 bg-slate-500 text-white text-xs rounded hover:bg-slate-600">Retry</button>
          </div>
        )}
        {node.meta && (
          <div className="text-xs text-slate-400 mt-1">
            {node.meta.outputCount !== undefined && (
              <span>Output: {node.meta.outputCount} {node.meta.outputLabel || ''}</span>
            )}
          </div>
        )}
        {node.status === 'auto-passed' && (
          <span className="text-xs text-slate-400">Auto-passed</span>
        )}
      </div>
      {node.id !== 'complete' && (
        <div className="h-6 flex items-center justify-center">
          <svg width="12" height="24" viewBox="0 0 12 24">
            <line x1="6" y1="0" x2="6" y2="18" stroke="#cbd5e1" strokeWidth="2" />
            <polygon points="6,24 0,16 12,16" fill="#cbd5e1" />
          </svg>
        </div>
      )}
    </div>
  );
}

export function PipelineFlowCanvas({
  nodes,
  batch,
  totalBatches,
  generatedCases,
  onNodeClick,
  selectedNodeId,
  onAbort,
  isRunning,
  onCheckpointAction,
}: PipelineFlowCanvasProps) {
  const progressPercent = totalBatches > 0 ? Math.round((batch / totalBatches) * 100) : 0;

  return (
    <div className="flex-1 flex flex-col bg-slate-50 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 border-b border-slate-200 bg-white">
        <div className="flex items-center gap-4">
          <h3 className="text-sm font-medium text-slate-700">Pipeline Flow</h3>
          <div className="flex items-center gap-3 text-xs text-slate-400">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-blue-500" /> Running
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-orange-500" /> Waiting
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-green-500" /> Done
            </span>
          </div>
        </div>
        {isRunning && (
          <button
            onClick={onAbort}
            className="px-3 py-1 text-xs text-red-600 border border-red-200 rounded hover:bg-red-50"
          >
            Abort
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto py-6">
        <div className="flex flex-col items-center gap-0">
          {nodes.map(node => (
            <NodeCard
              key={node.id}
              node={node}
              isSelected={node.id === selectedNodeId}
              onClick={() => onNodeClick(node.id)}
              onCheckpointAction={onCheckpointAction}
            />
          ))}
        </div>
      </div>

      <div className="border-t border-slate-200 bg-white px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-slate-500">Progress</span>
              <span className="text-xs text-slate-600 font-medium">Batch {batch}/{totalBatches}</span>
            </div>
            <div className="w-full bg-slate-200 rounded-full h-1.5">
              <div
                className="bg-blue-500 h-1.5 rounded-full transition-all duration-500"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
          {generatedCases > 0 && (
            <span className="text-xs text-slate-500 whitespace-nowrap">{generatedCases} cases</span>
          )}
        </div>
      </div>
    </div>
  );
}