import React from "react";
import { Plus } from "lucide-react";
import type { Requirement } from "../../../shared/contracts/index";
import { useRequirementMutations } from "../../shared/hooks/useQueryHooks";
import { ACCard } from "./ACCard";

interface Props {
  acs: Requirement[];
  parentStoryId: string;
  projectId: string;
  onSaved: () => void;
}

export function ACList({ acs, parentStoryId, projectId, onSaved }: Props) {
  const { create, update } = useRequirementMutations(projectId);

  const sorted = [...acs].sort((a, b) => a.position - b.position);

  const handleNewAC = async () => {
    const nextPosition = sorted.length > 0 ? Math.max(...sorted.map((s) => s.position)) + 1 : 0;
    await create({
      projectId,
      parentId: parentStoryId,
      title: "New AC",
      description: "Given:\nWhen:\nThen:",
      level: "ac",
      flowType: "atomic",
      status: "DRAFT",
      position: nextPosition,
      metadata: {},
    } as any);
    onSaved();
  };

  const moveAC = async (id: string, direction: -1 | 1) => {
    const idx = sorted.findIndex((a) => a.id === id);
    const target = idx + direction;
    if (target < 0 || target >= sorted.length) return;
    const a = sorted[idx];
    const b = sorted[target];
    await Promise.all([
      update(a.id, { position: b.position }),
      update(b.id, { position: a.position }),
    ]);
    onSaved();
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-semibold text-slate-800">Acceptance Criteria</h2>
          <span className="text-xs text-slate-400 font-mono">{sorted.length}</span>
        </div>
        <button
          onClick={handleNewAC}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-md transition-colors"
        >
          <Plus size={14} /> New AC
        </button>
      </div>

      {sorted.length === 0 ? (
        <div className="text-center py-12 px-4 border border-dashed border-slate-200 rounded-lg bg-slate-50/40">
          <p className="text-sm text-slate-500 font-medium">No ACs yet</p>
          <p className="text-xs text-slate-400 mt-1">Click the button above to add the first acceptance criterion.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {sorted.map((ac, idx) => (
            <ACCard
              key={ac.id}
              ac={ac}
              index={idx + 1}
              parentStoryId={parentStoryId}
              projectId={projectId}
              onSaved={() => onSaved()}
              onMoveUp={(id) => moveAC(id, -1)}
              onMoveDown={(id) => moveAC(id, 1)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
