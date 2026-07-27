import React, { useState } from "react";
import { Plus, GripVertical } from "lucide-react";
import type { Requirement } from "../../../shared/contracts/index";
import { useRequirementMutations } from "../../shared/hooks/useQueryHooks";
import { ACCard } from "./ACCard";

interface Props {
  acs: Requirement[];
  parentStoryId: string;
  projectId: string;
  onSaved: () => void;
  parentStoryIsFlow?: boolean;
}

export function ACList({ acs, parentStoryId, projectId, onSaved, parentStoryIsFlow = false }: Props) {
  const { create, update } = useRequirementMutations(projectId);

  const [sortedIds, setSortedIds] = useState<string[] | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  const sorted = [...acs].sort((a, b) => a.position - b.position);
  const ordered: Requirement[] = sortedIds
    ? sortedIds.map((id) => sorted.find((s) => s.id === id)!).filter(Boolean)
    : sorted;

  const handleNewAC = async () => {
    const nextPosition = ordered.length > 0 ? Math.max(...ordered.map((s) => s.position)) + 1 : 0;
    await create({
      projectId,
      parentId: parentStoryId,
      title: `AC #${ordered.length + 1}`,
      description: "Given:\nWhen:\nThen:",
      level: "ac",
      flowType: "atomic",
      status: "DRAFT",
      position: nextPosition,
    } as any);
    onSaved();
  };

  const commitReorder = async (newOrder: Requirement[]) => {
    await Promise.all(
      newOrder.map((ac, idx) => update(ac.id, { position: idx })),
    );
    setSortedIds(null);
    onSaved();
  };

  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDragId(id);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", id);
  };

  const handleDragOver = (e: React.DragEvent, id: string) => {
    e.preventDefault();
    if (id !== overId) setOverId(id);
  };

  const handleDrop = async (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    if (!dragId || dragId === targetId) {
      setDragId(null);
      setOverId(null);
      return;
    }
    const fromIdx = ordered.findIndex((a) => a.id === dragId);
    const toIdx = ordered.findIndex((a) => a.id === targetId);
    const next = [...ordered];
    const [moved] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, moved);
    setDragId(null);
    setOverId(null);
    await commitReorder(next);
  };

  const handleDragEnd = () => {
    setDragId(null);
    setOverId(null);
  };

  const approvedCount = ordered.filter((a) => a.status === "APPROVED").length;
  const totalCount = ordered.length;
  const allApproved = totalCount > 0 && approvedCount === totalCount;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <h2 className="text-base font-semibold text-slate-800">Acceptance Criteria</h2>
          <span
            data-testid="ac-progress"
            className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-0.5 rounded-md border tabular-nums ${
              allApproved
                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                : "bg-slate-100 text-slate-600 border-slate-200"
            }`}
          >
            <span className={`w-1.5 h-1.5 rounded-full ${allApproved ? "bg-emerald-500" : "bg-slate-400"}`} />
            {approvedCount}/{totalCount} approved
          </span>
        </div>
        <button
          onClick={handleNewAC}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-md transition-colors"
        >
          <Plus size={14} /> New AC
        </button>
      </div>

      {ordered.length === 0 ? (
        <div className="text-center py-12 px-4 border border-dashed border-slate-200 rounded-lg bg-slate-50/40">
          <p className="text-sm text-slate-500 font-medium">No ACs yet</p>
          <p className="text-xs text-slate-400 mt-1">Click the button above to add the first acceptance criterion.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {ordered.map((ac, idx) => (
            <div
              key={ac.id}
              draggable
              onDragStart={(e) => handleDragStart(e, ac.id)}
              onDragOver={(e) => handleDragOver(e, ac.id)}
              onDrop={(e) => handleDrop(e, ac.id)}
              onDragEnd={handleDragEnd}
              className={`relative ${dragId === ac.id ? "opacity-40" : ""} ${
                overId === ac.id && dragId !== ac.id ? "ring-2 ring-blue-300 rounded-lg" : ""
              }`}
            >
              <div className="absolute left-1 top-1/2 -translate-y-1/2 text-slate-300 cursor-grab active:cursor-grabbing opacity-0 hover:opacity-100 transition-opacity z-10">
                <GripVertical size={14} />
              </div>
              <ACCard
                ac={ac}
                index={idx + 1}
                parentStoryId={parentStoryId}
                projectId={projectId}
                onSaved={() => onSaved()}
                parentStoryIsFlow={parentStoryIsFlow}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
