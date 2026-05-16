import React from 'react';
import type { Requirement } from '../../../shared/contracts/index';
import { useRequirementMutations } from '../../shared/hooks/useQueryHooks';

interface Props {
  items: Requirement[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  parentId?: string | null;
  depth?: number;
  onRefresh: () => void;
}

export function RequirementTree({ items, selectedId, onSelect, parentId = null, depth = 0, onRefresh }: Props) {
  const { remove } = useRequirementMutations();
  const children = items.filter(r => (r.parentId || null) === parentId);
  return (
    <div>
      {children.map(r => (
        <div key={r.id}>
          <div
            className={`flex items-center py-1 px-1 cursor-pointer hover:bg-gray-100 rounded text-sm ${selectedId === r.id ? 'bg-blue-100' : ''}`}
            style={{ paddingLeft: `${depth * 16 + 4}px` }}
            onClick={() => onSelect(r.id)}
          >
            <span className="flex-1 truncate">
              <span className={`inline-block w-2 h-2 rounded-full mr-1 ${
                r.priority === 'CRITICAL' ? 'bg-red-500' : r.priority === 'HIGH' ? 'bg-orange-500' : r.priority === 'LOW' ? 'bg-gray-400' : 'bg-blue-400'
              }`} />
              {r.title}
            </span>
            <button className="text-red-400 hover:text-red-600 text-xs px-1" onClick={async (e) => { e.stopPropagation(); await remove(r.id); onRefresh(); }}>x</button>
          </div>
          <RequirementTree items={items} selectedId={selectedId} onSelect={onSelect} parentId={r.id} depth={depth + 1} onRefresh={onRefresh} />
        </div>
      ))}
    </div>
  );
}