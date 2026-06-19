/**
 * RecorderRunHistory — 历史运行列表
 */

import { Trash2, CheckCircle2, AlertCircle, Loader2, Clock, ChevronLeft } from 'lucide-react';

interface RecorderRunHistoryProps {
  runs: any[];
  onSelect: (runId: string) => void;
  onDelete: (runId: string) => void;
  onBack: () => void;
}

const STATUS_META: Record<string, { icon: any; color: string; label: string }> = {
  running: { icon: Loader2, color: 'text-blue-500', label: 'Running' },
  refining: { icon: Loader2, color: 'text-purple-500', label: 'Refining' },
  replaying: { icon: Loader2, color: 'text-indigo-500', label: 'Replaying' },
  completed: { icon: CheckCircle2, color: 'text-emerald-500', label: 'Completed' },
  failed: { icon: AlertCircle, color: 'text-red-500', label: 'Failed' },
};

export function RecorderRunHistory({ runs, onSelect, onDelete, onBack }: RecorderRunHistoryProps) {
  return (
    <div className="h-full flex flex-col bg-white overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 shrink-0">
        <div className="flex items-center gap-2">
          <button
            onClick={onBack}
            className="text-xs text-slate-500 hover:text-slate-700 flex items-center gap-1"
          >
            <ChevronLeft size={14} />
            Back
          </button>
          <span className="text-slate-300">/</span>
          <span className="text-xs font-semibold text-slate-600">Run History</span>
        </div>
        <span className="text-xs text-slate-400">{runs.length} runs</span>
      </div>

      <div className="flex-1 overflow-y-auto">
        {runs.length === 0 ? (
          <div className="h-full flex items-center justify-center text-sm text-slate-400">
            No recording runs yet
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {runs.map((run) => {
              const meta = STATUS_META[run.status] ?? STATUS_META.failed;
              const Icon = meta.icon;
              const isRunning = run.status === 'running' || run.status === 'refining' || run.status === 'replaying';
              return (
                <div
                  key={run.runId}
                  className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors cursor-pointer"
                  onClick={() => onSelect(run.runId)}
                >
                  <Icon
                    size={16}
                    className={`${meta.color} ${isRunning ? 'animate-spin' : ''} shrink-0`}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-slate-700 truncate">
                        {run.nlCaseId}
                      </span>
                      <span className={`text-[10px] font-bold uppercase ${meta.color}`}>
                        {meta.label}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-slate-400 mt-0.5">
                      <span className="font-mono">{run.runId.slice(0, 20)}...</span>
                      {run.progress && (
                        <span>
                          {run.progress.completed}/{run.progress.total} steps
                          {run.progress.failed > 0 && (
                            <span className="text-red-400 ml-1">({run.progress.failed} failed)</span>
                          )}
                        </span>
                      )}
                      {run.result?.suiteId && (
                        <span className="text-emerald-500">Draft suite created</span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); onDelete(run.runId); }}
                    className="p-1.5 hover:bg-red-100 rounded transition-colors shrink-0"
                    title="Delete"
                  >
                    <Trash2 size={13} className="text-red-400" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
