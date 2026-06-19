/**
 * RecorderRuntimePanel — 运行时进度展示
 *
 * SSE 事件驱动的 step 列表 + 状态徽章 + takeover 交互。
 * 参考 docs/05-AIDrivenRecordingEngine.md §8.4.5
 */

import { useCallback } from 'react';
import {
  CheckCircle2,
  Loader2,
  AlertCircle,
  Clock,
  Eye,
  Hand,
  ChevronRight,
  ExternalLink,
} from 'lucide-react';
import type { RecorderRunState } from '@/shared/ai-driven-recorder-run';

interface RecorderRuntimePanelProps {
  state: RecorderRunState;
  onTakeoverComplete: (nlStepIndex: number) => void;
  onViewSuite: (suiteId: string, caseId: string) => void;
}

const STATUS_CONFIG = {
  pending: { icon: Clock, color: 'text-slate-400', bg: 'bg-slate-50', label: 'Pending', spin: false },
  running: { icon: Loader2, color: 'text-blue-500', bg: 'bg-blue-50', label: 'Running', spin: true },
  completed: { icon: CheckCircle2, color: 'text-emerald-500', bg: 'bg-emerald-50', label: 'Completed', spin: false },
  failed: { icon: AlertCircle, color: 'text-red-500', bg: 'bg-red-50', label: 'Failed', spin: false },
  takeover: { icon: Hand, color: 'text-amber-500', bg: 'bg-amber-50', label: 'Takeover', spin: false },
} as const;

export function RecorderRuntimePanel({
  state,
  onTakeoverComplete,
  onViewSuite,
}: RecorderRuntimePanelProps) {
  const handleTakeover = useCallback(
    (nlStepIndex: number) => {
      onTakeoverComplete(nlStepIndex);
    },
    [onTakeoverComplete],
  );

  const completedCount = state.steps.filter((s) => s.status === 'completed').length;
  const totalCount = state.steps.length;
  const progress = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  return (
    <div className="h-full flex flex-col bg-white overflow-hidden">
      {/* Status bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            {state.isStarting ? (
              <Loader2 size={14} className="animate-spin text-blue-500" />
            ) : state.isConnected ? (
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inset-0 rounded-full bg-green-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
              </span>
            ) : (
              <span className="w-2 h-2 rounded-full bg-slate-300" />
            )}
            <span className="text-xs font-semibold text-slate-600">
              {state.isStarting ? 'Starting...' : state.isConnected ? 'Connected' : 'Disconnected'}
            </span>
          </div>
          {state.runId && (
            <span className="text-[10px] font-mono text-slate-400 px-2 py-0.5 rounded bg-slate-100">
              {state.runId.slice(0, 16)}...
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-400">{completedCount}/{totalCount} steps</span>
          <div className="w-24 h-1.5 rounded-full bg-slate-100 overflow-hidden">
            <div
              className="h-full bg-blue-500 transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </div>

      {/* Error banner */}
      {state.error && (
        <div className="flex items-center gap-2 px-4 py-2 bg-red-50 border-b border-red-200 text-xs text-red-700">
          <AlertCircle size={14} className="shrink-0" />
          <span className="flex-1">{state.error.message}</span>
        </div>
      )}

      {/* Steps list */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {state.steps.length === 0 ? (
          <div className="h-full flex items-center justify-center text-sm text-slate-400">
            Waiting for steps...
          </div>
        ) : (
          <div className="space-y-2">
            {state.steps.map((step) => {
              const cfg = STATUS_CONFIG[step.status];
              const Icon = cfg.icon;
              return (
                <div
                  key={step.nlStepIndex}
                  className={`rounded-xl border ${cfg.bg} border-slate-100 transition-all`}
                >
                  <div className="flex items-start gap-3 px-3 py-2.5">
                    {/* Status icon */}
                    <div className="mt-0.5 shrink-0">
                      <Icon
                        size={16}
                        className={`${cfg.color} ${cfg.spin ? 'animate-spin' : ''}`}
                        strokeWidth={2}
                      />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-[10px] font-mono font-bold text-slate-400">
                          #{step.nlStepIndex}
                        </span>
                        <span className={`text-[10px] font-bold uppercase tracking-wide ${cfg.color}`}>
                          {cfg.label}
                        </span>
                        {step.retryCount > 0 && (
                          <span className="text-[10px] text-amber-600 font-medium">
                            retry {step.retryCount}
                          </span>
                        )}
                        {step.durationMs != null && (
                          <span className="text-[10px] font-mono text-slate-400">
                            {(step.durationMs / 1000).toFixed(1)}s
                          </span>
                        )}
                      </div>
                      <div className="text-sm text-slate-700 font-medium leading-snug">
                        {step.instruction}
                      </div>
                      {step.expected && (
                        <div className="text-xs text-slate-400 mt-0.5">
                          Expected: {step.expected}
                        </div>
                      )}
                      {step.observeHint && (
                        <div className="flex items-start gap-1.5 mt-1.5 px-2 py-1 rounded bg-blue-50/50 border border-blue-100">
                          <Eye size={11} className="text-blue-400 mt-0.5 shrink-0" />
                          <span className="text-xs text-blue-600">{step.observeHint}</span>
                        </div>
                      )}
                      {step.error && (
                        <div className="flex items-start gap-1.5 mt-1.5 px-2 py-1 rounded bg-red-50/50 border border-red-100">
                          <AlertCircle size={11} className="text-red-400 mt-0.5 shrink-0" />
                          <span className="text-xs text-red-600">{step.error}</span>
                        </div>
                      )}
                    </div>

                    {/* Recorded step count */}
                    {step.recordedStepCount != null && step.recordedStepCount > 0 && (
                      <div className="shrink-0 text-right">
                        <div className="text-[10px] font-bold text-emerald-600">
                          +{step.recordedStepCount}
                        </div>
                        <div className="text-[9px] text-slate-400">steps</div>
                      </div>
                    )}
                  </div>

                  {/* Takeover action */}
                  {step.status === 'takeover' && (
                    <div className="px-3 pb-2.5 -mt-1">
                      <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-amber-100/50 border border-amber-200">
                        <span className="text-xs text-amber-700">
                          Manual intervention required. Complete this step in the browser, then confirm.
                        </span>
                        <button
                          onClick={() => handleTakeover(step.nlStepIndex)}
                          className="flex items-center gap-1 px-3 py-1 rounded-md bg-amber-500 text-white text-xs font-semibold hover:bg-amber-600 transition-colors shrink-0"
                        >
                          <CheckCircle2 size={12} />
                          Done
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Completion banner (AutoReplay 已禁用，直接显示 View Draft Suite 按钮) */}
      {state.status === 'completed' && state.suiteId && state.caseId && (
        <div className="px-4 py-3 border-t border-slate-200 shrink-0">
          <button
            onClick={() => onViewSuite(state.suiteId!, state.caseId!)}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 transition-colors"
          >
            View Draft Suite in Test Builder
            <ExternalLink size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
