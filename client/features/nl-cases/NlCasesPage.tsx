import React, { useState, useMemo, useCallback } from 'react';
import { Search, ChevronRight, RefreshCw, Trash2, CheckSquare, Edit3, Save, X, Loader2 } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useNlCases } from '../../shared/hooks/useQueryHooks';
import { queryKeys } from '../../shared/hooks/queryKeys';
import { api } from '../../shared/services/api';

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
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [priorityFilter, setPriorityFilter] = useState('All');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editData, setEditData] = useState<any>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(0);
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [bulkProcessing, setBulkProcessing] = useState(false);
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
  const allSelected = paged.length > 0 && paged.every(c => selectedIds.has(c.id));

  const invalidate = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: queryKeys.nlCases(currentProjectId || '') });
  }, [queryClient, currentProjectId]);

  const handleApprove = useCallback(async (id: string) => {
    setProcessingIds(prev => new Set(prev).add(id));
    try {
      await api.nlCases.update(id, { status: 'APPROVED' });
      invalidate();
    } catch {}
    setProcessingIds(prev => { const n = new Set(prev); n.delete(id); return n; });
  }, [invalidate]);

  const handleDelete = useCallback(async (id: string) => {
    setProcessingIds(prev => new Set(prev).add(id));
    try {
      await api.nlCases.delete(id);
      setDeleteConfirm(null);
      setSelectedId(prev => prev === id ? null : prev);
      setSelectedIds(prev => { const n = new Set(prev); n.delete(id); return n; });
      invalidate();
    } catch {}
    setProcessingIds(prev => { const n = new Set(prev); n.delete(id); return n; });
  }, [invalidate]);

  const handleBulkApprove = useCallback(async () => {
    setBulkProcessing(true);
    for (const id of selectedIds) {
      setProcessingIds(prev => new Set(prev).add(id));
      try {
        await api.nlCases.update(id, { status: 'APPROVED' });
      } catch {}
      setProcessingIds(prev => { const n = new Set(prev); n.delete(id); return n; });
    }
    setSelectedIds(new Set());
    setBulkProcessing(false);
    invalidate();
  }, [selectedIds, invalidate]);

  const handleBulkDelete = useCallback(async () => {
    setBulkProcessing(true);
    for (const id of selectedIds) {
      setProcessingIds(prev => new Set(prev).add(id));
      try {
        await api.nlCases.delete(id);
      } catch {}
      setProcessingIds(prev => { const n = new Set(prev); n.delete(id); return n; });
    }
    setSelectedIds(new Set());
    setSelectedId(prev => prev && selectedIds.has(prev) ? null : prev);
    setBulkProcessing(false);
    invalidate();
  }, [selectedIds, invalidate]);

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
      setSelectedIds(new Set(paged.map(c => c.id)));
    }
  }, [allSelected, paged]);

  const startEdit = useCallback((c: any) => {
    setEditingId(c.id);
    setEditData({
      title: c.title,
      preconditions: [...(c.preconditions || [])],
      postconditions: [...(c.postconditions || [])],
      testData: JSON.parse(JSON.stringify(c.testData || [])),
      steps: JSON.parse(JSON.stringify(c.steps || [])),
      tags: [...(c.tags || [])],
      requirementId: c.requirementId || '',
      conditionId: c.conditionId || '',
      techniqueApplied: c.techniqueApplied || '',
      priority: c.priority || 'medium',
      category: c.category || '',
      reviewSummary: c.reviewSummary || '',
    });
  }, []);

  const cancelEdit = useCallback(() => {
    setEditingId(null);
    setEditData(null);
  }, []);

  const saveEdit = useCallback(async () => {
    if (!editingId || !editData) return;
    setProcessingIds(prev => new Set(prev).add(editingId));
    try {
      await api.nlCases.update(editingId, editData);
      setEditingId(null);
      setEditData(null);
      invalidate();
    } catch {}
    setProcessingIds(prev => { const n = new Set(prev); n.delete(editingId!); return n; });
  }, [editingId, editData, invalidate]);

  const updateEditField = useCallback((field: string, value: any) => {
    setEditData((prev: any) => ({ ...prev, [field]: value }));
  }, []);

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
        <div className="flex items-center gap-2">
          {selectedIds.size > 0 && (
            <div className="flex items-center gap-1.5 mr-2">
              <span className="text-xs text-slate-500 mr-1">{selectedIds.size} selected</span>
              <button
                onClick={handleBulkApprove}
                disabled={bulkProcessing}
                className="px-2 py-1 text-xs font-medium rounded border border-blue-300 text-blue-700 hover:bg-blue-50 disabled:opacity-50 transition-colors"
              >
                {bulkProcessing ? 'Approving...' : 'Approve'}
              </button>
              <button
                onClick={handleBulkDelete}
                disabled={bulkProcessing}
                className="px-2 py-1 text-xs font-medium rounded border border-red-300 text-red-700 hover:bg-red-50 disabled:opacity-50 transition-colors"
              >
                {bulkProcessing ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          )}
          <button
            onClick={() => invalidate()}
            className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors"
            title="Refresh"
          >
            <RefreshCw size={14} className="text-slate-400" />
          </button>
          <span className="text-sm text-slate-400">{filtered.length} of {cases.length} cases</span>
        </div>
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
              <th className="px-2 py-2 w-8">
                <input type="checkbox" checked={allSelected} onChange={toggleSelectAll} className="rounded border-slate-300" />
              </th>
              <th className="px-4 py-2 text-xs font-medium text-slate-500 w-8">#</th>
              <th className="px-4 py-2 text-xs font-medium text-slate-500">Title</th>
              <th className="px-4 py-2 text-xs font-medium text-slate-500 w-20">Priority</th>
              <th className="px-4 py-2 text-xs font-medium text-slate-500 w-24">Category</th>
              <th className="px-4 py-2 text-xs font-medium text-slate-500 w-20">Status</th>
              <th className="px-4 py-2 text-xs font-medium text-slate-500 w-28">Actions</th>
            </tr>
          </thead>
          <tbody>
            {paged.map((c: any, i: number) => (
              <React.Fragment key={c.id}>
                <tr
                  className={`border-b border-slate-100 hover:bg-slate-50 transition-all ${selectedId === c.id ? 'bg-blue-50 border-l-2 border-l-blue-500' : 'border-l-2 border-l-transparent'} ${selectedIds.has(c.id) ? 'bg-blue-50/50' : ''}`}
                >
                  <td className="px-2 py-2" onClick={e => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selectedIds.has(c.id)}
                      onChange={() => toggleSelect(c.id)}
                      className="rounded border-slate-300"
                    />
                  </td>
                  <td className="px-4 py-2 text-xs text-slate-400">
                    <button onClick={() => setSelectedId(selectedId === c.id ? null : c.id)} className="hover:text-blue-600">{page * pageSize + i + 1}</button>
                  </td>
                  <td className="px-4 py-2 text-xs text-slate-700">
                    <button onClick={() => setSelectedId(selectedId === c.id ? null : c.id)} className="text-left hover:text-blue-600">{c.title}</button>
                  </td>
                  <td className={`px-4 py-2 text-xs font-medium ${priorityColors[c.priority] || 'text-slate-500'}`}>{c.priority}</td>
                  <td className="px-4 py-2 text-xs text-slate-500 capitalize">{c.category || '-'}</td>
                  <td className="px-4 py-2">
                    <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${statusColors[c.status] || 'bg-slate-100 text-slate-600'}`}>
                      {c.status}
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                      {c.status !== 'APPROVED' && c.status !== 'FINAL' && (
                        <button
                          onClick={() => handleApprove(c.id)}
                          disabled={processingIds.has(c.id)}
                          className="p-1 hover:bg-blue-100 rounded transition-colors"
                          title="Approve"
                        >
                          {processingIds.has(c.id) ? <Loader2 size={13} className="animate-spin text-blue-600" /> : <CheckSquare size={13} className="text-blue-600" />}
                        </button>
                      )}
                      <button
                        onClick={() => editingId === c.id ? saveEdit() : startEdit(c)}
                        className="p-1 hover:bg-slate-200 rounded transition-colors"
                        title={editingId === c.id ? 'Save' : 'Edit'}
                      >
                        {editingId === c.id ? <Save size={13} className="text-emerald-600" /> : <Edit3 size={13} className="text-slate-500" />}
                      </button>
                      <button
                        onClick={() => setDeleteConfirm(c.id)}
                        className="p-1 hover:bg-red-100 rounded transition-colors"
                        title="Delete"
                      >
                        <Trash2 size={13} className="text-red-500" />
                      </button>
                    </div>
                  </td>
                </tr>
                {selectedId === c.id && (
                  <tr>
                    <td colSpan={7} className="px-4 py-0 border-b border-slate-200">
                      {editingId === c.id && editData ? (
                        <div className="py-4">
                          <div className="flex items-center justify-between mb-4">
                            <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Editing</h4>
                            <div className="flex gap-2">
                              <button onClick={cancelEdit} className="px-2 py-1 text-xs rounded border border-slate-300 text-slate-600 hover:bg-slate-50">Cancel</button>
                              <button onClick={saveEdit} disabled={processingIds.has(c.id)} className="px-2 py-1 text-xs rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1">
                                {processingIds.has(c.id) && <Loader2 size={10} className="animate-spin" />}
                                Save
                              </button>
                            </div>
                          </div>
                          <div className="mb-4">
                            <input value={editData.title} onChange={e => updateEditField('title', e.target.value)} placeholder="Title" className="w-full border border-slate-200 rounded px-3 py-1.5 text-xs font-medium text-slate-700" />
                          </div>
                          <div className="grid grid-cols-2 gap-6">
                            <div className="space-y-4">
                              <div>
                                <div className="flex items-center gap-2 mb-2">
                                  <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Preconditions</h4>
                                  <button onClick={() => updateEditField('preconditions', [...editData.preconditions, ''])} className="w-5 h-5 flex items-center justify-center rounded border border-dashed border-slate-300 text-slate-400 hover:border-slate-400 hover:text-slate-600 transition-colors" title="Add precondition">
                                    <svg width="8" height="8" viewBox="0 0 8 8" fill="none"><path d="M4 1v6M1 4h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                                  </button>
                                </div>
                                {editData.preconditions.map((p: string, idx: number) => (
                                  <div key={idx} className="flex gap-1 mb-1">
                                    <input value={p} onChange={e => { const arr = [...editData.preconditions]; arr[idx] = e.target.value; updateEditField('preconditions', arr); }} className="flex-1 border border-slate-200 rounded px-2 py-1 text-xs" />
                                    <button onClick={() => updateEditField('preconditions', editData.preconditions.filter((_: any, i: number) => i !== idx))} className="p-1 hover:bg-red-100 rounded"><X size={12} className="text-red-500" /></button>
                                  </div>
                                ))}
                              </div>
                              <div>
                                <div className="flex items-center gap-2 mb-2">
                                  <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Postconditions</h4>
                                  <button onClick={() => updateEditField('postconditions', [...editData.postconditions, ''])} className="w-5 h-5 flex items-center justify-center rounded border border-dashed border-slate-300 text-slate-400 hover:border-slate-400 hover:text-slate-600 transition-colors" title="Add postcondition">
                                    <svg width="8" height="8" viewBox="0 0 8 8" fill="none"><path d="M4 1v6M1 4h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                                  </button>
                                </div>
                                {editData.postconditions.map((p: string, idx: number) => (
                                  <div key={idx} className="flex gap-1 mb-1">
                                    <input value={p} onChange={e => { const arr = [...editData.postconditions]; arr[idx] = e.target.value; updateEditField('postconditions', arr); }} className="flex-1 border border-slate-200 rounded px-2 py-1 text-xs" />
                                    <button onClick={() => updateEditField('postconditions', editData.postconditions.filter((_: any, i: number) => i !== idx))} className="p-1 hover:bg-red-100 rounded"><X size={12} className="text-red-500" /></button>
                                  </div>
                                ))}
                              </div>
                              <div>
                                <div className="flex items-center gap-2 mb-2">
                                  <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Steps</h4>
                                  <button onClick={() => updateEditField('steps', [...editData.steps, { sequence: editData.steps.length + 1, action: '', expected: '' }])} className="w-5 h-5 flex items-center justify-center rounded border border-dashed border-slate-300 text-slate-400 hover:border-slate-400 hover:text-slate-600 transition-colors" title="Add step">
                                    <svg width="8" height="8" viewBox="0 0 8 8" fill="none"><path d="M4 1v6M1 4h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                                  </button>
                                </div>
                                {editData.steps.map((s: any, idx: number) => (
                                  <div key={idx} className="flex gap-2 mb-2">
                                    <div className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-[10px] font-bold shrink-0 mt-1">{s.sequence}</div>
                                    <div className="flex-1">
                                      <div className="flex gap-1 mb-1">
                                        <input value={s.action} onChange={e => { const arr = [...editData.steps]; arr[idx] = { ...arr[idx], action: e.target.value }; updateEditField('steps', arr); }} placeholder="Action" className="flex-1 border border-slate-200 rounded px-2 py-1 text-xs" />
                                        <input value={s.expected} onChange={e => { const arr = [...editData.steps]; arr[idx] = { ...arr[idx], expected: e.target.value }; updateEditField('steps', arr); }} placeholder="Expected" className="flex-1 border border-slate-200 rounded px-2 py-1 text-xs" />
                                        <button onClick={() => updateEditField('steps', editData.steps.filter((_: any, i: number) => i !== idx))} className="p-1 hover:bg-red-100 rounded shrink-0"><X size={12} className="text-red-500" /></button>
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                            <div className="space-y-4">
                              <div>
                                <div className="flex items-center gap-2 mb-2">
                                  <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Test Data</h4>
                                  <button onClick={() => updateEditField('testData', [...(editData.testData || []), { key: '', value: '' }])} className="w-5 h-5 flex items-center justify-center rounded border border-dashed border-slate-300 text-slate-400 hover:border-slate-400 hover:text-slate-600 transition-colors" title="Add test data">
                                    <svg width="8" height="8" viewBox="0 0 8 8" fill="none"><path d="M4 1v6M1 4h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                                  </button>
                                </div>
                                {editData.testData?.length > 0 && (
                                  <div className="bg-slate-100 rounded-lg p-3">
                                    {editData.testData.map((d: any, idx: number) => (
                                      <div key={idx} className="flex items-center gap-2 mb-1 last:mb-0">
                                        <input value={d.key} onChange={e => { const arr = [...(editData.testData || [])]; arr[idx] = { ...arr[idx], key: e.target.value }; updateEditField('testData', arr); }} placeholder="Key" className="flex-1 border border-slate-200 rounded px-2 py-0.5 text-[11px] font-mono" />
                                        <span className="text-slate-300">:</span>
                                        <input value={d.value} onChange={e => { const arr = [...(editData.testData || [])]; arr[idx] = { ...arr[idx], value: e.target.value }; updateEditField('testData', arr); }} placeholder="Value" className="flex-1 border border-slate-200 rounded px-2 py-0.5 text-[11px]" />
                                        <button onClick={() => updateEditField('testData', (editData.testData || []).filter((_: any, i: number) => i !== idx))} className="p-0.5 hover:bg-red-100 rounded shrink-0"><X size={10} className="text-red-500" /></button>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                              <div>
                                <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Details</h4>
                                <div className="grid grid-cols-2 gap-3">
                                  <div>
                                    <div className="text-[10px] text-slate-400 mb-0.5">Priority</div>
                                    <select value={editData.priority} onChange={e => updateEditField('priority', e.target.value)} className="w-full border border-slate-200 rounded px-2 py-1 text-xs">
                                      <option value="critical">Critical</option>
                                      <option value="high">High</option>
                                      <option value="medium">Medium</option>
                                      <option value="low">Low</option>
                                    </select>
                                  </div>
                                  <div>
                                    <div className="text-[10px] text-slate-400 mb-0.5">Category</div>
                                    <input value={editData.category} onChange={e => updateEditField('category', e.target.value)} className="w-full border border-slate-200 rounded px-2 py-1 text-xs" />
                                  </div>
                                  <div className="col-span-2">
                                    <div className="text-[10px] text-slate-400 mb-0.5">Tags</div>
                                    <input value={editData.tags.join(', ')} onChange={e => updateEditField('tags', e.target.value.split(',').map((t: string) => t.trim()))} className="w-full border border-slate-200 rounded px-2 py-1 text-xs" />
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="py-4 space-y-4">
                          <div className="grid grid-cols-2 gap-6">
                            <div className="space-y-4">
                              {c.preconditions?.length > 0 && (
                                <div>
                                  <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Preconditions</h4>
                                  <ul className="space-y-1">
                                    {c.preconditions.map((p: string, idx: number) => (
                                      <li key={idx} className="text-xs text-slate-600 flex items-start gap-2">
                                        <span className="w-1 h-1 rounded-full bg-slate-300 mt-1.5 shrink-0" />
                                        {p}
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                              {c.steps?.length > 0 && (
                                <div>
                                  <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Steps</h4>
                                  <div className="space-y-2">
                                    {c.steps.map((s: any, idx: number) => (
                                      <div key={idx} className="flex gap-3">
                                        <div className="flex flex-col items-center">
                                          <div className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-[10px] font-bold shrink-0">{s.sequence}</div>
                                          {idx < c.steps.length - 1 && <div className="w-px flex-1 bg-slate-200 mt-1" />}
                                        </div>
                                        <div className="flex-1 pb-2">
                                          <div className="text-xs text-slate-700">{s.action}</div>
                                          <div className="text-xs text-blue-600 mt-0.5">Expected: {s.expected}</div>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                              {c.postconditions?.length > 0 && (
                                <div>
                                  <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Postconditions</h4>
                                  <ul className="space-y-1">
                                    {c.postconditions.map((p: string, idx: number) => (
                                      <li key={idx} className="text-xs text-slate-600 flex items-start gap-2">
                                        <span className="w-1 h-1 rounded-full bg-slate-300 mt-1.5 shrink-0" />
                                        {p}
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                            </div>
                            <div className="space-y-4">
                              {c.testData?.length > 0 && (
                                <div>
                                  <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Test Data</h4>
                                  <div className="bg-slate-100 rounded-lg p-3">
                                    {c.testData.map((d: any, idx: number) => (
                                      <div key={idx} className="flex items-center gap-2 text-xs">
                                        <span className="font-mono font-medium text-slate-700">{d.key}:</span>
                                        <span className="text-slate-500 truncate">{d.value || '(empty)'}</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                              <div>
                                <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Details</h4>
                                <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                                  <div className="text-slate-400">Requirement</div>
                                  <div className="text-slate-600 truncate">{c.requirementId || '-'}</div>
                                  <div className="text-slate-400">Condition</div>
                                  <div className="text-slate-600 truncate">{c.conditionId || '-'}</div>
                                  <div className="text-slate-400">Technique</div>
                                  <div className="text-slate-600">{c.techniqueApplied || '-'}</div>
                                  <div className="text-slate-400">Tags</div>
                                  <div className="text-slate-600">{(c.tags || []).join(', ') || '-'}</div>
                                </div>
                              </div>
                              {c.reviewSummary && (
                                <div>
                                  <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Review Summary</h4>
                                  <p className="text-xs text-slate-600 leading-relaxed bg-amber-50 border border-amber-200 rounded-lg p-3">{c.reviewSummary}</p>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                    </td>
                  </tr>
                )}
                {deleteConfirm === c.id && (
                  <tr>
                    <td colSpan={7} className="px-4 py-3 bg-red-50 border-b border-slate-200">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-red-700">Delete this test case?</span>
                        <div className="flex gap-2">
                          <button onClick={() => setDeleteConfirm(null)} className="px-2 py-1 text-xs rounded border border-slate-300 text-slate-600 hover:bg-slate-50">Cancel</button>
                          <button onClick={() => handleDelete(c.id)} disabled={processingIds.has(c.id)} className="px-2 py-1 text-xs rounded bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 flex items-center gap-1">
                            {processingIds.has(c.id) && <Loader2 size={10} className="animate-spin" />}
                            Delete
                          </button>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
            {paged.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-sm text-slate-400">
                  {!hasData
                    ? <span>No test cases yet. <span className="text-blue-500">Run AI Test Gen</span> to generate them.</span>
                    : isFiltered ? 'No results match your filters.' : 'No test cases found.'
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
