import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'motion/react';
import { Search, Plus, Trash2, Edit2, CheckCircle2, XCircle, ChevronLeft, ChevronRight, CheckSquare, Square, ChevronDown, ChevronRight as ChevronRightIcon, MoveHorizontal, Info, Clock, AlertCircle, Upload, Eye, Filter, RefreshCcw, ShieldCheck } from 'lucide-react';

interface CascaderOption { value: string; label: string; children?: CascaderOption[]; }
const CASCADER_OPTIONS: CascaderOption[] = [
  { value: 'development', label: 'Development', children: [{ value: 'frontend', label: 'Frontend', children: [{ value: 'react', label: 'React' }, { value: 'vue', label: 'Vue' }] }, { value: 'backend', label: 'Backend', children: [{ value: 'node', label: 'Node.js' }, { value: 'python', label: 'Python' }] }] },
  { value: 'design', label: 'Design', children: [{ value: 'ui', label: 'UI Design' }, { value: 'ux', label: 'UX Research' }] }
];

export function UserManagement() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const [filterInputName, setFilterInputName] = useState('');
  const [filterInputRole, setFilterInputRole] = useState('');
  const [filterInputStatus, setFilterInputStatus] = useState('');

  const [appliedFilterName, setAppliedFilterName] = useState('');
  const [appliedFilterRole, setAppliedFilterRole] = useState('');
  const [appliedFilterStatus, setAppliedFilterStatus] = useState('');

  const [page, setPage] = useState(1);
  const [limit] = useState(10);
  const [total, setTotal] = useState(0);

  const [sortBy, setSortBy] = useState('updatedAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  const handleSort = (field: string) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('desc');
    }
  };

  const SortIcon = ({ field }: { field: string }) => {
    return (
      <div className="inline-flex w-4 items-center justify-center">
        {sortBy === field ? (
          sortOrder === 'asc' ? (
            <ChevronDown size={14} className="rotate-180 transition-transform text-blue-600" />
          ) : (
            <ChevronDown size={14} className="transition-transform text-blue-600" />
          )
        ) : (
          <ChevronDown size={14} className="opacity-0 group-hover:opacity-30 transition-opacity text-gray-400" />
        )}
      </div>
    );
  };

  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  // Toast
  const [toastVisible, setToastVisible] = useState(false);
  const [toastMessage, setToastMessage] = useState('');
  const showToast = (msg: string) => {
    setToastMessage(msg);
    setToastVisible(true);
    setTimeout(() => setToastVisible(false), 2000);
  };

  // Action drawer for secondary user actions
  const [actionDrawerUser, setActionDrawerUser] = useState<any | null>(null);

  const openActionDrawer = (u: any, e: React.MouseEvent) => {
    e.stopPropagation();
    setActionDrawerUser(u);
  };

  // Modal forms
  const [modalMode, setModalMode] = useState<'none' | 'simple' | 'advanced' | 'view'>('none');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [viewingUser, setViewingUser] = useState<any>(null);

  // Async Validation Modal
  const [validating, setValidating] = useState(false);
  const [validationModalVisible, setValidationModalVisible] = useState(false);

  const initialForm = {
    name: '', email: '', role: 'viewer', status: 'inactive',
    bio: '', accessLevel: 3, dateStart: '', dateEnd: '', shiftTime: '',
    permissions: [] as string[], twoFactorAuth: false,
    departmentPath: [] as string[], avatar: null as File | null
  };
  const [formData, setFormData] = useState(initialForm);

  const [cascaderOpen, setCascaderOpen] = useState(false);
  const cascaderRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (cascaderRef.current && !cascaderRef.current.contains(e.target as Node)) {
        setCascaderOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleCascaderSelect = (level: number, val: string) => {
    const newVal = [...formData.departmentPath];
    newVal[level] = val;
    newVal.splice(level + 1);
    setFormData(p => ({ ...p, departmentPath: newVal }));
  };

  const currentL1 = CASCADER_OPTIONS.find(o => o.value === formData.departmentPath[0]);
  const currentL2 = currentL1?.children?.find(o => o.value === formData.departmentPath[1]);
  const wrapApi = async (fn: () => Promise<void>, minDelay = 500) => {
    setLoading(true);
    const start = Date.now();
    try {
      await fn();
    } finally {
      const elapsed = Date.now() - start;
      setTimeout(() => setLoading(false), Math.max(0, minDelay - elapsed));
    }
  };

  const fetchUsers = () => wrapApi(async () => {
    let url = `/aut-api/users?page=${page}&limit=${limit}&sortBy=${sortBy}&sortOrder=${sortOrder}&`;
    if (appliedFilterName) url += `name=${encodeURIComponent(appliedFilterName)}&`;
    if (appliedFilterRole) url += `role=${appliedFilterRole}&`;
    if (appliedFilterStatus) url += `status=${appliedFilterStatus}&`;

    const r = await fetch(url);
    const res = await r.json();
    if (res.success) {
      setUsers(res.data);
      setTotal(res.total);
    }
  });

  useEffect(() => { fetchUsers(); }, [appliedFilterName, appliedFilterRole, appliedFilterStatus, page, sortBy, sortOrder]);

  const handleApplyFilter = () => {
    setAppliedFilterName(filterInputName);
    setAppliedFilterRole(filterInputRole);
    setAppliedFilterStatus(filterInputStatus);
    setPage(1);
  };

  const handleResetFilter = () => {
    setFilterInputName('');
    setFilterInputRole('');
    setFilterInputStatus('');
    setAppliedFilterName('');
    setAppliedFilterRole('');
    setAppliedFilterStatus('');
    setPage(1);
  };

  const handleDelete = (id: number) => {
    if (!confirm('Are you sure you want to delete this user?')) return;
    wrapApi(async () => {
      try {
        const res = await fetch(`/aut-api/users/${id}`, { method: 'DELETE' });
        if ((await res.json()).success) { showToast('User deleted successfully'); await fetchUsers(); }
      } catch { showToast('Delete failed'); }
    });
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    wrapApi(async () => {
      try {
        const method = editingId ? 'PUT' : 'POST';
        const url = editingId ? `/aut-api/users/${editingId}` : '/aut-api/users';
        const payload: any = { ...formData };
        delete payload.avatar;

        const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        const data = await res.json();
        if (data.success) {
          setModalMode('none');
          showToast('User saved successfully');
          await fetchUsers();
        } else {
          showToast(data.error || 'Validation failed');
        }
      } catch { showToast('Save failed'); }
    });
  };

  const handleBatchUpdate = (updateData: any) => {
    wrapApi(async () => {
      try {
        const res = await fetch('/aut-api/users/batch-update', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids: selectedIds, data: updateData })
        });
        const data = await res.json();
        if (data.success) {
          showToast(`Updated ${selectedIds.length} users`);
          setSelectedIds([]);
          await fetchUsers();
        } else {
          showToast(data.error || 'Batch update failed');
        }
      } catch { showToast('Server error during batch update'); }
    });
  };

  const handleBatchDelete = () => {
    if (!confirm(`Are you sure you want to delete ${selectedIds.length} users?`)) return;
    wrapApi(async () => {
      try {
        const res = await fetch('/aut-api/users/batch-delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids: selectedIds })
        });
        const data = await res.json();
        if (data.success) {
          showToast(`Deleted ${selectedIds.length} users`);
          setSelectedIds([]);
          await fetchUsers();
        } else {
          showToast(data.error || 'Batch delete failed');
        }
      } catch { showToast('Server error during batch delete'); }
    });
  };

  const handleResetPassword = (id: number) => {
    wrapApi(async () => {
      try {
        const res = await fetch(`/aut-api/users/${id}/reset-password`, {
          method: 'POST'
        });
        const data = await res.json();
        if (data.success) {
          showToast('Password reset link sent successfully');
          await fetchUsers();
        } else {
          showToast(data.error || 'Failed to send reset link');
        }
      } catch { showToast('Server error'); }
    });
  };

  const handleExportUser = (u: any) => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(u, null, 2));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", `user_${u.id}_export.json`);
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
    showToast('User data exported');
  };

  const handleSuspendUser = (id: number) => {
    if (!confirm('Are you sure you want to suspend this account?')) return;
    wrapApi(async () => {
      try {
        const res = await fetch(`/aut-api/users/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'inactive' })
        });
        const data = await res.json();
        if (data.success) {
          showToast('Account suspended');
          await fetchUsers();
        } else {
          showToast(data.error || 'Failed to suspend account');
        }
      } catch { showToast('Server error'); }
    });
  };

  const selectedUsers = users.filter(u => selectedIds.includes(u.id));
  const hasActiveSelected = selectedUsers.some(u => u.status === 'active');
  const hasInactiveSelected = selectedUsers.some(u => u.status === 'inactive');
  const isMixedStatus = hasActiveSelected && hasInactiveSelected;

  return (
    <div className="max-w-full mx-auto space-y-6 pb-20">
      {/* Search Bar & Controls */}
      <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 flex flex-col gap-4">
        <div className="flex flex-wrap items-end gap-4 w-full">
          <div className="space-y-1.5 flex-1 min-w-[200px] max-w-xs">
            <label htmlFor="filter-name" className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Search Name</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
              <input
                id="filter-name"
                name="filter-name"
                aria-label="Search by name"
                type="text"
                placeholder="e.g. John..."
                className="w-full pl-9 pr-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-shadow"
                value={filterInputName}
                onChange={e => setFilterInputName(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5 w-40">
            <label htmlFor="filter-role" className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Role</label>
            <select
              id="filter-role"
              name="filter-role"
              aria-label="Filter by role"
              className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-shadow"
              value={filterInputRole}
              onChange={e => setFilterInputRole(e.target.value)}
            >
              <option value="">All Roles</option>
              <option value="admin">Admin</option>
              <option value="editor">Editor</option>
              <option value="viewer">Viewer</option>
            </select>
          </div>

          <div className="space-y-1.5 w-40">
            <label htmlFor="filter-status" className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</label>
            <select
              id="filter-status"
              name="filter-status"
              aria-label="Filter by status"
              className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none transition-shadow"
              value={filterInputStatus}
              onChange={e => setFilterInputStatus(e.target.value)}
            >
              <option value="">All Statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </div>

          <div className="flex items-center gap-2 pb-0.5">
            <button onClick={handleApplyFilter} className="flex items-center gap-1.5 px-4 py-2 bg-gray-900 hover:bg-gray-800 transition-colors text-white rounded-lg text-sm font-medium shadow-sm">
              <Filter size={14} /> Apply
            </button>
            <button onClick={handleResetFilter} className="flex items-center gap-1.5 px-4 py-2 bg-white border border-gray-200 hover:bg-gray-50 transition-colors text-gray-700 rounded-lg text-sm font-medium shadow-sm">
              <RefreshCcw size={14} className="text-gray-400" /> Reset
            </button>
          </div>

          <div className="flex items-center gap-2 pb-0.5 ml-auto">
            <button
              onClick={() => { setFormData(initialForm); setEditingId(null); setModalMode('simple'); }}
              className="flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors rounded-lg text-sm font-medium border border-blue-200"
            >
              <Plus size={16} /> Quick Add
            </button>
            <button
              onClick={() => { setFormData(initialForm); setEditingId(null); setModalMode('advanced'); }}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 transition-colors text-white rounded-lg text-sm font-medium shadow-sm"
            >
              <Plus size={16} /> Advanced Add
            </button>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 min-h-[700px] flex flex-col overflow-hidden">
        <div className="overflow-x-auto overflow-y-auto flex-1 relative" style={{ scrollbarGutter: 'stable' }}>
          {/* Loading Overlay for subsequent loads */}
          {loading && users.length > 0 && (
            <div className="absolute inset-0 bg-white/40 backdrop-blur-[1px] z-20 flex items-center justify-center transition-opacity">
              <div className="bg-white px-6 py-4 rounded-2xl shadow-xl border border-gray-100 flex items-center gap-3 animate-in zoom-in-95 duration-200">
                <RefreshCcw className="animate-spin text-blue-600" size={20} />
                <span className="text-sm font-bold text-gray-700">Syncing Data...</span>
              </div>
            </div>
          )}

          <table className="w-full text-left min-w-[1200px] table-fixed">
            <thead className="bg-gray-50 border-b border-gray-100 text-sm font-semibold text-gray-700 sticky top-0 z-10 shadow-sm">
              <tr>
                <th scope="col" className="px-6 py-4 w-12"><input aria-label="Select all users" type="checkbox" onChange={e => setSelectedIds(e.target.checked ? users.map(u => u.id) : [])} checked={selectedIds.length === users.length && users.length > 0} /></th>
                <th scope="col" className="px-6 py-4 cursor-pointer hover:bg-gray-100 transition-colors group w-[220px]" onClick={() => handleSort('name')}>
                  <div className="flex items-center gap-1">Name <SortIcon field="name" /></div>
                </th>
                <th scope="col" className="px-6 py-4 cursor-pointer hover:bg-gray-100 transition-colors group w-[250px]" onClick={() => handleSort('email')}>
                  <div className="flex items-center gap-1">Email <SortIcon field="email" /></div>
                </th>
                <th scope="col" className="px-6 py-4 cursor-pointer hover:bg-gray-100 transition-colors group w-[120px]" onClick={() => handleSort('role')}>
                  <div className="flex items-center gap-1">Role <SortIcon field="role" /></div>
                </th>
                <th scope="col" className="px-6 py-4 cursor-pointer hover:bg-gray-100 transition-colors group w-[120px]" onClick={() => handleSort('status')}>
                  <div className="flex items-center gap-1">Status <SortIcon field="status" /></div>
                </th>
                <th scope="col" className="px-6 py-4 cursor-pointer hover:bg-gray-100 transition-colors group w-[180px]" onClick={() => handleSort('createdAt')}>
                  <div className="flex items-center gap-1">Created At <SortIcon field="createdAt" /></div>
                </th>
                <th scope="col" className="px-6 py-4 cursor-pointer hover:bg-gray-100 transition-colors group w-[180px]" onClick={() => handleSort('updatedAt')}>
                  <div className="flex items-center gap-1">Last Modified <SortIcon field="updatedAt" /></div>
                </th>
                <th scope="col" className="px-6 py-4 text-right w-[140px]">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-sm whitespace-nowrap">
              {loading && users.length === 0 ? (
                Array.from({ length: limit }).map((_, i) => (
                  <tr key={`skeleton-${i}`} className="animate-pulse h-[60px]">
                    <td className="px-6 py-4"><div className="w-4 h-4 bg-gray-100 rounded"></div></td>
                    <td className="px-6 py-4"><div className="h-5 bg-gray-100 rounded w-3/4"></div></td>
                    <td className="px-6 py-4"><div className="h-5 bg-gray-100 rounded w-full"></div></td>
                    <td className="px-6 py-4"><div className="h-5 bg-gray-100 rounded w-1/2"></div></td>
                    <td className="px-6 py-4"><div className="h-5 bg-gray-100 rounded w-16"></div></td>
                    <td className="px-6 py-4"><div className="h-5 bg-gray-100 rounded w-24"></div></td>
                    <td className="px-6 py-4"><div className="h-5 bg-gray-100 rounded w-24"></div></td>
                    <td className="px-6 py-4 text-right"><div className="h-5 bg-gray-100 rounded w-12 ml-auto"></div></td>
                  </tr>
                ))
              ) : !loading && users.length === 0 ? (
                <tr><td colSpan={8} className="px-6 py-12 text-center text-gray-500 font-medium h-[200px]">No users found</td></tr>
              ) : (
                users.map(u => (
                  <tr key={u.id} className="hover:bg-blue-50/50 transition-colors group relative h-[60px]">
                    <td className="px-6 py-4"><input type="checkbox" checked={selectedIds.includes(u.id)} onChange={() => setSelectedIds(p => p.includes(u.id) ? p.filter(x => x !== u.id) : [...p, u.id])} /></td>
                    <td className="px-6 py-4 font-medium text-gray-900">{u.name}</td>
                    <td className="px-6 py-4 text-gray-500">{u.email}</td>
                    <td className="px-6 py-4 capitalize text-gray-700 font-medium">{u.role}</td>
                    <td className="px-6 py-4">
                      {u.status === 'active' ? <span className="text-emerald-700 bg-emerald-100 px-2.5 py-1 rounded-full text-xs font-medium inline-flex items-center gap-1"><CheckCircle2 size={12} />Active</span> : <span className="text-gray-600 bg-gray-100 px-2.5 py-1 rounded-full text-xs font-medium inline-flex items-center gap-1"><XCircle size={12} />Inactive</span>}
                    </td>
                    <td className="px-6 py-4 text-gray-500 text-xs">
                      {u.createdAt ? new Date(u.createdAt).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' }) : '-'}
                    </td>
                    <td className="px-6 py-4 text-gray-500 text-xs">
                      {u.updatedAt ? new Date(u.updatedAt).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' }) : '-'}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-3 opacity-60 group-hover:opacity-100 transition-all duration-200">
                        <motion.button
                          onClick={() => { setViewingUser(u); setModalMode('view'); }}
                          className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-white rounded-lg transition-colors border border-transparent shadow-none hover:shadow-sm"
                          title="View Details"
                          aria-label={`View details for ${u.name}`}
                        >
                          <Eye size={16} />
                        </motion.button>
                        <motion.button
                          onClick={() => { setFormData({ ...initialForm, ...u }); setEditingId(u.id); setModalMode('advanced'); }}
                          className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-white rounded-lg transition-colors border border-transparent hover:shadow-sm"
                          title="Edit"
                          aria-label={`Edit user ${u.name}`}
                        >
                          <Edit2 size={16} />
                        </motion.button>
                        <motion.button
                          onClick={() => handleDelete(u.id)}
                          className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-white rounded-lg transition-colors border border-transparent hover:shadow-sm"
                          title="Delete"
                          aria-label={`Delete user ${u.name}`}
                        >
                          <Trash2 size={16} />
                        </motion.button>

                        <motion.button
                          onClick={(e) => openActionDrawer(u, e)}
                          className="p-1.5 text-gray-400 hover:text-gray-900 bg-gray-50 hover:bg-white rounded-lg transition-colors border border-transparent hover:shadow-sm"
                          title="More Options"
                          aria-label="More options"
                        >
                          <MoveHorizontal size={16} />
                        </motion.button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination bar */}
        <div className={`px-6 py-4 border-t border-gray-100 bg-gray-50/50 flex items-center justify-between shrink-0 h-[72px] ${selectedIds.length === 0 ? 'rounded-b-xl' : ''}`}>
          <div className="text-sm text-gray-500">
            Showing <span className="font-medium text-gray-900">{Math.min((page - 1) * limit + 1, total)}</span> to <span className="font-medium text-gray-900">{Math.min(page * limit, total)}</span> of <span className="font-medium text-gray-900">{total}</span> users
          </div>
          <div className="flex items-center gap-2">
            <button
              disabled={page === 1}
              onClick={() => setPage(p => Math.max(1, p - 1))}
              className="p-1.5 rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-40 transition-colors"
              aria-label="Previous page"
            >
              <ChevronLeft size={18} />
            </button>
            {Array.from({ length: Math.ceil(total / limit) }).map((_, i) => (
              <button
                key={i + 1}
                onClick={() => setPage(i + 1)}
                className={`w-8 h-8 rounded-lg text-sm font-medium transition-colors ${page === i + 1 ? 'bg-blue-600 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-100'}`}
              >
                {i + 1}
              </button>
            ))}
            <button
              disabled={page >= Math.ceil(total / limit)}
              onClick={() => setPage(p => p + 1)}
              className="p-1.5 rounded-lg border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 disabled:opacity-40 transition-colors"
              aria-label="Next page"
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </div>

        {/* Integrated Batch Action Bar */}
        {selectedIds.length > 0 && (
          <div className="px-6 py-4 border-t border-blue-100 bg-blue-50/30 flex items-center justify-between rounded-b-xl shrink-0 h-[72px]">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 text-sm font-bold text-blue-700 bg-blue-100 px-3 py-1 rounded-full">
                <span className="w-5 h-5 flex items-center justify-center bg-blue-600 text-white rounded-full text-[10px]">{selectedIds.length}</span>
                Selected
              </div>
              {isMixedStatus && (
                <div className="flex items-center gap-2 text-amber-600 text-xs font-semibold bg-amber-50 px-3 py-1 rounded-lg border border-amber-100">
                  <AlertCircle size={14} /> Mixed statuses: Batch status update disabled
                </div>
              )}
            </div>

            <div className="flex items-center gap-3">
              {!isMixedStatus && hasInactiveSelected && (
                <button
                  onClick={() => handleBatchUpdate({ status: 'active' })}
                  className="flex items-center gap-2 text-sm font-medium bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl transition-colors shadow-sm"
                >
                  <CheckCircle2 size={16} /> Activate All
                </button>
              )}
              {!isMixedStatus && hasActiveSelected && (
                <button
                  onClick={() => handleBatchUpdate({ status: 'inactive' })}
                  className="flex items-center gap-2 text-sm font-medium bg-gray-700 hover:bg-gray-800 text-white px-4 py-2 rounded-xl transition-colors shadow-sm"
                >
                  <XCircle size={16} /> Deactivate All
                </button>
              )}
              <button
                onClick={handleBatchDelete}
                className="flex items-center gap-2 text-sm font-medium bg-white text-red-600 hover:bg-red-50 border border-red-200 px-4 py-2 rounded-xl transition-colors"
              >
                <Trash2 size={16} /> Delete Selected
              </button>
              <div className="w-px h-6 bg-blue-200 mx-1"></div>
              <button
                onClick={() => setSelectedIds([])}
                className="text-sm font-medium text-blue-600 hover:text-blue-800 transition-colors px-2"
              >
                Deselect
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Floating Batch Action Bar REMOVED (integrated above) */}

      {/* Ephemeral Toast */}
      {toastVisible && (
        <div className="fixed bottom-10 right-10 z-[300] flex items-center gap-2.5 bg-gray-900/95 backdrop-blur-md text-white px-4 py-2.5 rounded-xl shadow-xl border border-white/10 animate-in fade-in slide-in-from-right-5 duration-300">
          <div className="w-6 h-6 bg-emerald-500/20 rounded-full flex items-center justify-center text-emerald-400 shrink-0">
            <CheckCircle2 size={14} />
          </div>
          <span className="text-sm font-medium pr-1">{toastMessage}</span>
        </div>
      )}

      {/* Async Validation Modal Overlay */}
      {validationModalVisible && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-8 text-center space-y-5 animate-in zoom-in-95">
            <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto text-emerald-500">
              <CheckCircle2 size={32} />
            </div>
            <div>
              <h3 className="text-xl font-bold text-gray-900">Security Check Passed</h3>
              <p className="text-sm text-gray-500 mt-2">No conflicts detected in active directories. Email domain is valid. User data verified.</p>
            </div>
            <button onClick={() => setValidationModalVisible(false)} className="w-full py-2.5 bg-gray-900 font-medium text-white rounded-xl hover:bg-gray-800 transition-colors shadow-sm">Acknowledge</button>
          </div>
        </div>
      )}

      {/* Add / Edit Complex User Form */}
      {modalMode === 'advanced' && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 overflow-y-auto">
          <div className="min-h-screen flex items-center justify-center py-10 px-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl transform transition-all flex flex-col max-h-[90vh]">
              <form onSubmit={handleSave} className="flex flex-col h-full bg-slate-50 rounded-2xl">
                <div className="px-8 py-5 bg-white border-b border-gray-100 flex items-center justify-between shrink-0 rounded-t-2xl">
                  <div>
                    <h3 className="text-xl font-bold text-gray-900">{editingId ? 'Edit Complex Profile' : 'Create Complex Profile'}</h3>
                    <p className="text-sm text-gray-500 mt-1">This form includes various control types and injections</p>
                  </div>
                  <button type="button" onClick={() => { setValidating(true); setTimeout(() => { setValidating(false); setValidationModalVisible(true); }, 3000); }} disabled={validating} className="flex items-center gap-2 text-sm font-medium bg-blue-50 text-blue-700 hover:bg-blue-100 px-4 py-2 rounded-lg transition-colors disabled:opacity-50 border border-blue-200">
                    <ShieldCheck size={16} /> {validating ? 'Running Security Check...' : 'Verify User Data'}
                  </button>
                </div>

                <div className="px-8 py-8 overflow-y-auto space-y-10 flex-1">

                  {/* Basic Info */}
                  <section className="space-y-6">
                    <h4 className="text-sm font-bold text-gray-800 uppercase tracking-widest border-b border-gray-200 pb-2">1. Personal Details</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-1.5">
                        <label className="text-sm font-medium text-gray-700 block">Full Name</label>
                        <input required className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-shadow" placeholder="e.g. Acme Corp" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-sm font-medium text-gray-700 block">Email Address</label>
                        <input type="email" required className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none transition-shadow" placeholder="user@example.com" value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value })} />
                      </div>
                      <div className="space-y-1.5 md:col-span-2">
                        <label className="text-sm font-medium text-gray-700 block">Biography</label>
                        <textarea rows={2} placeholder="Write a short summary..." className="w-full px-4 py-3 border border-gray-300 rounded-xl resize-none focus:ring-2 focus:ring-blue-500 outline-none transition-shadow" value={formData.bio} onChange={e => setFormData({ ...formData, bio: e.target.value })} />
                      </div>
                    </div>
                  </section>

                  {/* Job Details */}
                  <section className="space-y-6">
                    <h4 className="text-sm font-bold text-gray-800 uppercase tracking-widest border-b border-gray-200 pb-2">2. Job Details</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-1.5">
                        <label className="text-sm font-medium text-gray-700 block">Role</label>
                        <select className="w-full px-4 py-2.5 border border-gray-300 bg-white rounded-xl focus:ring-2 focus:ring-blue-500 outline-none" value={formData.role} onChange={e => setFormData({ ...formData, role: e.target.value })}>
                          <option value="admin">Administrator (Full Access)</option>
                          <option value="editor">Editor (Write Access)</option>
                          <option value="viewer">Viewer (Read Only)</option>
                        </select>
                      </div>

                      <div className="space-y-1.5 relative" ref={cascaderRef}>
                        <label className="text-sm font-medium text-gray-700 block">Department (Cascader)</label>
                        <div className="w-full px-4 py-2.5 border border-gray-300 bg-white rounded-xl focus-within:ring-2 focus-within:ring-blue-500 cursor-pointer flex justify-between items-center transition-shadow" onClick={() => setCascaderOpen(!cascaderOpen)}>
                          <span className={formData.departmentPath.length ? 'text-gray-900' : 'text-gray-400'}>{formData.departmentPath.length ? formData.departmentPath.join(' / ') : 'Select department tree...'}</span>
                          <ChevronDown size={18} className={`text-gray-400 transition-transform duration-200 ${cascaderOpen ? 'rotate-180' : ''}`} />
                        </div>
                        {cascaderOpen && (
                          <div className="absolute z-[60] bg-white border border-gray-200 mt-2 shadow-[0_10px_40px_-10px_rgba(0,0,0,0.15)] rounded-xl flex overflow-hidden max-h-64 top-full left-0">
                            <ul className="w-44 border-r border-gray-100 overflow-y-auto py-1">
                              {CASCADER_OPTIONS.map(o => (<li key={o.value} className={`px-4 py-2 hover:bg-slate-50 cursor-pointer flex justify-between items-center text-sm transition-colors ${formData.departmentPath[0] === o.value ? 'bg-blue-50/50 text-blue-700 font-medium' : ''}`} onClick={e => { e.stopPropagation(); handleCascaderSelect(0, o.value) }}>{o.label} {o.children && <ChevronRightIcon size={14} className="text-gray-400" />}</li>))}
                            </ul>
                            {currentL1?.children && (<ul className="w-44 border-r border-gray-100 overflow-y-auto py-1">{currentL1.children.map(o => (<li key={o.value} className={`px-4 py-2 hover:bg-slate-50 cursor-pointer flex justify-between items-center text-sm transition-colors ${formData.departmentPath[1] === o.value ? 'bg-blue-50/50 text-blue-700 font-medium' : ''}`} onClick={e => { e.stopPropagation(); handleCascaderSelect(1, o.value) }}>{o.label} {o.children && <ChevronRightIcon size={14} className="text-gray-400" />}</li>))}</ul>)}
                            {currentL2?.children && (<ul className="w-44 overflow-y-auto py-1">{currentL2.children.map(o => (<li key={o.value} className={`px-4 py-2 hover:bg-slate-50 cursor-pointer flex justify-between items-center text-sm transition-colors ${formData.departmentPath[2] === o.value ? 'bg-blue-50/50 text-blue-700 font-medium' : ''}`} onClick={e => { e.stopPropagation(); handleCascaderSelect(2, o.value); setCascaderOpen(false); }}>{o.label}</li>))}</ul>)}
                          </div>
                        )}
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-sm font-medium text-gray-700 block">Contract Period (Native dual input)</label>
                        <div className="flex items-center gap-2">
                          <input type="date" className="border border-gray-300 bg-white rounded-xl px-3 py-2 flex-1 focus:ring-2 focus:ring-blue-500 outline-none text-sm" value={formData.dateStart} onChange={e => setFormData({ ...formData, dateStart: e.target.value })} />
                          <span className="text-gray-400 text-sm">to</span>
                          <input type="date" className="border border-gray-300 bg-white rounded-xl px-3 py-2 flex-1 focus:ring-2 focus:ring-blue-500 outline-none text-sm" value={formData.dateEnd} onChange={e => setFormData({ ...formData, dateEnd: e.target.value })} />
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-sm font-medium text-gray-700 block">Preferred Shift time</label>
                        <input type="time" className="w-full px-4 py-2.5 border border-gray-300 bg-white rounded-xl focus:ring-2 focus:ring-blue-500 outline-none" value={formData.shiftTime} onChange={e => setFormData({ ...formData, shiftTime: e.target.value })} />
                      </div>
                    </div>
                  </section>

                  {/* Security & Access */}
                  <section className="space-y-6">
                    <h4 className="text-sm font-bold text-gray-800 uppercase tracking-widest border-b border-gray-200 pb-2">3. Security & Settings</h4>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                      <div className="space-y-6">
                        <div className="space-y-3">
                          <label className="text-sm font-medium text-gray-700 block">System Permissions</label>
                          <div className="grid grid-cols-2 gap-3">
                            {['view_reports', 'manage_users', 'billing_access', 'api_access'].map(tag => (
                              <label key={tag} className="flex items-center gap-2 cursor-pointer bg-white px-3 py-2.5 border border-gray-200 rounded-xl shadow-sm hover:border-gray-300 transition-colors">
                                <input type="checkbox" className="w-4 h-4 text-blue-600 rounded border-gray-300 outline-none focus:ring-blue-500" checked={formData.permissions.includes(tag)} onChange={() => setFormData(p => ({ ...p, permissions: p.permissions.includes(tag) ? p.permissions.filter(t => t !== tag) : [...p.permissions, tag] }))} />
                                <span className="text-sm font-medium text-gray-700">{tag.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}</span>
                              </label>
                            ))}
                          </div>
                        </div>

                        <div className="space-y-1.5">
                          <label className="flex items-center justify-between text-sm font-medium text-gray-700">
                            <span>Access Level</span>
                            <span className="bg-blue-100 text-blue-800 text-xs px-2 py-0.5 rounded-full">Level {formData.accessLevel}</span>
                          </label>
                          <div className="pt-2">
                            <input type="range" min="1" max="5" className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600" value={formData.accessLevel} onChange={e => setFormData({ ...formData, accessLevel: parseInt(e.target.value) })} />
                          </div>
                        </div>
                      </div>

                      <div className="space-y-6">
                        <div className="space-y-3">
                          <label className="text-sm font-medium text-gray-700 block">Account Status</label>
                          <div className="flex gap-4">
                            <label className="flex flex-1 items-center gap-3 cursor-pointer bg-white px-4 py-3 border border-gray-200 rounded-xl shadow-sm hover:border-gray-300 transition-colors">
                              <input type="radio" name="status" className="w-4 h-4 text-emerald-600 border-gray-300 focus:ring-emerald-500" checked={formData.status === 'active'} onChange={() => setFormData({ ...formData, status: 'active' })} />
                              <span className="text-sm font-medium text-gray-900">Active</span>
                            </label>
                            <label className="flex flex-1 items-center gap-3 cursor-pointer bg-white px-4 py-3 border border-gray-200 rounded-xl shadow-sm hover:border-gray-300 transition-colors">
                              <input type="radio" name="status" className="w-4 h-4 text-gray-500 border-gray-300 focus:ring-gray-500" checked={formData.status === 'inactive'} onChange={() => setFormData({ ...formData, status: 'inactive' })} />
                              <span className="text-sm font-medium text-gray-700">Inactive</span>
                            </label>
                          </div>
                        </div>

                        <div className="border border-gray-200 bg-white rounded-xl p-4 flex items-center justify-between shadow-sm">
                          <div className="pr-4">
                            <div className="text-sm font-semibold text-gray-900">Two-Factor Authentication</div>
                            <div className="text-[11px] text-gray-500 mt-0.5">Require 2FA codes during login</div>
                          </div>
                          <button type="button" onClick={() => setFormData({ ...formData, twoFactorAuth: !formData.twoFactorAuth })} className={`w-11 h-6 rounded-full transition-colors relative shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-500 shadow-inner ${formData.twoFactorAuth ? 'bg-blue-600' : 'bg-gray-300'}`}>
                            <span className={`inline-block w-5 h-5 bg-white rounded-full transition-transform absolute top-0.5 left-0.5 shadow-sm border border-black/5 ${formData.twoFactorAuth ? 'translate-x-5' : 'translate-x-0'}`}></span>
                          </button>
                        </div>
                      </div>
                    </div>
                  </section>

                  <section className="space-y-4">
                    <h4 className="text-sm font-bold text-gray-800 uppercase tracking-widest border-b border-gray-200 pb-2">4. Profile Picture</h4>
                    <div
                      className="border-2 border-dashed border-gray-300 bg-white rounded-xl h-40 flex flex-col items-center justify-center hover:bg-blue-50/50 hover:border-blue-300 transition-colors cursor-pointer relative group"
                      onDragOver={e => e.preventDefault()}
                      onDrop={e => { e.preventDefault(); if (e.dataTransfer.files[0]) setFormData({ ...formData, avatar: e.dataTransfer.files[0] }); }}
                    >
                      <div className="bg-gray-50 group-hover:bg-blue-100 p-3 rounded-full mb-3 transition-colors">
                        <Upload className="text-gray-400 group-hover:text-blue-600 transition-colors" size={24} />
                      </div>
                      {formData.avatar ? (
                        <p className="text-sm font-semibold text-blue-800">{formData.avatar.name}</p>
                      ) : (
                        <div className="text-center">
                          <p className="text-sm text-gray-600">Drag an image here or <span className="text-blue-600 font-semibold group-hover:underline">Browse</span></p>
                          <input type="file" className="absolute inset-0 opacity-0 cursor-pointer w-full h-full" onChange={e => { if (e.target.files?.[0]) setFormData({ ...formData, avatar: e.target.files[0] }) }} />
                        </div>
                      )}
                    </div>
                  </section>
                </div>

                <div className="px-8 py-5 bg-white border-t border-gray-100 flex justify-end gap-3 rounded-b-2xl shrink-0">
                  <button type="button" onClick={() => setModalMode('none')} className="px-5 py-2.5 border border-gray-300 rounded-xl text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:ring-2 focus:ring-gray-200 outline-none transition-colors">Cancel</button>
                  <button type="submit" className="px-6 py-2.5 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 shadow-sm focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 outline-none transition-colors transition-shadow">Save Profile</button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
      {/* Simple Form */}
      {modalMode === 'simple' && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center py-10 px-4 animate-in fade-in">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md transform transition-all animate-in zoom-in-95">
            <form onSubmit={handleSave} className="flex flex-col">
              <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                <h3 className="text-lg font-bold text-gray-900">Quick Add User</h3>
                <button type="button" onClick={() => setModalMode('none')} className="text-gray-400 hover:text-gray-600"><XCircle size={20} /></button>
              </div>
              <div className="px-6 py-6 space-y-4">
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-gray-700 block">Full Name *</label>
                  <input required className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" placeholder="e.g. John Doe" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })} />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-gray-700 block">Email Address *</label>
                  <input type="email" required className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" placeholder="john@example.com" value={formData.email} onChange={e => setFormData({ ...formData, email: e.target.value })} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-gray-700 block">Role</label>
                    <select className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" value={formData.role} onChange={e => setFormData({ ...formData, role: e.target.value })}>
                      <option value="admin">Administrator</option>
                      <option value="editor">Editor</option>
                      <option value="viewer">Viewer</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-sm font-medium text-gray-700 block">Status</label>
                    <select className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none" value={formData.status} onChange={e => setFormData({ ...formData, status: e.target.value })}>
                      <option value="active">Active</option>
                      <option value="inactive">Inactive</option>
                    </select>
                  </div>
                </div>
              </div>
              <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-end gap-3 rounded-b-2xl">
                <button type="button" onClick={() => setModalMode('none')} className="px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-50">Cancel</button>
                <button type="submit" className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">Save</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* View Details Modal */}
      {modalMode === 'view' && viewingUser && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 overflow-y-auto animate-in fade-in">
          <div className="min-h-screen flex items-center justify-center py-10 px-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl transform transition-all flex flex-col max-h-[90vh]">
              <div className="flex flex-col h-full bg-slate-50 rounded-2xl">
                <div className="px-8 py-5 bg-white border-b border-gray-100 flex items-center justify-between shrink-0 rounded-t-2xl">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-blue-600 text-white rounded-xl flex items-center justify-center font-bold text-xl uppercase shadow-sm">
                      {viewingUser.name?.[0] || '?'}
                    </div>
                    <div>
                      <h3 className="text-xl font-bold text-gray-900">User Profile Details</h3>
                      <p className="text-sm text-gray-500 mt-1">Viewing comprehensive information for {viewingUser.name}</p>
                    </div>
                  </div>
                  <button onClick={() => setModalMode('none')} className="text-gray-400 hover:text-gray-600 bg-gray-50 p-2 rounded-full transition-colors">
                    <XCircle size={24} />
                  </button>
                </div>

                <div className="px-8 py-8 overflow-y-auto space-y-10 flex-1 text-left">

                  {/* Basic Info */}
                  <section className="space-y-6">
                    <h4 className="text-sm font-bold text-gray-800 uppercase tracking-widest border-b border-gray-200 pb-2">1. Personal Details</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-gray-400 uppercase tracking-wider block">Full Name</label>
                        <div className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-gray-900 font-medium">{viewingUser.name || '-'}</div>
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-gray-400 uppercase tracking-wider block">Email Address</label>
                        <div className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-gray-900 font-medium break-all">{viewingUser.email || '-'}</div>
                      </div>
                      <div className="space-y-1.5 md:col-span-2">
                        <label className="text-xs font-bold text-gray-400 uppercase tracking-wider block">Biography</label>
                        <div className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl text-gray-700 leading-relaxed whitespace-pre-wrap min-h-[60px]">
                          {viewingUser.bio || <span className="text-gray-300 italic">No biography provided.</span>}
                        </div>
                      </div>
                    </div>
                  </section>

                  {/* Job Details */}
                  <section className="space-y-6">
                    <h4 className="text-sm font-bold text-gray-800 uppercase tracking-widest border-b border-gray-200 pb-2">2. Job Details</h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-gray-400 uppercase tracking-wider block">Role</label>
                        <div className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-gray-900 font-medium capitalize">{viewingUser.role || '-'}</div>
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-gray-400 uppercase tracking-wider block">Department</label>
                        <div className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-gray-900 font-medium capitalize">
                          {viewingUser.departmentPath?.length ? viewingUser.departmentPath.join(' / ') : '-'}
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-gray-400 uppercase tracking-wider block">Contract Period</label>
                        <div className="flex items-center gap-2">
                          <div className="bg-white border border-gray-200 rounded-xl px-4 py-2.5 flex-1 text-gray-900 text-sm font-medium">{viewingUser.dateStart || '-'}</div>
                          <span className="text-gray-400 text-sm">to</span>
                          <div className="bg-white border border-gray-200 rounded-xl px-4 py-2.5 flex-1 text-gray-900 text-sm font-medium">{viewingUser.dateEnd || '-'}</div>
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-gray-400 uppercase tracking-wider block">Preferred Shift time</label>
                        <div className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-gray-900 font-medium">{viewingUser.shiftTime || '-'}</div>
                      </div>
                    </div>
                  </section>

                  {/* Security & Access */}
                  <section className="space-y-6">
                    <h4 className="text-sm font-bold text-gray-800 uppercase tracking-widest border-b border-gray-200 pb-2">3. Security & Settings</h4>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                      <div className="space-y-6">
                        <div className="space-y-3">
                          <label className="text-xs font-bold text-gray-400 uppercase tracking-wider block">System Permissions</label>
                          <div className="grid grid-cols-2 gap-3">
                            {['view_reports', 'manage_users', 'billing_access', 'api_access'].map(tag => (
                              <div key={tag} className={`flex items-center gap-2 px-3 py-2.5 border rounded-xl shadow-sm transition-colors ${viewingUser.permissions?.includes(tag) ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-gray-50 border-gray-100 text-gray-300 opacity-60'}`}>
                                <div className={`w-2 h-2 rounded-full ${viewingUser.permissions?.includes(tag) ? 'bg-blue-500' : 'bg-gray-300'}`}></div>
                                <span className="text-sm font-medium">{tag.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}</span>
                              </div>
                            ))}
                          </div>
                        </div>

                        <div className="space-y-1.5">
                          <label className="flex items-center justify-between text-xs font-bold text-gray-400 uppercase tracking-wider">
                            <span>Access Level</span>
                            <span className="bg-blue-100 text-blue-800 text-[10px] px-2 py-0.5 rounded-full font-black">LVL {viewingUser.accessLevel || 0}</span>
                          </label>
                          <div className="pt-2">
                            <div className="w-full h-2 bg-gray-200 rounded-lg relative overflow-hidden">
                              <div className="absolute left-0 top-0 h-full bg-blue-600 transition-all duration-500" style={{ width: `${((viewingUser.accessLevel || 0) / 5) * 100}%` }}></div>
                            </div>
                            <div className="flex justify-between mt-2 text-[10px] font-black text-gray-400 uppercase tracking-widest">
                              <span>Min</span>
                              <span>Max</span>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-6">
                        <div className="space-y-3">
                          <label className="text-xs font-bold text-gray-400 uppercase tracking-wider block">Account Status</label>
                          <div className="flex gap-4">
                            <div className={`flex flex-1 items-center gap-3 px-4 py-3 border rounded-xl shadow-sm ${viewingUser.status === 'active' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-gray-50 border-gray-100 text-gray-300'}`}>
                              <div className={`w-3 h-3 rounded-full ${viewingUser.status === 'active' ? 'bg-emerald-500' : 'bg-gray-300'}`}></div>
                              <span className="text-sm font-bold">Active</span>
                            </div>
                            <div className={`flex flex-1 items-center gap-3 px-4 py-3 border rounded-xl shadow-sm ${viewingUser.status === 'inactive' ? 'bg-amber-50 border-amber-200 text-amber-700' : 'bg-gray-50 border-gray-100 text-gray-300'}`}>
                              <div className={`w-3 h-3 rounded-full ${viewingUser.status === 'inactive' ? 'bg-amber-500' : 'bg-gray-300'}`}></div>
                              <span className="text-sm font-bold">Inactive</span>
                            </div>
                          </div>
                        </div>

                        <div className="border border-gray-200 bg-white rounded-xl p-4 flex items-center justify-between shadow-sm">
                          <div className="pr-4">
                            <div className="text-sm font-bold text-gray-900">Two-Factor Authentication</div>
                            <div className="text-[11px] text-gray-500 mt-0.5">{viewingUser.twoFactorAuth ? 'Security layer is active' : 'Not configured for this account'}</div>
                          </div>
                          <div className={`w-11 h-6 rounded-full relative shrink-0 ${viewingUser.twoFactorAuth ? 'bg-blue-600' : 'bg-gray-300'}`}>
                            <span className={`inline-block w-5 h-5 bg-white rounded-full absolute top-0.5 transition-transform ${viewingUser.twoFactorAuth ? 'translate-x-5' : 'translate-x-0.5'}`}></span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </section>

                  <section className="space-y-4">
                    <h4 className="text-sm font-bold text-gray-800 uppercase tracking-widest border-b border-gray-200 pb-2">4. Profile Picture</h4>
                    <div className="flex items-center gap-6 p-6 bg-white border border-gray-200 rounded-2xl">
                      <div className="w-24 h-24 bg-slate-100 rounded-2xl flex items-center justify-center text-slate-400 border border-slate-200 shadow-inner shrink-0">
                        <Upload size={32} />
                      </div>
                      <div>
                        <h5 className="font-bold text-gray-900">Avatar Content</h5>
                        <p className="text-xs text-gray-500 mt-1 leading-relaxed">The user avatar is handled as a binary blob. In production, this would display the validated image asset associated with this profile identifier.</p>
                      </div>
                    </div>
                  </section>

                  <section className="space-y-4">
                    <h4 className="text-sm font-bold text-gray-800 uppercase tracking-widest border-b border-gray-200 pb-2">5. Metadata</h4>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="bg-gray-100/50 p-4 rounded-xl border border-gray-200">
                        <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Created At</div>
                        <div className="text-sm font-medium text-gray-700">{viewingUser.createdAt ? new Date(viewingUser.createdAt).toLocaleString() : '-'}</div>
                      </div>
                      <div className="bg-gray-100/50 p-4 rounded-xl border border-gray-200">
                        <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1">Last Update</div>
                        <div className="text-sm font-medium text-gray-700">{viewingUser.updatedAt ? new Date(viewingUser.updatedAt).toLocaleString() : '-'}</div>
                      </div>
                    </div>
                  </section>
                </div>

                <div className="px-8 py-5 bg-white border-t border-gray-100 flex justify-end shrink-0 rounded-b-2xl">
                  <button onClick={() => setModalMode('none')} className="px-8 py-2.5 bg-gray-900 text-white rounded-xl text-sm font-bold hover:bg-black transition-all shadow-md active:scale-95">Done Viewing</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* User Actions Drawer */}
      {actionDrawerUser && (
        <div className="fixed inset-0 z-[110] flex justify-end">
          <div className="absolute inset-0 bg-black/20 backdrop-blur-[2px] animate-in fade-in" onClick={() => setActionDrawerUser(null)}></div>
          <div className="w-full max-w-sm bg-white h-full relative z-[120] shadow-2xl border-l border-gray-100 flex flex-col animate-in slide-in-from-right duration-300">
            <div className="px-6 py-6 border-b border-gray-50 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-gray-900">User Actions</h3>
                <p className="text-xs text-gray-500 mt-0.5">{actionDrawerUser.name}</p>
              </div>
              <button onClick={() => setActionDrawerUser(null)} className="p-2 text-gray-400 hover:text-gray-600 bg-gray-50 rounded-full transition-colors"><XCircle size={20} /></button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-2 text-left">
              <div className="px-2 pb-2 text-[11px] font-bold text-gray-400 uppercase tracking-widest">Account Management</div>

              <button
                onClick={() => { handleResetPassword(actionDrawerUser.id); setActionDrawerUser(null); }}
                className="w-full flex items-center gap-3 px-4 py-3.5 text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-700 rounded-xl transition-all group"
              >
                <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center group-hover:bg-blue-100"><RefreshCcw size={16} /></div>
                <div className="flex-1 text-left font-medium">Send Password Reset</div>
              </button>

              <button
                onClick={() => { handleExportUser(actionDrawerUser); setActionDrawerUser(null); }}
                className="w-full flex items-center gap-3 px-4 py-3.5 text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-700 rounded-xl transition-all group"
              >
                <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center group-hover:bg-blue-100"><Upload size={16} /></div>
                <div className="flex-1 text-left font-medium">Export User Data</div>
              </button>

              <div className="my-4 mx-4 border-b border-gray-100"></div>

              <div className="px-2 pb-2 text-[11px] font-bold text-gray-400 uppercase tracking-widest">Danger Zone</div>

              <button
                onClick={() => { handleSuspendUser(actionDrawerUser.id); setActionDrawerUser(null); }}
                className="w-full flex items-center gap-3 px-4 py-3.5 text-sm text-red-600 hover:bg-red-50 rounded-xl transition-all group underline-offset-4"
              >
                <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center group-hover:bg-red-100"><AlertCircle size={16} /></div>
                <div className="flex-1 text-left font-medium hover:underline">Suspend Account</div>
              </button>

              <button onClick={() => { handleDelete(actionDrawerUser.id); setActionDrawerUser(null); }} className="w-full flex items-center gap-3 px-4 py-3.5 text-sm text-red-600 hover:bg-red-50 rounded-xl transition-all group underline-offset-4">
                <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center group-hover:bg-red-100"><Trash2 size={16} /></div>
                <div className="flex-1 text-left font-medium hover:underline">Permanently Delete</div>
              </button>
            </div>

            <div className="p-6 bg-gray-50 border-t border-gray-100 text-center">
              <p className="text-[11px] text-gray-400">User ID: {actionDrawerUser.id} • Last Login: Just now</p>
            </div>
          </div>
        </div>
      )}
      {/* Global Loading Spinner for Modals/Actions */}
      {loading && modalMode !== 'none' && (
        <div className="fixed inset-0 z-[200] bg-black/10 backdrop-blur-[1px] flex items-center justify-center">
          <div className="bg-white px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-3 border border-gray-100">
             <RefreshCcw className="animate-spin text-blue-600" size={20} />
             <span className="text-sm font-bold text-gray-700">Processing...</span>
          </div>
        </div>
      )}
    </div>
  );
}
