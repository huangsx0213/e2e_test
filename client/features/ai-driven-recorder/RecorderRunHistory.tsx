/**
 * RecorderRunHistory — 历史运行列表
 */

import { useState, useEffect } from 'react';
import { Trash2, CheckCircle2, AlertCircle, Loader2, ChevronLeft } from 'lucide-react';
import { ConfirmModal } from '@/shared/ui/ConfirmModal';

interface RecorderRunHistoryProps {
  runs: any[];
  onSelect: (runId: string) => void;
  onDeleteRun: (runId: string) => Promise<void>;
  onBack: () => void;
}

const STATUS_META: Record<string, { icon: any; color: string; label: string }> = {
  running: { icon: Loader2, color: 'text-blue-500', label: 'Running' },
  refining: { icon: Loader2, color: 'text-purple-500', label: 'Refining' },
  replaying: { icon: Loader2, color: 'text-indigo-500', label: 'Replaying' },
  completed: { icon: CheckCircle2, color: 'text-emerald-500', label: 'Completed' },
  failed: { icon: AlertCircle, color: 'text-red-500', label: 'Failed' },
};

export function RecorderRunHistory({ runs, onSelect, onDeleteRun, onBack }: RecorderRunHistoryProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleteConfirm, setDeleteConfirm] = useState<{ type: 'single'; id: string } | { type: 'bulk' } | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Reset selection when runs list changes (e.g., after refresh)
  useEffect(() => {
    setSelectedIds((prev) => {
      const valid = new Set<string>();
      for (const id of prev) {
        if (runs.some((r) => r.runId === id)) valid.add(id);
      }
      return valid;
    });
  }, [runs]);

  const allSelected = runs.length > 0 && runs.every((r) => selectedIds.has(r.runId));
  const someSelected = selectedIds.size > 0 && !allSelected;

  const toggleAll = () => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(runs.map((r) => r.runId)));
    }
  };

  const toggleOne = (runId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(runId)) next.delete(runId);
      else next.add(runId);
      return next;
    });
  };

  const handleConfirmDelete = async () => {
    if (!deleteConfirm) return;
    setDeleting(true);
    try {
      if (deleteConfirm.type === 'single') {
        await onDeleteRun(deleteConfirm.id);
        setSelectedIds((prev) => {
          const next = new Set(prev);
          next.delete(deleteConfirm.id);
          return next;
        });
      } else {
        for (const id of selectedIds) {
          try {
            await onDeleteRun(id);
          } catch {
            // best effort
          }
        }
        setSelectedIds(new Set());
      }
    } finally {
      setDeleting(false);
      setDeleteConfirm(null);
    }
  };

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
        <div className="flex items-center gap-3">
          {selectedIds.size > 0 && (
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-slate-500">{selectedIds.size} selected</span>
              <button
                onClick={() => setDeleteConfirm({ type: 'bulk' })}
                disabled={deleting}
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-red-300 text-red-700 text-xs font-medium hover:bg-red-50 disabled:opacity-50 transition-colors"
              >
                <Trash2 size={12} />
                {deleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          )}
          <span className="text-xs text-slate-400">{runs.length} runs</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {runs.length === 0 ? (
          <div className="h-full flex items-center justify-center text-sm text-slate-400">
            No recording runs yet
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            <div className="flex items-center gap-3 px-4 py-2 bg-slate-50 border-b border-slate-100">
              <input
                type="checkbox"
                checked={allSelected}
                ref={(el) => {
                  if (el) el.indeterminate = someSelected;
                }}
                onChange={toggleAll}
                className="rounded border-slate-300 text-blue-600 focus:ring-blue-500/20 shrink-0"
              />
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Select all</span>
            </div>
            {runs.map((run) => {
              const meta = STATUS_META[run.status] ?? STATUS_META.failed;
              const Icon = meta.icon;
              const isRunning = run.status === 'running' || run.status === 'refining' || run.status === 'replaying';
              const isSelected = selectedIds.has(run.runId);
              return (
                <div
                  key={run.runId}
                  className={`flex items-center gap-3 px-4 py-3 hover:bg-slate-50 transition-colors group ${
                    isSelected ? 'bg-blue-50/50' : ''
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleOne(run.runId)}
                    onClick={(e) => e.stopPropagation()}
                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500/20 shrink-0"
                  />
                  <div
                    className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer"
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
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); setDeleteConfirm({ type: 'single', id: run.runId }); }}
                    className="p-1.5 hover:bg-red-100 rounded transition-colors shrink-0 text-slate-300 hover:text-red-500"
                    title="Delete"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <ConfirmModal
        isOpen={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        onConfirm={handleConfirmDelete}
        title={deleteConfirm?.type === 'bulk' ? `Delete ${selectedIds.size} runs?` : 'Delete run?'}
        message={
          deleteConfirm?.type === 'bulk'
            ? `Are you sure you want to delete ${selectedIds.size} selected runs? This action cannot be undone.`
            : 'Are you sure you want to delete this run? This action cannot be undone.'
        }
        confirmLabel="Delete"
        loading={deleting}
      />
    </div>
  );
}
