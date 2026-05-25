import { useRef } from 'react';
import {
  Brain,
  PenTool,
  Star,
  Zap,
  CheckCircle2,
  Activity,
  ArrowRight,
  ShieldCheck,
  Loader2
} from 'lucide-react';

import type { PipelineNode, NodeId } from '@/shared/pipeline-run/types';

const PHASE_DEFS = [
  { id: 'prep', label: 'Preparation', nodeIds: ['preparation'] as NodeId[], icon: Zap, colorClass: 'indigo' },
  { 
    id: 'analysis', 
    label: 'Analysis Phase', 
    nodeIds: ['agent_test_analyst', 'checkpoint_1'] as NodeId[], 
    icon: Brain, 
    colorClass: 'sky' 
  },
  { 
    id: 'design', 
    label: 'Design Phase', 
    nodeIds: ['agent_test_designer', 'checkpoint_2'] as NodeId[], 
    icon: PenTool, 
    colorClass: 'violet' 
  },
  { 
    id: 'quality', 
    label: 'Quality Phase', 
    nodeIds: ['agent_quality_manager', 'checkpoint_3'] as NodeId[], 
    icon: Star, 
    colorClass: 'amber' 
  },
  { id: 'complete', label: 'Complete', nodeIds: ['complete'] as NodeId[], icon: CheckCircle2, colorClass: 'emerald' },
] as const;

const nodeLabels: Record<NodeId, string> = {
  preparation: 'Initialize Environment',
  agent_test_analyst: 'AI Test Analyst',
  checkpoint_1: 'Review Conditions',
  agent_test_designer: 'AI Test Designer',
  checkpoint_2: 'Review Drafts',
  agent_quality_manager: 'AI Quality Manager',
  checkpoint_3: 'Final Review',
  complete: 'Pipeline Complete',
};

const nodeIcons: Record<string, React.ComponentType<any>> = {
  preparation: Zap,
  agent_test_analyst: Brain,
  checkpoint_1: ShieldCheck,
  agent_test_designer: PenTool,
  checkpoint_2: ShieldCheck,
  agent_quality_manager: Star,
  checkpoint_3: ShieldCheck,
  complete: CheckCircle2,
};

interface PipelineStepperProps {
  nodes: PipelineNode[];
  selectedNodeId: NodeId | null;
  onNodeClick: (nodeId: string) => void;
  autoFollowEnabled: boolean;
  onToggleAutoFollow: () => void;
  isRunning: boolean;
}

function formatMs(ms: number) {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function PipelineStepper({
  nodes,
  selectedNodeId,
  onNodeClick,
  autoFollowEnabled,
  onToggleAutoFollow,
  isRunning,
}: PipelineStepperProps) {
  const activeNodeRef = useRef<HTMLDivElement>(null);

  // Find active node status
  const runningNode = nodes.find(n => n.status === 'running' || n.status === 'waiting');

  return (
    <div className="bg-slate-50 border-b border-slate-200 text-slate-800 shrink-0 select-none">
      {/* Header Controller */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-slate-200 bg-white">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <div className="relative flex h-2 w-2">
              {isRunning && (
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
              )}
              <span className={`relative inline-flex rounded-full h-2 w-2 ${isRunning ? 'bg-blue-500' : 'bg-slate-400'}`}></span>
            </div>
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Agent Flow Status</span>
          </div>

          {isRunning && runningNode && (
            <div className="flex items-center gap-1.5 text-[10px] px-2 py-0.5 rounded-full bg-blue-50 border border-blue-100 text-blue-600 animate-pulse">
              <Activity size={10} className="animate-spin text-blue-500" />
              <span>In Progress: <b className="font-semibold text-blue-800">{runningNode.label}</b></span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onToggleAutoFollow}
            disabled={isRunning}
            className={`text-[9px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-lg border transition-all cursor-pointer flex items-center gap-1 ${
              isRunning
                ? 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed'
                : autoFollowEnabled
                ? 'bg-blue-600 border-blue-600 text-white shadow-sm'
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
            }`}
            title={isRunning ? 'Auto-Follow is locked during pipeline execution' : ''}
          >
            {isRunning && <Loader2 size={10} className="animate-spin" />}
            {isRunning ? '🔒 Auto-Lock' : autoFollowEnabled ? '🛰️ Auto-Follow' : '🛰️ Manual View'}
          </button>
        </div>
      </div>

      {/* Pipeline flow - 5 phases distributed evenly */}
      <div className="w-full px-4 py-3">
        <div className="grid grid-cols-5 gap-3">
          {PHASE_DEFS.map((phase, pIndex) => {
            const phaseNodes = nodes.filter(n => phase.nodeIds.includes(n.id));
            const statuses = phaseNodes.map(n => n.status);
            const hasError = statuses.some(s => s === 'error');
            const allDone = statuses.every(s => s === 'completed' || s === 'auto-passed');
            const hasActive = statuses.some(s => s === 'running' || s === 'waiting');

            const phaseStatus = hasError
              ? 'error'
              : allDone
              ? 'completed'
              : hasActive
              ? 'current'
              : 'future';

            const phaseTheme = {
              indigo: { border: 'border-slate-200 bg-white', titleBg: 'bg-slate-100 border-slate-200 text-slate-700' },
              sky: { border: 'border-slate-200 bg-white', titleBg: 'bg-slate-100 border-slate-200 text-slate-700' },
              violet: { border: 'border-slate-200 bg-white', titleBg: 'bg-slate-100 border-slate-200 text-slate-700' },
              amber: { border: 'border-slate-200 bg-white', titleBg: 'bg-slate-100 border-slate-200 text-slate-700' },
              emerald: { border: 'border-slate-200 bg-white', titleBg: 'bg-slate-100 border-slate-200 text-slate-700' },
            }[phase.colorClass];

            return (
              <div key={phase.id} className="relative">
                {/* Connector arrow between phases */}
                {pIndex > 0 && (
                  <div className="absolute -left-3 top-1/2 -translate-y-1/2 z-10 text-slate-300">
                    <ArrowRight size={14} />
                  </div>
                )}

                <div className={`rounded-lg border p-2 w-full transition-all ${phaseTheme.border} ${
                  phaseStatus === 'future' ? 'opacity-70' : ''
                }`}>
                  {/* Phase Header */}
                  <div className={`flex items-center gap-1.5 px-1.5 py-1 mb-2 rounded text-[9px] font-bold uppercase tracking-wider ${phaseTheme.titleBg}`}>
                    <phase.icon className="shrink-0" size={10} />
                    <span className="truncate">{phase.label}</span>
                    {phaseStatus === 'completed' && (
                      <span className="ml-auto text-emerald-600">✓</span>
                    )}
                    {phaseStatus === 'current' && (
                      <span className="ml-auto flex h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse" />
                    )}
                  </div>

                  {/* Node cards - fixed height container */}
                  <div className="flex flex-col gap-1.5 min-h-[72px]">
                    {phase.nodeIds.map((nodeId) => {
                      const node = nodes.find(n => n.id === nodeId);
                      if (!node) return null;

                      const isSelected = selectedNodeId === nodeId;
                      const isRef = isSelected || node.status === 'running' || node.status === 'waiting';
                      const isCheckpoint = nodeId.startsWith('checkpoint_');

                      let nodeBg = 'bg-white border-slate-200 text-slate-600';
                      if (isCheckpoint) {
                        nodeBg = 'bg-slate-100 border-slate-300 text-slate-700';
                      } else if (node.status === 'completed') {
                        nodeBg = 'bg-emerald-50 border-emerald-200 text-slate-700';
                      } else if (node.status === 'running') {
                        nodeBg = 'bg-blue-50 border-blue-300 text-blue-800';
                      } else if (node.status === 'waiting') {
                        nodeBg = 'bg-amber-50 border-amber-300 text-amber-800';
                      } else if (node.status === 'error') {
                        nodeBg = 'bg-red-50 border-red-200 text-red-700';
                      }

                      if (isSelected) {
                        nodeBg = 'bg-blue-50 border-2 border-blue-500 text-blue-900';
                      }

                      const NodeIcon = nodeIcons[nodeId] || ShieldCheck;

                      return (
          <div
            key={nodeId}
            ref={isRef ? activeNodeRef : undefined}
            onClick={() => onNodeClick(nodeId)}
            className={`px-2 py-1.5 rounded border text-left cursor-pointer select-none transition-all text-[10px] min-h-[42px] flex items-center ${nodeBg}`}
          >
            <div className="flex items-center gap-1.5 min-w-0 flex-1">
              <NodeIcon size={10} className={`shrink-0 ${
                node.status === 'running'
                  ? 'text-blue-500 animate-pulse'
                  : node.status === 'waiting'
                    ? 'text-amber-500'
                    : node.status === 'completed'
                      ? 'text-emerald-500'
                      : 'text-slate-400'
              }`} />
              <span className="truncate font-medium">{nodeLabels[nodeId] || node.label}</span>
              {node.status === 'running' && (
                <span className="text-[9px] font-medium text-blue-600 animate-pulse shrink-0">
                  Thinking...
                </span>
              )}
            </div>

                          {node.meta && (node.meta.latencyMs || node.meta.outputCount) && (
                            <div className="flex items-center gap-1 mt-0 pt-0 border-t-0 text-[8px] text-slate-500 shrink-0">
                              {node.meta.latencyMs && (
                                <span className="font-mono whitespace-nowrap">⏱ {formatMs(node.meta.latencyMs)}</span>
                              )}
                              {node.meta.outputCount && (
                                <span className="whitespace-nowrap">📦 {node.meta.outputCount}</span>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
