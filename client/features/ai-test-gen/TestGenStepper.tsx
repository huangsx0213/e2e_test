import { useRef } from 'react';
import {
  Settings,
  Search,
  ClipboardCheck,
  PenTool,
  FileEdit,
  FileText,
  ShieldCheck,
  Flag,
  CheckCircle2,
  Loader2,
  AlertCircle,
} from 'lucide-react';

import type { TestGenNode, NodeId } from '@/shared/test-gen-run/types';

const PHASE_DEFS = [
  { id: 'prep', label: 'Preparation', nodeIds: ['preparation'] as NodeId[], icon: Settings },
  {
    id: 'analysis',
    label: 'Analysis',
    nodeIds: ['agent_test_analyst', 'checkpoint_1'] as NodeId[],
    icon: Search,
  },
  {
    id: 'design',
    label: 'Design',
    nodeIds: ['agent_test_designer', 'checkpoint_2'] as NodeId[],
    icon: PenTool,
  },
  {
    id: 'quality',
    label: 'Quality',
    nodeIds: ['agent_quality_manager', 'checkpoint_3'] as NodeId[],
    icon: ShieldCheck,
  },
  { id: 'complete', label: 'Complete', nodeIds: ['complete'] as NodeId[], icon: CheckCircle2 },
] as const;

const nodeLabels: Record<NodeId, string> = {
  preparation: 'Initialize Environment',
  agent_test_analyst: 'Test Analyst',
  checkpoint_1: 'Review Conditions',
  agent_test_designer: 'Test Designer',
  checkpoint_2: 'Review Drafts',
  agent_quality_manager: 'Quality Manager',
  checkpoint_3: 'Final Review',
  complete: 'Test Gen Complete',
};

const nodeIcons: Record<string, React.ComponentType<any>> = {
  preparation: Settings,
  agent_test_analyst: Search,
  checkpoint_1: ClipboardCheck,
  agent_test_designer: FileEdit,
  checkpoint_2: FileText,
  agent_quality_manager: ShieldCheck,
  checkpoint_3: Flag,
  complete: CheckCircle2,
};

interface TestGenStepperProps {
  nodes: TestGenNode[];
  selectedNodeId: NodeId | null;
  onNodeClick: (nodeId: string) => void;
  autoFollowEnabled: boolean;
  onToggleAutoFollow: () => void;
  isRunning: boolean;
}

function formatMs(ms: number) {
  if (ms < 1000) return `${ms}ms`;
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const parts: string[] = [];
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  if (s > 0 || parts.length === 0) parts.push(`${s}s`);
  return parts.join(' ');
}

function StatusIndicator({ status, size = 'sm' }: { status: string; size?: 'sm' | 'md' }) {
  const sizeClass = size === 'sm' ? 'w-2 h-2' : 'w-3 h-3';

  if (status === 'running') {
    return (
      <span className="relative flex items-center justify-center">
        <span className={`animate-ping absolute inline-flex rounded-full bg-blue-400 opacity-75 ${sizeClass}`} />
        <span className={`relative inline-flex rounded-full bg-blue-500 ${sizeClass}`} />
      </span>
    );
  }
  if (status === 'waiting') {
    return (
      <span className="relative flex items-center justify-center">
        <span className={`animate-ping absolute inline-flex rounded-full bg-amber-400 opacity-75 ${sizeClass}`} />
        <span className={`relative inline-flex rounded-full bg-amber-500 ${sizeClass}`} />
      </span>
    );
  }
  if (status === 'completed' || status === 'auto-passed') {
    return <CheckCircle2 size={size === 'sm' ? 12 : 14} className="text-emerald-500" strokeWidth={2.5} />;
  }
  if (status === 'error') {
    return <AlertCircle size={size === 'sm' ? 12 : 14} className="text-red-500" strokeWidth={2.5} />;
  }
  return <div className={`${sizeClass} rounded-full bg-slate-300`} />;
}

function NodeCard({
  node,
  isSelected,
  onNodeClick,
}: {
  node: TestGenNode;
  isSelected: boolean;
  onNodeClick: (id: string) => void;
}) {
  const status = node.status;
  const isCheckpoint = node.id.startsWith('checkpoint_');

  const cardBg = isSelected
    ? 'bg-blue-50 border-blue-200'
    : status === 'completed'
    ? 'bg-white border-slate-100 hover:border-slate-200'
    : status === 'running'
    ? 'bg-gradient-to-r from-blue-50/80 to-white border-blue-200'
    : status === 'waiting'
    ? 'bg-gradient-to-r from-amber-50/80 to-white border-amber-200'
    : status === 'error'
    ? 'bg-gradient-to-r from-red-50/80 to-white border-red-200'
    : 'bg-white border-slate-100 hover:border-slate-200';

  const iconBg = isSelected
    ? 'bg-blue-100'
    : status === 'completed'
    ? 'bg-emerald-50'
    : status === 'running'
    ? 'bg-blue-50'
    : status === 'waiting'
    ? 'bg-amber-50'
    : status === 'error'
    ? 'bg-red-50'
    : 'bg-slate-50';

  const labelColor = isSelected
    ? 'text-blue-700'
    : status === 'completed'
    ? 'text-slate-700'
    : status === 'running'
    ? 'text-blue-600'
    : status === 'waiting'
    ? 'text-amber-600'
    : status === 'error'
    ? 'text-red-600'
    : 'text-slate-500';

  const Icon = nodeIcons[node.id] || ShieldCheck;

  return (
    <div
      onClick={() => onNodeClick(node.id)}
      className={`
        group relative flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer select-none
        transition-all duration-200 border
        ${cardBg}
        ${isSelected ? 'ring-1 ring-blue-200 shadow-sm' : 'hover:shadow-sm'}
      `}
    >
      {/* Icon container */}
      <div className={`flex items-center justify-center w-8 h-8 rounded-lg shrink-0 transition-colors duration-200 ${iconBg}`}>
        {status === 'running' ? (
          <Loader2 size={16} className="text-blue-500 animate-spin" strokeWidth={2} />
        ) : status === 'completed' ? (
          <CheckCircle2 size={16} className="text-emerald-500" strokeWidth={2} />
        ) : status === 'error' ? (
          <AlertCircle size={16} className="text-red-500" strokeWidth={2} />
        ) : (
          <Icon size={16} className={`${isSelected ? 'text-blue-600' : 'text-slate-400 group-hover:text-slate-500'}`} strokeWidth={2} />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <span className={`text-[12px] font-semibold block truncate leading-tight ${labelColor}`}>
          {nodeLabels[node.id] || node.label}
        </span>
        {status === 'running' && (
          <div className="flex items-center gap-1 mt-0.5">
            <span className="text-[10px] font-medium text-blue-500 animate-pulse">Thinking</span>
            <span className="flex gap-[2px]">
              <span className="w-[3px] h-[3px] rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-[3px] h-[3px] rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-[3px] h-[3px] rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: '300ms' }} />
            </span>
          </div>
        )}
      </div>

      {/* Meta / Status */}
      <div className="flex items-center gap-2 shrink-0">
        {status !== 'running' && node.meta && (node.meta.latencyMs != null || node.meta.outputCount != null) && (
          <div className="flex flex-col items-end gap-0.5">
            {node.meta.latencyMs != null && (
              <span className="text-[10px] font-mono text-slate-400">
                {formatMs(node.meta.latencyMs)}
              </span>
            )}
            {node.meta.outputCount != null && (
              <span className="text-[10px] font-medium text-slate-400">
                {node.meta.outputCount} items
              </span>
            )}
          </div>
        )}
        <StatusIndicator status={status} size="sm" />
      </div>

      {/* Selection bar */}
      {isSelected && (
        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-full bg-blue-500" />
      )}
    </div>
  );
}

export function TestGenStepper({
  nodes,
  selectedNodeId,
  onNodeClick,
  autoFollowEnabled,
  onToggleAutoFollow,
  isRunning,
}: TestGenStepperProps) {
  const activeNodeRef = useRef<HTMLDivElement>(null);
  const runningNode = nodes.find(n => n.status === 'running' || n.status === 'waiting');

  const phaseStatus = (phase: (typeof PHASE_DEFS)[number]) => {
    const statuses = phase.nodeIds.map(id => nodes.find(n => n.id === id)?.status).filter(Boolean);
    if (statuses.some(s => s === 'error')) return 'error';
    if (statuses.every(s => s === 'completed' || s === 'auto-passed')) return 'completed';
    if (statuses.some(s => s === 'running' || s === 'waiting')) return 'current';
    return 'future';
  };

  return (
    <div className="bg-white text-slate-800 shrink-0 select-none flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="relative flex h-2 w-2">
            {isRunning && (
              <span className="animate-ping absolute inset-0 rounded-full bg-blue-400 opacity-75" />
            )}
            <span className={`relative inline-flex rounded-full h-2 w-2 ${isRunning ? 'bg-blue-500' : 'bg-slate-300'}`} />
          </div>
          <span className="text-[10px] font-bold tracking-widest text-slate-400 uppercase">
            Pipeline
          </span>
          {isRunning && runningNode && (
            <span className="text-[10px] text-blue-600 animate-pulse font-semibold">
              {runningNode.label}
            </span>
          )}
        </div>

        <button
          onClick={onToggleAutoFollow}
          disabled={isRunning}
          className={`
            text-[10px] font-semibold px-2.5 py-1 rounded-md transition-all duration-200
            ${isRunning
              ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
              : autoFollowEnabled
              ? 'bg-blue-500 text-white shadow-sm hover:bg-blue-600'
              : 'bg-white text-slate-600 border border-slate-200 hover:border-slate-300 hover:bg-slate-50'
            }
          `}
        >
          {isRunning && <Loader2 size={10} className="animate-spin inline mr-1" />}
          {isRunning ? 'Locked' : autoFollowEnabled ? 'Auto' : 'Manual'}
        </button>
      </div>

      {/* Timeline */}
      <div className="flex-1 overflow-y-auto px-3 pt-4 pb-6 scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-transparent">
        <div className="relative">
          {/* Vertical connector line */}
          <div className="absolute left-[14px] top-4 bottom-4 w-[2px] bg-gradient-to-b from-slate-200 via-slate-200 to-slate-100 rounded-full" />

          <div className="space-y-1">
            {PHASE_DEFS.map((phase, pIndex) => {
              const status = phaseStatus(phase);
              const complete = status === 'completed';
              const active = status === 'current';
              const error = status === 'error';
              const future = status === 'future';
              const isLast = pIndex === PHASE_DEFS.length - 1;

              return (
                <div key={phase.id} className="relative">
                  {/* Phase row */}
                  <div className="flex items-center gap-3 relative">
                    {/* Phase dot on timeline */}
                    <div className={`
                      relative z-10 flex items-center justify-center w-[18px] h-[18px] rounded-full border-2 transition-all duration-300 shrink-0
                      ${error ? 'bg-red-500 border-red-500 shadow-[0_0_8px_rgba(239,68,68,0.3)]'
                        : complete ? 'bg-emerald-500 border-emerald-500'
                        : active ? 'bg-blue-500 border-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.3)]'
                        : 'bg-white border-slate-300'
                      }
                    `}>
                      {complete ? (
                        <CheckCircle2 size={10} className="text-white" strokeWidth={3} />
                      ) : active ? (
                        <div className="w-2 h-2 rounded-full bg-white animate-pulse" />
                      ) : error ? (
                        <AlertCircle size={10} className="text-white" strokeWidth={3} />
                      ) : (
                        <span className="text-[8px] font-bold text-slate-400">{pIndex + 1}</span>
                      )}
                    </div>

                    {/* Phase label */}
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <span className={`
                        text-[11px] font-bold tracking-wider uppercase
                        ${error ? 'text-red-500'
                          : complete ? 'text-emerald-600'
                          : active ? 'text-blue-600'
                          : 'text-slate-400'
                        }
                      `}>
                        {phase.label}
                      </span>

                      {active && (
                        <span className="flex items-center gap-1 text-[9px] font-bold text-blue-500 bg-blue-50 px-1.5 py-0.5 rounded-full">
                          <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                          RUNNING
                        </span>
                      )}

                      {complete && !future && (
                        <CheckCircle2 size={12} className="text-emerald-400 shrink-0" strokeWidth={2} />
                      )}
                    </div>
                  </div>

                  {/* Nodes under this phase */}
                  <div className="ml-[8px] mt-1.5 space-y-1 pl-[6px] border-l-2 border-slate-100">
                    {phase.nodeIds.map((nodeId) => {
                      const node = nodes.find(n => n.id === nodeId);
                      if (!node) return null;
                      return (
                        <div key={nodeId} ref={selectedNodeId === nodeId ? activeNodeRef : undefined}>
                          <NodeCard
                            node={node}
                            isSelected={selectedNodeId === nodeId}
                            onNodeClick={onNodeClick}
                          />
                        </div>
                      );
                    })}
                  </div>

                  {/* Phase separator */}
                  {!isLast && (
                    <div className="ml-[14px] my-1 w-[2px] h-2 bg-slate-200 rounded-full" />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
