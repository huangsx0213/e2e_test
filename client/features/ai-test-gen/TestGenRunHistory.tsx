import React, { useState, useMemo, useCallback } from 'react';
import { Search, Trash2, RefreshCw } from 'lucide-react';
import { ConfirmModal } from '@/shared/ui/ConfirmModal';

interface TestGenRun {
  id: string;
  status: string;
  phase: string;
  mode: string;
  current_batch: number;
  total_batches: number;
  config: { name?: string } | null;
  model_name: string | null;
  provider_config_name: string | null;
  created_at: string;
}

interface TestGenRunHistoryProps {
  runs: TestGenRun[];
  onSelect: (runId: string) => void;
  onBack?: () => void;
  onDeleteRun: (runId: string) => Promise<void>;
  onRetryRun: (runId: string) => Promise<void>;
}

const statusBadge: Record<string, string> = {
  COMPLETED: 'bg-green-100 text-green-700',
  RUNNING: 'bg-blue-100 text-blue-700',
  WAITING_REVIEW: 'bg-orange-100 text-orange-700',
  FAILED: 'bg-red-100 text-red-700',
  PAUSED: 'bg-yellow-100 text-yellow-700',
};

export function TestGenRunHistory({ runs, onSelect, onBack, onDeleteRun, onRetryRun }: TestGenRunHistoryProps) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [modeFilter, setModeFilter] = useState('All');
  const [deleteConfirm, setDeleteConfirm] = useState<{ type: 'single'; id: string } | { type: 'bulk' } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [retryingRunId, setRetryingRunId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const filtered = useMemo(() => {
    return runs.filter(r => {
      if (search) {
        const name = r.config?.name || r.id;
        if (!name.toLowerCase().includes(search.toLowerCase())) return false;
      }
      if (statusFilter !== 'All' && r.status !== statusFilter) return false;
      if (modeFilter !== 'All' && r.mode !== modeFilter) return false;
      return true;
    });
  }, [runs, search, statusFilter, modeFilter]);

  const allSelected = filtered.length > 0 && filtered.every(r => selectedIds.has(r.id));

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map(r => r.id)));
    }
  }, [allSelected, filtered]);

  const handleBulkDelete = useCallback(async () => {
    setDeleting(true);
    for (const id of selectedIds) {
      try {
        await onDeleteRun(id);
      } catch {}
    }
    setSelectedIds(new Set());
    setDeleting(false);
    setDeleteConfirm(null);
  }, [selectedIds, onDeleteRun]);

  return (
    <div className="flex-1 flex flex-col bg-white">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-200">
        <h3 className="text-sm font-medium text-slate-700">Run History</h3>
        <div className="flex-1" />
        {selectedIds.size > 0 && (
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-slate-500">{selectedIds.size} selected</span>
            <button
              onClick={() => setDeleteConfirm({ type: 'bulk' })}
              disabled={deleting}
              className="px-2 py-1 text-xs font-medium rounded border border-red-300 text-red-700 hover:bg-red-50 disabled:opacity-50 transition-colors"
            >
              {deleting ? 'Deleting...' : 'Delete'}
            </button>
          </div>
        )}
      </div>

      <div className="px-4 py-2 flex gap-2 border-b border-slate-100">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-2 top-2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search runs..."
            className="w-full border border-slate-200 rounded pl-7 pr-2 py-1 text-xs focus:outline-none focus:border-blue-400"
          />
        </div>
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="border border-slate-200 rounded px-2 py-1 text-xs"
        >
          <option value="All">All Status</option>
          <option value="COMPLETED">Completed</option>
          <option value="RUNNING">Running</option>
          <option value="WAITING_REVIEW">Waiting</option>
          <option value="FAILED">Failed</option>
        </select>
        <select
          value={modeFilter}
          onChange={e => setModeFilter(e.target.value)}
          className="border border-slate-200 rounded px-2 py-1 text-xs"
        >
          <option value="All">All Modes</option>
          <option value="auto">Auto</option>
          <option value="interactive">Interactive</option>
        </select>
      </div>

      <div className="flex-1 overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-slate-50">
            <tr className="border-b border-slate-200 text-left">
              <th className="px-2 py-2 w-8">
                <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} className="rounded border-slate-300" />
              </th>
              <th className="px-4 py-2 text-xs font-medium text-slate-500">#</th>
              <th className="px-4 py-2 text-xs font-medium text-slate-500">Name</th>
              <th className="px-4 py-2 text-xs font-medium text-slate-500">Status</th>
              <th className="px-4 py-2 text-xs font-medium text-slate-500">Mode</th>
              <th className="px-4 py-2 text-xs font-medium text-slate-500">Model</th>
              <th className="px-4 py-2 text-xs font-medium text-slate-500">Date</th>
              <th className="px-4 py-2 text-xs font-medium text-slate-500">Results</th>
              <th className="px-4 py-2 text-xs font-medium text-slate-500 w-10"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((run, i) => (
              <tr
                key={run.id}
                className={`border-b border-slate-100 hover:bg-slate-50 transition-colors group ${selectedIds.has(run.id) ? 'bg-blue-50/50' : ''}`}
              >
                <td className="px-2 py-2" onClick={e => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={selectedIds.has(run.id)}
                    onChange={() => toggleSelect(run.id)}
                    className="rounded border-slate-300"
                  />
                </td>
                <td className="px-4 py-2 text-xs text-slate-400">{runs.length - i}</td>
                <td
                  className="px-4 py-2 text-xs font-medium text-slate-700 cursor-pointer"
                  onClick={() => onSelect(run.id)}
                >
                  {run.config?.name || run.id}
                </td>
                <td
                  className="px-4 py-2 cursor-pointer"
                  onClick={() => onSelect(run.id)}
                >
                  <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${statusBadge[run.status] || 'bg-slate-100 text-slate-600'}`}>
                    {run.status}
                  </span>
                </td>
                <td className="px-4 py-2 text-xs text-slate-500">{run.mode}</td>
                <td className="px-4 py-2 text-xs text-slate-500">
                  {run.model_name ? (
                    <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-mono text-[10px]">{run.model_name}</span>
                  ) : '-'}
                </td>
                <td className="px-4 py-2 text-xs text-slate-400">
                  {run.created_at?.slice(0, 16) || '-'}
                </td>
                <td className="px-4 py-2 text-xs text-slate-500">
                  {run.current_batch}/{run.total_batches} batches
                </td>
                <td className="px-4 py-2 text-right">
                  <div className="flex items-center justify-end gap-2.5">
                    {run.status === 'FAILED' && (
                      <button
                        disabled={retryingRunId === run.id}
                        onClick={async (e) => {
                          e.stopPropagation();
                          setRetryingRunId(run.id);
                          try {
                            await onRetryRun(run.id);
                          } finally {
                            setRetryingRunId(null);
                          }
                        }}
                        className="text-amber-500 hover:text-amber-700 opacity-0 group-hover:opacity-100 transition-all disabled:opacity-50"
                        title="Retry from last checkpoint"
                      >
                        <RefreshCw size={14} className={retryingRunId === run.id ? 'animate-spin' : ''} />
                      </button>
                    )}
                    <button
                      onClick={(e) => { e.stopPropagation(); setDeleteConfirm({ type: 'single', id: run.id }); }}
                      className="text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                      title="Delete run"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div className="p-8 text-center text-sm text-slate-400">
            No matching runs found
          </div>
        )}
      </div>

      <ConfirmModal
        isOpen={!!deleteConfirm}
        onClose={() => setDeleteConfirm(null)}
        onConfirm={async () => {
          if (deleteConfirm?.type === 'single') {
            setDeleting(true);
            try {
              await onDeleteRun(deleteConfirm.id);
              setSelectedIds(prev => { const n = new Set(prev); n.delete(deleteConfirm.id); return n; });
            } finally {
              setDeleting(false);
              setDeleteConfirm(null);
            }
          } else if (deleteConfirm?.type === 'bulk') {
            await handleBulkDelete();
          }
        }}
        title={deleteConfirm?.type === 'bulk' ? `Delete ${selectedIds.size} runs?` : 'Delete run?'}
        message={deleteConfirm?.type === 'bulk' ? `Are you sure you want to delete ${selectedIds.size} selected runs? This action cannot be undone.` : 'Are you sure you want to delete this run? This action cannot be undone.'}
        confirmLabel="Delete"
        loading={deleting}
      />
    </div>
  );
}
