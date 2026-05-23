import React, { useRef, useEffect, useState } from 'react';
import { Activity, Brain, PenTool, Star, CheckCircle2, AlertCircle, Clock, Pause } from 'lucide-react';

interface NodeState {
  id: string;
  label: string;
  type: 'preparation' | 'agent' | 'checkpoint' | 'complete';
  agentName?: string;
  subSteps?: { label: string; done: boolean; running?: boolean }[];
  status: 'pending' | 'running' | 'waiting' | 'done' | 'error' | 'auto-passed';
  meta?: { tokenUsage?: number; latencyMs?: number; outputCount?: number; outputLabel?: string; errorMessage?: string };
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

function ArrowRight({ scale }: { scale: number }) {
  const w = Math.round(36 * scale);
  const h = Math.round(12 * scale);
  const strokeW = Math.max(1, Math.round(2 * scale));
  return (
    <div className="flex items-center shrink-0" style={{ width: w, height: h, margin: `0 ${Math.round(4 * scale)}px` }}>
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
        <line x1="0" y1={h / 2} x2={w - h * 0.3} y2={h / 2} stroke="#cbd5e1" strokeWidth={strokeW} />
        <polygon points={`${w},${h / 2} ${w - h * 0.5},0 ${w - h * 0.5},${h}`} fill="#cbd5e1" />
      </svg>
    </div>
  );
}

function ArrowDown({ scale }: { scale: number }) {
  const w = Math.round(12 * scale);
  const h = Math.round(32 * scale);
  const strokeW = Math.max(1, Math.round(2 * scale));
  return (
    <div className="flex justify-center" style={{ height: h, width: w, margin: `${Math.round(3 * scale)}px 0` }}>
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
        <line x1={w / 2} y1="0" x2={w / 2} y2={h - h * 0.25} stroke="#cbd5e1" strokeWidth={strokeW} />
        <polygon points={`${w / 2},${h} 0,${h - h * 0.35} ${w},${h - h * 0.35}`} fill="#cbd5e1" />
      </svg>
    </div>
  );
}

function NodeCard({ node, isSelected, onClick, onCheckpointAction, scale }: {
  node: NodeState;
  isSelected: boolean;
  onClick: () => void;
  onCheckpointAction?: (action: 'approve' | 'edit' | 'retry') => void;
  scale: number;
}) {
  const agentW = Math.round(280 * scale);
  const checkpointW = Math.round(230 * scale);
  const width = node.type === 'checkpoint' ? checkpointW : agentW;
  const padding = Math.round(3 * scale);
  const gap = Math.round(2 * scale);
  const fontSize = Math.max(0.6, Math.round(0.72 * scale * 10) / 10) + 'rem';
  const headerFontSize = Math.max(0.75, Math.round(0.85 * scale * 10) / 10) + 'rem';
  const iconSize = Math.max(12, Math.round(15 * scale));
  const agentIconSize = Math.max(14, Math.round(18 * scale));
  const showSubSteps = scale > 0.65;
  const showCheckpointActions = scale > 0.55;

  return (
    <div
      onClick={onClick}
      className={`border-2 rounded-lg cursor-pointer transition-all shrink-0 ${statusColors[node.status]} ${isSelected ? 'ring-2 ring-blue-400 ring-offset-1' : ''}`}
      style={{ width, padding }}
    >
      <div className="flex items-center justify-between" style={{ gap, marginBottom: gap }}>
        <div className="flex items-center min-w-0" style={{ gap }}>
          {node.type === 'agent' && node.agentName && (
            <span style={{ fontSize: agentIconSize }}>{agentIcons[node.agentName]}</span>
          )}
          <span className="font-medium truncate" style={{ fontSize: headerFontSize }}>{node.label}</span>
        </div>
        <span className="shrink-0" style={{ fontSize: iconSize }}>{statusIcons[node.status]}</span>
      </div>

      {node.type === 'agent' && node.subSteps && showSubSteps && (
        <div className="text-slate-500" style={{ fontSize }}>
          {node.subSteps.map((step, i) => (
            <div key={i} className="flex items-center truncate" style={{ gap }}>
              <span>{step.done ? <CheckCircle2 size={10} className="text-green-500" /> : step.running ? <Activity size={10} className="text-blue-500 animate-spin" /> : <Clock size={10} className="text-slate-300" />}</span>
              <span className={step.running ? 'text-blue-600 font-medium' : step.done ? 'text-green-600' : ''}>{step.label}</span>
            </div>
          ))}
        </div>
      )}

      {node.type === 'checkpoint' && node.status === 'waiting' && onCheckpointAction && showCheckpointActions && (
        <div className="flex" style={{ gap, marginTop: gap }}>
          <button
            onClick={(e) => { e.stopPropagation(); onCheckpointAction('approve'); }}
            className="bg-green-500 text-white rounded hover:bg-green-600"
            style={{ fontSize, padding: `${Math.round(1 * scale)}px ${Math.round(4 * scale)}px` }}
          >
            Approve
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onCheckpointAction('edit'); }}
            className="bg-blue-500 text-white rounded hover:bg-blue-600"
            style={{ fontSize, padding: `${Math.round(1 * scale)}px ${Math.round(4 * scale)}px` }}
          >
            Edit
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onCheckpointAction('retry'); }}
            className="bg-slate-500 text-white rounded hover:bg-slate-600"
            style={{ fontSize, padding: `${Math.round(1 * scale)}px ${Math.round(4 * scale)}px` }}
          >
            Retry
          </button>
        </div>
      )}

      {node.meta && scale > 0.7 && (
        <div className="text-slate-400" style={{ fontSize, marginTop: gap }}>
          {node.meta.outputCount !== undefined && (
            <span>Output: {node.meta.outputCount} {node.meta.outputLabel || ''}</span>
          )}
        </div>
      )}

      {node.status === 'auto-passed' && scale > 0.7 && (
        <span className="text-slate-400" style={{ fontSize }}>Auto-passed</span>
      )}
      {node.status === 'error' && node.meta?.errorMessage && (
        <div className="text-red-500 mt-1" style={{ fontSize }} title={node.meta.errorMessage}>
          {node.meta.errorMessage.length > 60 ? node.meta.errorMessage.slice(0, 60) + '...' : node.meta.errorMessage}
        </div>
      )}
    </div>
  );
}

const MIN_SCALE = 0.65;
const MAX_SCALE = 1.4;
const IDEAL_HEIGHT = 520;
const IDEAL_WIDTH = 680;

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
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        const wScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, width / IDEAL_WIDTH));
        const hScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, height / IDEAL_HEIGHT));
        setScale(Math.min(wScale, hScale));
      }
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const progressPercent = totalBatches > 0 ? Math.round((batch / totalBatches) * 100) : 0;
  const progressFontSize = Math.max(0.6, Math.round(0.7 * scale * 10) / 10) + 'rem';

  const prepNode = nodes[0];
  const row1 = nodes.slice(1, 3);
  const row2 = nodes.slice(3, 5);
  const row3 = nodes.slice(5, 7);
  const completeNode = nodes[7];

  return (
    <div className="flex-1 flex flex-col bg-slate-50 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 border-b border-slate-200 bg-white shrink-0">
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

      <div ref={containerRef} className="flex-1 overflow-hidden">
        <div className="h-full flex items-center justify-center">
          <div className="flex flex-col items-center gap-0">
            <div className="flex justify-center">
              <NodeCard node={prepNode} isSelected={prepNode.id === selectedNodeId} onClick={() => onNodeClick(prepNode.id)} onCheckpointAction={onCheckpointAction} scale={scale} />
            </div>

            <ArrowDown scale={scale} />

            <div className="flex items-center justify-center" style={{ gap: Math.round(12 * scale) }}>
              <NodeCard node={row1[0]} isSelected={row1[0].id === selectedNodeId} onClick={() => onNodeClick(row1[0].id)} onCheckpointAction={onCheckpointAction} scale={scale} />
              <ArrowRight scale={scale} />
              <NodeCard node={row1[1]} isSelected={row1[1].id === selectedNodeId} onClick={() => onNodeClick(row1[1].id)} onCheckpointAction={onCheckpointAction} scale={scale} />
            </div>

            <ArrowDown scale={scale} />

            <div className="flex items-center justify-center" style={{ gap: Math.round(12 * scale) }}>
              <NodeCard node={row2[0]} isSelected={row2[0].id === selectedNodeId} onClick={() => onNodeClick(row2[0].id)} onCheckpointAction={onCheckpointAction} scale={scale} />
              <ArrowRight scale={scale} />
              <NodeCard node={row2[1]} isSelected={row2[1].id === selectedNodeId} onClick={() => onNodeClick(row2[1].id)} onCheckpointAction={onCheckpointAction} scale={scale} />
            </div>

            <ArrowDown scale={scale} />

            <div className="flex items-center justify-center" style={{ gap: Math.round(12 * scale) }}>
              <NodeCard node={row3[0]} isSelected={row3[0].id === selectedNodeId} onClick={() => onNodeClick(row3[0].id)} onCheckpointAction={onCheckpointAction} scale={scale} />
              <ArrowRight scale={scale} />
              <NodeCard node={row3[1]} isSelected={row3[1].id === selectedNodeId} onClick={() => onNodeClick(row3[1].id)} onCheckpointAction={onCheckpointAction} scale={scale} />
            </div>

            <ArrowDown scale={scale} />

            <div className="flex justify-center">
              <NodeCard node={completeNode} isSelected={completeNode.id === selectedNodeId} onClick={() => onNodeClick(completeNode.id)} onCheckpointAction={onCheckpointAction} scale={scale} />
            </div>
          </div>
        </div>
      </div>

      <div className="border-t border-slate-200 bg-white px-4 py-3 shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <div className="flex items-center justify-between mb-1" style={{ fontSize: progressFontSize }}>
              <span className="text-slate-500">Progress</span>
              <span className="text-slate-600 font-medium">Batch {batch}/{totalBatches}</span>
            </div>
            <div className="w-full bg-slate-200 rounded-full h-1.5">
              <div
                className="bg-blue-500 h-1.5 rounded-full transition-all duration-500"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
          {generatedCases > 0 && (
            <span className="text-slate-500 whitespace-nowrap" style={{ fontSize: progressFontSize }}>{generatedCases} cases</span>
          )}
        </div>
      </div>
    </div>
  );
}