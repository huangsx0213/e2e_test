import React, { useState } from 'react';
import { RequirementTree } from './RequirementTree';
import { RequirementEditor } from './RequirementEditor';
import { RequirementImport } from './RequirementImport';
import { useRequirements } from '../../shared/hooks/useQueryHooks';
import type { Requirement } from '../../../shared/contracts/index';

export function RequirementsPage() {
  const { data: items = [], isLoading: loading, refetch: refresh } = useRequirements();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showImport, setShowImport] = useState(false);
  const selected = items.find(r => r.id === selectedId) || null;
  if (loading) return <div className="p-4">Loading...</div>;
  return (
    <div className="flex h-full">
      <div className="w-80 border-r p-2 overflow-auto">
        <div className="flex justify-between mb-2">
          <button className="px-2 py-1 bg-blue-500 text-white rounded text-sm" onClick={() => setSelectedId(null)}>+ New Root</button>
          <button className="px-2 py-1 bg-gray-500 text-white rounded text-sm" onClick={() => setShowImport(true)}>Import</button>
        </div>
        <RequirementTree items={items} selectedId={selectedId} onSelect={setSelectedId} onRefresh={refresh} />
      </div>
      <div className="flex-1 p-4">
        <RequirementEditor item={selected} projectId={items[0]?.projectId || ''} onSaved={refresh} />
      </div>
      {showImport && <RequirementImport projectId={items[0]?.projectId || ''} onClose={() => setShowImport(false)} onImported={refresh} />}
    </div>
  );
}