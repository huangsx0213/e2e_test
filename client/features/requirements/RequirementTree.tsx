import React, { useState } from "react";
import type { Requirement } from "../../../shared/contracts/index";
import { useRequirementMutations } from "../../shared/hooks/useQueryHooks";
import {
  ChevronRight,
  ChevronDown,
  FileText,
  Edit2,
  Check,
  Trash2,
  Plus,
} from "lucide-react";
import { ConfirmModal } from "@/shared/ui/ConfirmModal";

interface Props {
  items: Requirement[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onAddChild?: (id: string) => void;
  projectId: string;
  parentId?: string | null;
  depth?: number;
  onRefresh: () => void;
}

const priorityColors: Record<Requirement["priority"], string> = {
  CRITICAL: "bg-red-500",
  HIGH: "bg-orange-500",
  MEDIUM: "bg-blue-400",
  LOW: "bg-gray-400",
};

const statusColors: Record<Requirement["status"], string> = {
  DRAFT: "bg-gray-300",
  APPROVED: "bg-emerald-500",
  IN_PROGRESS: "bg-blue-500",
  DEPRECATED: "bg-gray-400",
};

const levelConfig: Record<Requirement["level"], { label: string }> = {
  epic: { label: "E" },
  feature: { label: "F" },
  story: { label: "S" },
  ac: { label: "AC" },
};

export function RequirementTree({
  items,
  selectedId,
  onSelect,
  onAddChild,
  projectId,
  parentId = null,
  depth = 0,
  onRefresh,
}: Props) {
  const { remove, update } = useRequirementMutations(projectId);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const children = items.filter((r) => (r.parentId || null) === parentId);

  const isExpanded = (id: string) => expandedIds.has(id);

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const childCount = (id: string) => items.filter((i) => i.parentId === id).length;

  const saveTitle = (id: string) => {
    update(id, { title: editTitle });
    setEditingId(null);
  };

  const handleDelete = async (id: string) => {
    await remove(id);
    setDeleteConfirm(null);
    onRefresh();
  };

  return (
    <div>
      <ConfirmModal
        isOpen={!!deleteConfirm}
        title="Delete Requirement"
        message="Are you sure you want to delete this requirement? All child requirements will also be removed."
        onConfirm={() => deleteConfirm && handleDelete(deleteConfirm)}
        onClose={() => setDeleteConfirm(null)}
      />
      {children.map((r) => {
        const hasChildren = items.some((i) => i.parentId === r.id);
        const expanded = isExpanded(r.id);
        const isSelected = selectedId === r.id;
        const count = childCount(r.id);

        return (
          <div key={r.id}>
            <div
              className={`group flex items-center py-1 px-1.5 cursor-pointer rounded-md text-sm transition-all duration-150 ${
                isSelected
                  ? "bg-blue-50 text-blue-700 shadow-sm ring-1 ring-blue-200"
                  : "text-slate-700 hover:bg-slate-50 hover:text-slate-900"
              }`}
              style={{ paddingLeft: `${depth * 16 + 4}px` }}
              onClick={() => onSelect(r.id)}
            >
              <div className="flex items-center gap-1.5 flex-1 min-w-0">
                {hasChildren ? (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleExpand(r.id);
                    }}
                    className="shrink-0 p-0.5 hover:bg-slate-200 rounded transition-colors"
                  >
                    {expanded ? (
                      <ChevronDown size={14} className="text-slate-500" />
                    ) : (
                      <ChevronRight size={14} className="text-slate-400" />
                    )}
                  </button>
                ) : (
                  <FileText
                    size={13}
                    className={`shrink-0 ${isSelected ? "text-blue-500" : "text-slate-300"}`}
                  />
                )}
                <span
                  className={`inline-block w-1.5 h-1.5 rounded-full shrink-0 ${priorityColors[r.priority]}`}
                />
                {editingId === r.id ? (
                  <input
                    className="flex-1 min-w-0 px-1.5 py-0.5 text-sm bg-white border border-blue-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => e.key === "Enter" && saveTitle(r.id)}
                    onBlur={() => saveTitle(r.id)}
                    autoFocus
                  />
                ) : (
                  <span className="truncate font-medium text-sm" title={r.title}>{r.title}</span>
                )}
                <span className="text-[10px] font-semibold text-slate-500 shrink-0">
                  {levelConfig[r.level].label}
                </span>
                {hasChildren && (
                  <span className="text-[10px] text-slate-400 font-medium shrink-0 tabular-nums">
                    {count}
                  </span>
                )}
                {r.status !== "DRAFT" && (
                  <span
                    className={`inline-block w-1.5 h-1.5 rounded-full shrink-0 ${statusColors[r.status]}`}
                    title={r.status.replace("_", " ")}
                  />
                )}
              </div>
              <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 ml-1">
                {onAddChild && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onAddChild(r.id);
                    }}
                    className="p-1 text-slate-400 hover:text-green-600 hover:bg-green-50 rounded transition-colors"
                    title="Add Child Requirement"
                  >
                    <Plus size={12} />
                  </button>
                )}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditingId(r.id);
                    setEditTitle(r.title);
                  }}
                  className="p-1 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                >
                  <Edit2 size={12} />
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setDeleteConfirm(r.id);
                  }}
                  className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                >
                  <Trash2 size={12} />
                </button>
              </div>
              {editingId === r.id && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    saveTitle(r.id);
                  }}
                  className="p-1 text-green-600 hover:bg-green-100 rounded ml-1 shrink-0 transition-colors"
                >
                  <Check size={12} />
                </button>
              )}
            </div>
            {hasChildren && expanded && (
              <RequirementTree
                items={items}
                selectedId={selectedId}
                onSelect={onSelect}
                onAddChild={onAddChild}
                projectId={projectId}
                parentId={r.id}
                depth={depth + 1}
                onRefresh={onRefresh}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
