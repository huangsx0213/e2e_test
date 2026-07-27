import React, { useState } from "react";
import type { Requirement } from "../../../shared/contracts/index";
import { useRequirementMutations } from "../../shared/hooks/useQueryHooks";
import {
  ChevronRight,
  ChevronDown,
  Edit2,
  Check,
  Trash2,
  Plus,
  ArrowUp,
  ArrowDown,
  Copy,
  ClipboardPaste,
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
  onMove?: (id: string, direction: -1 | 1) => void;
  onCopy?: (id: string) => void;
  onPaste?: (parentId: string | null) => void;
  clipboardExists?: boolean;
}

const priorityColors: Record<Requirement["priority"], string> = {
  CRITICAL: "bg-red-500",
  HIGH: "bg-orange-500",
  MEDIUM: "bg-blue-400",
  LOW: "bg-gray-400",
};

const progressChip = (approved: number, total: number) => {
  const allDone = total > 0 && approved === total;
  return `inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold border ${
    allDone
      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
      : total === 0
      ? "bg-slate-100 text-slate-400 border-slate-200"
      : "bg-slate-100 text-slate-600 border-slate-200"
  }`;
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
  onMove,
  onCopy,
  onPaste,
  clipboardExists = false,
}: Props) {
  const { remove, update } = useRequirementMutations(projectId);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const children = items.filter((r) => (r.parentId || null) === parentId && r.level !== 'ac');

  const isExpanded = (id: string) => expandedIds.has(id);

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const acChildrenOf = (rowId: string) => items.filter((r) => r.parentId === rowId && r.level === 'ac');

  const storyChildrenOf = (rowId: string) => items.filter((r) => r.parentId === rowId && r.level === 'story');

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
      {(() => {
        const sortedChildren = [...children].sort((a, b) => a.position - b.position);
        return sortedChildren.map((r, idx) => {
        const hasChildren = items.some((i) => i.parentId === r.id);
        const expanded = isExpanded(r.id);
        const isSelected = selectedId === r.id;
        const isFirst = idx === 0;
        const isLast = idx === sortedChildren.length - 1;

        return (
          <div key={r.id} className="space-y-px">
            <div
              className={`group flex items-center gap-1.5 px-2 py-1 rounded cursor-pointer text-sm transition-all duration-150 ${
                isSelected
                  ? "bg-blue-50 text-slate-900 border border-blue-200"
                  : "text-slate-700 hover:bg-blue-50/60 hover:text-slate-900 border border-transparent"
              }`}
              style={{ paddingLeft: `${depth * 16 + 4}px` }}
              onClick={() => onSelect(r.id)}
            >
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
                <span className="w-[22px] shrink-0" />
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
                <span className={`flex-1 min-w-0 truncate ${isSelected ? "font-semibold text-[13px]" : "font-medium text-sm"}`} title={r.title}>{r.title}</span>
              )}
              {r.humanId && (
                <span className="font-mono text-[10px] text-slate-400 shrink-0">
                  {r.humanId}
                </span>
              )}
              {(() => {
                if (r.level === 'story') {
                  const acs = acChildrenOf(r.id);
                  const approved = acs.filter((a) => a.status === 'APPROVED').length;
                  return (
                    <span className={progressChip(approved, acs.length)}>
                      {approved}/{acs.length}
                    </span>
                  );
                }
                if (r.level === 'epic') {
                  const stories = storyChildrenOf(r.id);
                  const approved = stories.filter((s) => s.status === 'APPROVED').length;
                  return (
                    <span className={progressChip(approved, stories.length)}>
                      {approved}/{stories.length}
                    </span>
                  );
                }
                return null;
              })()}
              <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 ml-auto">
                {onMove && !isFirst && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onMove(r.id, -1); }}
                    className="p-0.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                    title="Move Up"
                  >
                    <ArrowUp size={12} />
                  </button>
                )}
                {onMove && !isLast && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onMove(r.id, 1); }}
                    className="p-0.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                    title="Move Down"
                  >
                    <ArrowDown size={12} />
                  </button>
                )}
                {onCopy && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onCopy(r.id); }}
                    className="p-0.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                    title="Copy"
                  >
                    <Copy size={12} />
                  </button>
                )}
                {onPaste && clipboardExists && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onPaste(r.id); }}
                    className="p-0.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                    title="Paste as Child"
                  >
                    <ClipboardPaste size={12} />
                  </button>
                )}
                {onAddChild && r.level !== 'ac' && (
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
              <div className="ml-4 pl-2 border-l border-slate-200 space-y-px">
                <RequirementTree
                  items={items}
                  selectedId={selectedId}
                  onSelect={onSelect}
                  onAddChild={onAddChild}
                  projectId={projectId}
                  parentId={r.id}
                  depth={depth + 1}
                  onRefresh={onRefresh}
                  onMove={onMove}
                  onCopy={onCopy}
                  onPaste={onPaste}
                  clipboardExists={clipboardExists}
                />
              </div>
            )}
          </div>
        );
      });
      })()}
    </div>
  );
}
