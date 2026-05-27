import React, { useState, useMemo } from 'react';
import { Search, ChevronRight } from 'lucide-react';
import { useNlCases } from '../../shared/hooks/useQueryHooks';

interface NlCasesPageProps {
  currentProjectId: string | null;
}

const statusColors: Record<string, string> = {
  FINAL: 'bg-green-100 text-green-700',
  APPROVED: 'bg-blue-100 text-blue-700',
  DRAFT: 'bg-yellow-100 text-yellow-700',
};

const priorityColors: Record<string, string> = {
  critical: 'text-red-600',
  high: 'text-orange-600',
  medium: 'text-yellow-600',
  low: 'text-slate-500',
};

export function NlCasesPage({ currentProjectId }: NlCasesPageProps) {
  const { data: cases = [], isLoading } = useNlCases(currentProjectId || '');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [priorityFilter, setPriorityFilter] = useState('All');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const pageSize = 20;

  const filtered = useMemo(() => {
    return cases.filter((c: any) => {
      if (search && !c.title?.toLowerCase().includes(search.toLowerCase())) return false;
      if (statusFilter !== 'All' && c.status !== statusFilter) return false;
      if (priorityFilter !== 'All' && c.priority !== priorityFilter) return false;
      if (categoryFilter !== 'All' && c.category !== categoryFilter) return false;
      return true;
    });
  }, [cases, search, statusFilter, priorityFilter, categoryFilter]);

  const paged = filtered.slice(page * pageSize, (page + 1) * pageSize);
  const totalPages = Math.ceil(filtered.length / pageSize);

  if (!currentProjectId) {
    return <div className="h-full flex items-center justify-center text-slate-400">Select a project to continue</div>;
  }

  if (isLoading) {
    return <div className="h-full flex items-center justify-center text-slate-400 text-sm">Loading test cases...</div>;
  }

  const hasData = cases.length > 0;
  const isFiltered = search || statusFilter !== 'All' || priorityFilter !== 'All' || categoryFilter !== 'All';

  return (
    <div className="h-full flex flex-col bg-white overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 shrink-0">
        <h2 className="text-base font-semibold text-slate-800">NL Test Cases</h2>
        <span className="text-sm text-slate-400">{filtered.length} of {cases.length} cases</span>
      </div>

      <div className="px-4 py-2 flex gap-2 border-b border-slate-100 shrink-0">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-2 top-2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(0); }}
            placeholder="Search test cases..."
            className="w-full border border-slate-200 rounded pl-7 pr-2 py-1 text-xs focus:outline-none focus:border-blue-400"
          />
        </div>
        <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(0); }} className="border border-slate-200 rounded px-2 py-1 text-xs">
          <option value="All">All Status</option>
          <option value="FINAL">Final</option>
          <option value="APPROVED">Approved</option>
          <option value="DRAFT">Draft</option>
        </select>
        <select value={priorityFilter} onChange={e => { setPriorityFilter(e.target.value); setPage(0); }} className="border border-slate-200 rounded px-2 py-1 text-xs">
          <option value="All">All Priority</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <select value={categoryFilter} onChange={e => { setCategoryFilter(e.target.value); setPage(0); }} className="border border-slate-200 rounded px-2 py-1 text-xs">
          <option value="All">All Categories</option>
          <option value="happy-path">Happy Path</option>
          <option value="alternate">Alternate</option>
          <option value="error">Error</option>
          <option value="boundary">Boundary</option>
        </select>
      </div>

      <div className="flex-1 overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-slate-50">
            <tr className="border-b border-slate-200 text-left">
              <th className="px-4 py-2 text-xs font-medium text-slate-500 w-8">#</th>
              <th className="px-4 py-2 text-xs font-medium text-slate-500">Title</th>
              <th className="px-4 py-2 text-xs font-medium text-slate-500 w-20">Priority</th>
              <th className="px-4 py-2 text-xs font-medium text-slate-500 w-24">Category</th>
              <th className="px-4 py-2 text-xs font-medium text-slate-500 w-20">Status</th>
            </tr>
          </thead>
          <tbody>
            {paged.map((c: any, i: number) => (
              <React.Fragment key={c.id}>
                <tr
                  onClick={() => setSelectedId(selectedId === c.id ? null : c.id)}
                  className={`border-b border-slate-100 hover:bg-slate-50 cursor-pointer transition-colors ${selectedId === c.id ? 'bg-blue-50' : ''}`}
                >
                  <td className="px-4 py-2 text-xs text-slate-400">{page * pageSize + i + 1}</td>
                  <td className="px-4 py-2 text-xs text-slate-700">{c.title}</td>
                  <td className={`px-4 py-2 text-xs font-medium ${priorityColors[c.priority] || 'text-slate-500'}`}>{c.priority}</td>
                  <td className="px-4 py-2 text-xs text-slate-500">{c.category || '-'}</td>
                  <td className="px-4 py-2">
                    <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${statusColors[c.status] || 'bg-slate-100 text-slate-600'}`}>
                      {c.status}
                    </span>
                  </td>
                </tr>
                {selectedId === c.id && (
                  <tr>
                    <td colSpan={5} className="px-4 py-3 bg-slate-50 border-b border-slate-200">
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <div className="text-xs text-slate-400 mb-1">Preconditions</div>
                          <ul className="list-disc list-inside text-xs text-slate-600">
                            {(c.preconditions || []).map((p: string, idx: number) => (
                              <li key={idx}>{p}</li>
                            ))}
                          </ul>
                        </div>
                        <div>
                          <div className="text-xs text-slate-400 mb-1">Test Data</div>
                          <ul className="text-xs text-slate-600">
                            {(c.testData || []).map((d: any, idx: number) => (
                              <li key={idx}><span className="font-medium">{d.key}:</span> {d.value}</li>
                            ))}
                          </ul>
                        </div>
                        <div className="col-span-2">
                          <div className="text-xs text-slate-400 mb-1">Steps</div>
                          <div className="space-y-1">
                            {(c.steps || []).map((s: any, idx: number) => (
                              <div key={idx} className="text-xs">
                                <div className="text-slate-700"><span className="font-medium">Step {s.sequence}:</span> {s.action}</div>
                                <div className="text-slate-500 ml-4">Expected: {s.expected}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-slate-400 mb-1">Postconditions</div>
                          <ul className="list-disc list-inside text-xs text-slate-600">
                            {(c.postconditions || []).map((p: string, idx: number) => (
                              <li key={idx}>{p}</li>
                            ))}
                          </ul>
                        </div>
                        <div>
                          <div className="text-xs text-slate-400 mb-1">Details</div>
                          <div className="text-xs text-slate-600 space-y-0.5">
                            <div>Requirement: {c.requirementId || '-'}</div>
                            <div>Condition: {c.conditionId || '-'}</div>
                            <div>Technique: {c.techniqueApplied || '-'}</div>
                            <div>Tags: {(c.tags || []).join(', ') || '-'}</div>
                            {c.reviewSummary && <div>Review: {c.reviewSummary}</div>}
                          </div>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
            {paged.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-sm text-slate-400">
                  {!hasData
                    ? <span>No test cases yet. <span className="text-blue-500">Run AI Test Gen</span> to generate them.</span>
                    : isFiltered
                    ? 'No results match your filters.'
                    : 'No test cases found.'
                  }
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-2 border-t border-slate-200 shrink-0">
          <span className="text-xs text-slate-400">
            {page * pageSize + 1}-{Math.min((page + 1) * pageSize, filtered.length)} of {filtered.length}
          </span>
          <div className="flex gap-1">
            <button
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0}
              className="px-2 py-1 text-xs border border-slate-200 rounded disabled:opacity-30 hover:bg-slate-50"
            >
              <ChevronRight size={14} className="rotate-180" />
            </button>
            <button
              onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="px-2 py-1 text-xs border border-slate-200 rounded disabled:opacity-30 hover:bg-slate-50"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}