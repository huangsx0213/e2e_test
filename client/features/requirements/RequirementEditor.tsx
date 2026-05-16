import React, { useState, useEffect } from 'react';
import type { Requirement } from '../../../shared/contracts/index';
import { useRequirementMutations } from '../../shared/hooks/useQueryHooks';

interface Props { item: Requirement | null; projectId: string; onSaved: () => void; }

export function RequirementEditor({ item, projectId, onSaved }: Props) {
  const { create, update } = useRequirementMutations();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'>('MEDIUM');
  const [riskLevel, setRiskLevel] = useState<'HIGH' | 'MEDIUM' | 'LOW'>('MEDIUM');
  const [status, setStatus] = useState<'DRAFT' | 'APPROVED' | 'IN_PROGRESS' | 'DEPRECATED'>('DRAFT');
  useEffect(() => {
    if (item) { setTitle(item.title); setDescription(item.description); setPriority(item.priority); setRiskLevel(item.riskLevel); setStatus(item.status); }
    else { setTitle(''); setDescription(''); setPriority('MEDIUM'); setRiskLevel('MEDIUM'); setStatus('DRAFT'); }
  }, [item]);
  const handleSave = async () => {
    if (item) { await update(item.id, { title, description, priority, riskLevel, status }); }
    else { await create({ projectId, title, description, priority, riskLevel, status, type: 'functional' } as any); }
    onSaved();
  };
  return (
    <div className="space-y-3">
      {item ? <h2 className="text-lg font-semibold">Edit: {item.title}</h2> : <h2 className="text-lg font-semibold">New Requirement</h2>}
      <div><label className="block text-sm font-medium mb-1">Title</label><input type="text" value={title} onChange={e => setTitle(e.target.value)} className="w-full border rounded px-2 py-1 text-sm" /></div>
      <div><label className="block text-sm font-medium mb-1">Description</label><textarea value={description} onChange={e => setDescription(e.target.value)} className="w-full border rounded px-2 py-1 text-sm" rows={4} /></div>
      <div className="flex gap-2">
        <div className="flex-1"><label className="block text-sm font-medium mb-1">Priority</label><select value={priority} onChange={e => setPriority(e.target.value as 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW')} className="w-full border rounded px-2 py-1 text-sm"><option>CRITICAL</option><option>HIGH</option><option>MEDIUM</option><option>LOW</option></select></div>
        <div className="flex-1"><label className="block text-sm font-medium mb-1">Risk</label><select value={riskLevel} onChange={e => setRiskLevel(e.target.value as 'HIGH' | 'MEDIUM' | 'LOW')} className="w-full border rounded px-2 py-1 text-sm"><option>HIGH</option><option>MEDIUM</option><option>LOW</option></select></div>
        <div className="flex-1"><label className="block text-sm font-medium mb-1">Status</label><select value={status} onChange={e => setStatus(e.target.value as 'DRAFT' | 'APPROVED' | 'IN_PROGRESS' | 'DEPRECATED')} className="w-full border rounded px-2 py-1 text-sm"><option>DRAFT</option><option>APPROVED</option><option>IN_PROGRESS</option><option>DEPRECATED</option></select></div>
      </div>
      <button onClick={handleSave} className="px-4 py-1 bg-blue-500 text-white rounded text-sm">{item ? 'Update' : 'Create'}</button>
    </div>
  );
}