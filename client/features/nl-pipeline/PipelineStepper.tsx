import { useRef, useEffect, useCallback } from 'react';
import { 
  Brain, 
  PenTool, 
  Star, 
  Zap, 
  CheckCircle2, 
  AlertCircle, 
  Activity, 
  ArrowRight, 
  Maximize2,
  ShieldCheck,
  Sparkles,
  Loader2
} from 'lucide-react';
import { motion } from 'motion/react';
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

function formatTokens(n: number) {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return n.toLocaleString();
}

export function PipelineStepper({
  nodes,
  selectedNodeId,
  onNodeClick,
  autoFollowEnabled,
  onToggleAutoFollow,
  isRunning,
}: PipelineStepperProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const activeNodeRef = useRef<HTMLDivElement>(null);

  // Scroll to selected or active node smoothly
  const handleScrollToTarget = useCallback(() => {
    if (activeNodeRef.current && scrollRef.current) {
      const parent = scrollRef.current;
      const target = activeNodeRef.current;
      const offsetLeft = target.offsetLeft - parent.offsetLeft - parent.clientWidth / 2 + target.clientWidth / 2;
      parent.scrollTo({
        left: Math.max(0, offsetLeft),
        behavior: 'smooth',
      });
    }
  }, []);

  useEffect(() => {
    if (autoFollowEnabled) {
      // Small timeout to allow render cycle to finish
      const timer = setTimeout(handleScrollToTarget, 100);
      return () => clearTimeout(timer);
    }
  }, [selectedNodeId, autoFollowEnabled, handleScrollToTarget]);

  // Find active node status
  const runningNode = nodes.find(n => n.status === 'running' || n.status === 'waiting');

  return (
    <div className="bg-slate-50 border-b border-slate-200 text-slate-800 shrink-0 select-none relative overflow-hidden">
      {/* Header Controller */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-slate-200 bg-white relative z-10 shrink-0">
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
            className={`text-[9px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-lg border transition-all cursor-pointer ${
              autoFollowEnabled
                ? 'bg-blue-600 border-blue-600 text-white shadow-sm'
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
            }`}
          >
            {autoFollowEnabled ? '🛰️ Auto-Follow' : '🛰️ Manual View'}
          </button>
          
          {runningNode && (
            <button
              onClick={handleScrollToTarget}
              title="Locate Current Executing Step"
              className="p-1 px-2.5 bg-white border border-slate-200 hover:border-slate-300 text-slate-600 hover:text-blue-600 rounded-lg transition-all flex items-center gap-1 text-[10px] shadow-sm cursor-pointer"
            >
              <Maximize2 size={10} /> Focus Active
            </button>
          )}
        </div>
      </div>

      {/* Horizontally scrolling unified pipeline container */}
      <div 
        ref={scrollRef} 
        className="overflow-x-auto py-4 px-6 relative z-10"
      >
        <div className="flex items-stretch gap-5" style={{ minWidth: 'max-content' }}>
          {PHASE_DEFS.map((phase, pIndex) => {
            // Find current phase state based on composite nodes
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

            // Clean, professional light theme palettes based on phase active status
            const phaseTheme = {
              indigo: { border: 'border-indigo-100 bg-indigo-50/20', titleBg: 'bg-indigo-50 border-indigo-100/85 text-indigo-750' },
              sky: { border: 'border-sky-100 bg-sky-50/20', titleBg: 'bg-sky-50 border-sky-100/85 text-sky-755' },
              violet: { border: 'border-violet-100 bg-violet-50/20', titleBg: 'bg-violet-50 border-violet-100/85 text-violet-750' },
              amber: { border: 'border-amber-100 bg-amber-50/20', titleBg: 'bg-amber-50 border-amber-100/85 text-amber-750' },
              emerald: { border: 'border-emerald-100 bg-emerald-50/20', titleBg: 'bg-emerald-50 border-emerald-100/85 text-emerald-750' },
            }[phase.colorClass];

            return (
              <div key={phase.id} className="flex items-center">
                {/* Horizontal flow progress line between Phase Groups */}
                {pIndex > 0 && (
                  <div className="flex items-center shrink-0 px-1 mx-1">
                    <div className={`w-8 h-0.5 rounded ${
                      phaseStatus === 'completed'
                        ? 'bg-emerald-400'
                        : phaseStatus === 'current'
                          ? 'bg-blue-400 animate-pulse'
                          : 'bg-slate-200'
                    }`} />
                    <ArrowRight size={12} className={`-ml-2 ${
                      phaseStatus === 'completed'
                        ? 'text-emerald-500'
                        : phaseStatus === 'current'
                          ? 'text-blue-500'
                          : 'text-slate-300'
                    }`} />
                  </div>
                )}

                {/* Phase Swimlane */}
                <div className={`p-2.5 rounded-xl border bg-white/70 shadow-sm flex flex-col justify-between transition-all ${phaseTheme.border} ${
                  phaseStatus === 'future' ? 'opacity-65 hover:opacity-100' : ''
                }`}>
                  {/* High-level Phase header bar */}
                  <div className={`flex items-center gap-1.5 px-2 py-1 mb-2.5 rounded-lg border text-[10px] font-bold uppercase tracking-wider ${phaseTheme.titleBg}`}>
                    <phase.icon className="shrink-0" size={11} />
                    <span>{phase.label}</span>
                    
                    {phaseStatus === 'completed' && (
                      <span className="ml-auto text-emerald-600 font-bold">✓</span>
                    )}
                    {phaseStatus === 'current' && (
                      <span className="ml-auto flex h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse" />
                    )}
                  </div>

                  {/* Connected executable node cards inside the phase */}
                  <div className="flex items-center gap-2">
                    {phase.nodeIds.map((nodeId, nIndex) => {
                      const node = nodes.find(n => n.id === nodeId);
                      if (!node) return null;

                      const isSelected = selectedNodeId === nodeId;
                      const isActiveNode = node.status === 'running' || node.status === 'waiting';
                      const isRef = isSelected || isActiveNode;

                      // Elegant light theme statuses
                      let nodeBg = 'bg-white hover:bg-slate-100/50 border-slate-200 text-slate-500 hover:text-slate-700 shadow-sm';
                      let activeRing = '';
                      let labelColor = 'text-slate-650';
                      
                      if (node.status === 'completed') {
                        nodeBg = 'bg-emerald-55/35 hover:bg-emerald-50/60 border-emerald-200 text-slate-700';
                        labelColor = 'text-emerald-800 font-medium';
                      } else if (node.status === 'auto-passed') {
                        nodeBg = 'bg-slate-50/50 border-slate-200 text-slate-400';
                        labelColor = 'text-slate-400';
                      } else if (node.status === 'running') {
                        nodeBg = 'bg-blue-50 border-blue-400 text-blue-700 shadow-sm';
                        activeRing = 'ring-2 ring-blue-500/10';
                        labelColor = 'text-blue-900 font-semibold';
                      } else if (node.status === 'waiting') {
                        nodeBg = 'bg-amber-50 border-amber-400 text-amber-700 shadow-sm animate-pulse';
                        activeRing = 'ring-2 ring-amber-500/10';
                        labelColor = 'text-amber-900 font-semibold';
                      } else if (node.status === 'error') {
                        nodeBg = 'bg-red-50 border-red-300 text-red-700';
                        labelColor = 'text-red-900 font-semibold';
                      }

                      if (isSelected) {
                        nodeBg = `${nodeBg.split(' ')[0]} border-2 border-blue-600 text-blue-950 font-semibold shadow-md`;
                      }

                      const NodeIcon = nodeIcons[nodeId] || ShieldCheck;

                      return (
                        <div key={nodeId} className="flex items-center">
                          {/* Inner Step-to-Step Arrow connector */}
                          {nIndex > 0 && (
                            <div className="flex items-center shrink-0 text-slate-300 px-1">
                              <ArrowRight size={10} className={node.status === 'completed' ? 'text-emerald-500' : 'text-slate-300'} />
                            </div>
                          )}

                          {/* Individual Node Card */}
                          <div
                            ref={isRef ? activeNodeRef : undefined}
                            onClick={() => onNodeClick(nodeId)}
                            className={`px-3 py-2 rounded-xl border text-left cursor-pointer select-none transition-all duration-200 w-36 relative overflow-hidden group ${nodeBg} ${activeRing}`}
                          >
                            {/* Accent highlight bar for chosen selections */}
                            {isSelected && (
                              <div className="absolute top-0 left-0 right-0 h-[2.5px] bg-blue-600" />
                            )}

                            <div className="flex items-start justify-between gap-1">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <NodeIcon size={12} className={`shrink-0 ${
                                  node.status === 'running' 
                                    ? 'text-blue-500 animate-pulse' 
                                    : node.status === 'waiting'
                                      ? 'text-amber-500 animate-bounce'
                                      : node.status === 'completed'
                                        ? 'text-emerald-500'
                                        : 'text-slate-400 group-hover:text-slate-500'
                                }`} />
                                <span className={`text-[11px] truncate leading-tight ${labelColor}`}>
                                  {nodeLabels[nodeId] || node.label}
                                </span>
                              </div>
                            </div>

                            {/* Node Status / Metadata Label Subtitle */}
                            <div className="mt-1.5 flex flex-col gap-0.5 justify-end">
                              {node.status === 'running' && (
                                <span className="flex items-center gap-1 text-[9px] font-medium text-blue-600 animate-pulse">
                                  <Loader2 size={8} className="animate-spin" /> Thinking...
                                </span>
                              )}
                              {node.status === 'waiting' && (
                                <span className="flex items-center gap-1 text-[9px] font-bold text-amber-600 animate-pulse">
                                  ⚠️ Action Needed
                                </span>
                              )}
                              {node.status === 'completed' && !node.meta?.latencyMs && (
                                <span className="text-[9px] text-emerald-600 font-medium flex items-center gap-0.5">
                                  ✓ Done
                                </span>
                              )}
                              {node.status === 'auto-passed' && (
                                <span className="text-[9px] text-slate-400 flex items-center gap-0.5">
                                  ✓ Auto-Passed
                                </span>
                              )}
                              {node.status === 'idle' && (
                                <span className="text-[9px] text-slate-400">Pending</span>
                              )}
                              {node.status === 'error' && (
                                <span className="text-[9px] text-red-500 font-medium">✕ Failed</span>
                              )}

                              {/* Real-time stats badges printed directly on the Node Card */}
                              {node.meta && (node.meta.latencyMs || node.meta.tokenUsage || node.meta.outputCount) && (
                                <div className="flex flex-wrap items-center gap-1 mt-1 pt-1 border-t border-slate-100 text-[8px] text-slate-400 group-hover:text-slate-500 transition-colors">
                                  {node.meta.latencyMs && (
                                    <span className="font-mono bg-slate-50 px-1 py-0.5 rounded text-slate-500 border border-slate-100 shrink-0">
                                      ⏱ {formatMs(node.meta.latencyMs)}
                                    </span>
                                  )}
                                  {node.meta.outputCount && (
                                    <span className="bg-blue-50 border border-blue-100 px-1 py-0.5 rounded text-blue-600 font-medium truncate max-w-full">
                                      📦 {node.meta.outputCount}{node.meta.outputLabel === 'conditions' ? 'C' : node.meta.outputLabel === 'cases' ? 'T' : ''}
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
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
