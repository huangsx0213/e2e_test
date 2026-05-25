import React, { useState } from 'react';
import { Search, ArrowLeft, Trash2 } from 'lucide-react';

interface PipelineRun {
  id: string;
  status: string;
  phase: string;
  mode: string;
  current_batch: number;
  total_batches: number;
  config: { name?: string } | null;
  created_at: string;
}

interface PipelineRunHistoryProps {
  runs: PipelineRun[];
  onSelect: (runId: string) => void;
  onBack: () => void;
  onDeleteRun: (runId: string) => Promise<void>;
}

const statusBadge: Record<string, string> = {
  COMPLETED: 'bg-green-100 text-green-700',
  RUNNING: 'bg-blue-100 text-blue-700',
  WAITING_REVIEW: 'bg-orange-100 text-orange-700',
  FAILED: 'bg-red-100 text-red-700',
  PAUSED: 'bg-yellow-100 text-yellow-700',
};

export function PipelineRunHistory({ runs, onSelect, onBack, onDeleteRun }: PipelineRunHistoryProps) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [modeFilter, setModeFilter] = useState('All');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const filtered = runs.filter(r => {
    if (search) {
      const name = r.config?.name || r.id;
      if (!name.toLowerCase().includes(search.toLowerCase())) return false;
    }
    if (statusFilter !== 'All' && r.status !== statusFilter) return false;
    if (modeFilter !== 'All' && r.mode !== modeFilter) return false;
    return true;
  });

  return (
    <div className="flex-1 flex flex-col bg-white">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-200">
        <button onClick={onBack} className="p-1 hover:bg-slate-100 rounded">
          <ArrowLeft size={16} className="text-slate-500" />
        </button>
        <h3 className="text-sm font-medium text-slate-700">Run History</h3>
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
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left">
              <th className="px-4 py-2 text-xs font-medium text-slate-500">#</th>
              <th className="px-4 py-2 text-xs font-medium text-slate-500">Name</th>
              <th className="px-4 py-2 text-xs font-medium text-slate-500">Status</th>
              <th className="px-4 py-2 text-xs font-medium text-slate-500">Mode</th>
              <th className="px-4 py-2 text-xs font-medium text-slate-500">Date</th>
              <th className="px-4 py-2 text-xs font-medium text-slate-500">Results</th>
              <th className="px-4 py-2 text-xs font-medium text-slate-500 w-10"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((run, i) => (
              <tr
                key={run.id}
                className="border-b border-slate-100 hover:bg-slate-50 transition-colors group"
              >
                <td className="px-4 py-2 text-xs text-slate-400">{runs.length - i}</td>
                <td
                  className="px-4 py-2 text-xs font-medium text-slate-700 cursor-pointer"
                  onClick={() => onSelect(run.id)}
                >
                  {run.config?.name || run.id.slice(0, 12)}
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
                <td className="px-4 py-2 text-xs text-slate-400">
                  {run.created_at?.slice(0, 16) || '-'}
                </td>
                <td className="px-4 py-2 text-xs text-slate-500">
                  {run.current_batch}/{run.total_batches} batches
                </td>
                <td className="px-4 py-2 text-right">
                  {confirmDelete === run.id ? (
                    <div className="flex items-center gap-1">
                      <button
                        disabled={deleting}
                        onClick={async (e) => {
                          e.stopPropagation();
                          setDeleting(true);
                          try {
                            await onDeleteRun(run.id);
                          } finally {
                            setDeleting(false);
                            setConfirmDelete(null);
                          }
                        }}
                        className="text-xs px-1.5 py-0.5 rounded bg-red-100 text-red-700 hover:bg-red-200 disabled:opacity-50"
                      >
                        {deleting ? '...' : 'Yes'}
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); setConfirmDelete(null); }}
                        className="text-xs px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 hover:bg-slate-200"
                      >
                        No
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={(e) => { e.stopPropagation(); setConfirmDelete(run.id); }}
                      className="text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all"
                      title="Delete run"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
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
    </div>
  );
}