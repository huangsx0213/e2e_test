import React, { useState, useCallback, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { RequirementTree } from "./RequirementTree";
import { StoryDetailView } from "./StoryDetailView";
import { EpicDetailView } from "./EpicDetailView";
import { RequirementImport } from "./RequirementImport";
import { useRequirements, useRequirementMutations } from "../../shared/hooks/useQueryHooks";
import { queryKeys } from "@/shared/hooks/queryKeys";
import type { Requirement } from "../../../shared/contracts/index";
import {
  Plus,
  Upload,
  ListTree,
  RefreshCw,
  Search,
  ClipboardPaste,
  FileText,
} from "lucide-react";
import { HelpTooltip } from "@/shared/ui/HelpTooltip";

interface Props {
  currentProjectId?: string;
}

export function RequirementsPage({ currentProjectId }: Props) {
  const queryClient = useQueryClient();
  const {
    data: items = [],
    isLoading: loading,
    refetch: refresh,
  } = useRequirements(currentProjectId || "");
  const { create: _create, update: _update, remove: _remove } = useRequirementMutations(currentProjectId || "");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newChildParentId, setNewChildParentId] = useState<string | null>(
    null
  );
  const [suggestedLevel, setSuggestedLevel] = useState<Requirement["level"] | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [leftWidth, setLeftWidth] = useState(320);
  const [clipboard, setClipboard] = useState<Requirement | null>(null);
  const isDragging = useRef(false);
  const minWidth = 80;
  const maxWidth = 600;

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      isDragging.current = true;
      const startX = e.clientX;
      const startWidth = leftWidth;

      const onMouseMove = (moveEvent: MouseEvent) => {
        if (!isDragging.current) return;
        const delta = moveEvent.clientX - startX;
        const newWidth = Math.min(maxWidth, Math.max(minWidth, startWidth + delta));
        setLeftWidth(newWidth);
      };

      const onMouseUp = () => {
        isDragging.current = false;
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
      };

      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    },
    [leftWidth]
  );

  const selected = items.find((r) => r.id === selectedId) || null;

  const siblings = (parentId: string | null) =>
    items.filter((r) => (r.parentId || null) === parentId).sort((a, b) => a.position - b.position);

  const moveRequirement = async (id: string, direction: -1 | 1) => {
    const req = items.find((r) => r.id === id);
    if (!req) return;
    const sibs = siblings(req.parentId ?? null);
    const index = sibs.findIndex((s) => s.id === id);
    if (index === -1) return;
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= sibs.length) return;
    const target = sibs[newIndex];
    const current = sibs[index];
    await Promise.all([
      _update(current.id, { position: target.position }),
      _update(target.id, { position: current.position }),
    ]);
    refresh();
  };

  const copyRequirement = (id: string) => {
    const req = items.find((r) => r.id === id);
    if (!req) return;
    setClipboard(JSON.parse(JSON.stringify(req)));
  };

  const pasteRequirement = async (parentId: string | null) => {
    if (!clipboard) return;
    const sibs = siblings(parentId);
    const nextPosition = sibs.length > 0 ? Math.max(...sibs.map((s) => s.position)) + 1 : 0;
    const pasteLevel = parentId
      ? levelProgression[items.find((r) => r.id === parentId)?.level ?? "story"]
      : "epic";
    await _create({
      ...clipboard,
      id: `req-${Date.now()}`,
      projectId,
      title: `${clipboard.title} (Copy)`,
      parentId,
      position: nextPosition,
      level: pasteLevel,
    });
    setClipboard(null);
    refresh();
  };

  const filteredItems = searchTerm
    ? items.filter(
        (r) =>
          r.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
          r.description.toLowerCase().includes(searchTerm.toLowerCase())
      )
    : items;

  const projectId = currentProjectId || "";

  const levelProgression: Record<Requirement["level"], Requirement["level"]> = {
    epic: "story",
    story: "ac",
    ac: "ac",
  };

  const handleNewRoot = () => {
    setSelectedId(null);
    setNewChildParentId(null);
    setSuggestedLevel(null);
  };

  const handleAddChild = (parentId: string) => {
    const parent = items.find((r) => r.id === parentId);
    setSelectedId(null);
    setNewChildParentId(parentId);
    setSuggestedLevel(parent ? levelProgression[parent.level] : "story");
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full bg-slate-50">
        <div className="text-center">
          <div className="w-10 h-10 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-slate-500">Loading requirements...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex bg-slate-50 overflow-hidden">
      <div
        className="border-r border-slate-200 bg-slate-50 flex flex-col shrink-0 overflow-hidden"
        style={{ width: leftWidth }}
      >
        <div className="p-3 border-b border-slate-100 space-y-3 bg-slate-50/50">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
              <ListTree size={14} />
              Requirements
              <HelpTooltip content="Organize requirements in a tree hierarchy. Click a requirement to view or edit its details." />
            </h2>
            <div className="flex items-center gap-1 ml-auto">
              <button
                onClick={() => {
                  setIsRefreshing(true);
                  queryClient.invalidateQueries({
                    queryKey: queryKeys.requirements,
                  });
                  setTimeout(() => setIsRefreshing(false), 500);
                }}
                className="text-slate-400 hover:text-blue-600 p-1 rounded-md hover:bg-blue-50 transition-colors"
                title="Refresh"
              >
                <RefreshCw
                  size={14}
                  className={isRefreshing ? "animate-spin" : ""}
                />
              </button>
              <button
                onClick={handleNewRoot}
                className="text-slate-400 hover:text-blue-600 p-1 rounded-md hover:bg-blue-50 transition-colors"
                title="Add Root Requirement"
              >
                <Plus size={14} />
              </button>
              <button
                onClick={() => setShowImport(true)}
                className="text-slate-400 hover:text-blue-600 p-1 rounded-md hover:bg-blue-50 transition-colors"
                title="Import Requirements"
              >
                <Upload size={14} />
              </button>
              <button
                onClick={() => pasteRequirement(null)}
                disabled={!clipboard}
                className={`p-1 rounded-md transition-colors ${
                  clipboard
                    ? "text-slate-400 hover:text-blue-600 hover:bg-blue-50"
                    : "text-slate-300 cursor-not-allowed"
                }`}
                title="Paste as Root Requirement"
              >
                <ClipboardPaste size={14} />
              </button>
            </div>
          </div>

          <div className="relative">
            <Search
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"
              size={14}
            />
            <input
              type="text"
              placeholder="Filter requirements..."
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all text-slate-700"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-2 py-3">
          {filteredItems.length === 0 && (
            <div className="text-center py-12 px-4">
              <ListTree size={32} className="mx-auto text-slate-300 mb-3" />
              <p className="text-sm text-slate-500 font-medium">
                No requirements found
              </p>
              <p className="text-xs text-slate-400 mt-1">
                {searchTerm
                  ? "Try adjusting your search."
                  : "Create your first requirement or import from a file."}
              </p>
            </div>
          )}
          <RequirementTree
            items={filteredItems}
            selectedId={selectedId}
            onSelect={(id) => {
              setSelectedId(id);
              setNewChildParentId(null);
              setSuggestedLevel(null);
            }}
            onAddChild={handleAddChild}
            projectId={projectId}
            onRefresh={refresh}
            onMove={moveRequirement}
            onCopy={copyRequirement}
            onPaste={pasteRequirement}
            clipboardExists={!!clipboard}
          />
        </div>

        <div className="px-3 py-2 border-t border-slate-100 bg-slate-50/50">
          <p className="text-[10px] text-slate-400 text-center">
            {items.length} requirement{items.length !== 1 ? "s" : ""} total
          </p>
        </div>
      </div>

      <div
        className="w-1.5 cursor-col-resize shrink-0 relative -ml-0.5 z-10 group"
        onMouseDown={handleMouseDown}
      >
        <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-px rounded-full group-hover:w-[2px] group-hover:bg-blue-400 transition-all" />
      </div>

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {!selected && (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-400 bg-slate-50 h-full">
            <div className="w-16 h-16 rounded-full bg-white shadow-sm border border-slate-100 flex items-center justify-center mb-4">
              <FileText size={32} className="text-slate-300" />
            </div>
            <p className="font-medium text-slate-500">Select a story or epic to view details</p>
            <p className="text-xs text-slate-400 mt-1">Or use the sidebar to create a new requirement</p>
          </div>
        )}
        {selected?.level === 'story' && (
          <StoryDetailView
            story={selected}
            acs={items.filter((r) => r.parentId === selected.id && r.level === 'ac')}
            projectId={projectId}
            onSaved={() => refresh()}
          />
        )}
        {selected?.level === 'epic' && (
          <EpicDetailView
            epic={selected}
            projectId={projectId}
            onSaved={() => refresh()}
          />
        )}
      </div>

      {showImport && (
        <RequirementImport
          projectId={projectId}
          onClose={() => setShowImport(false)}
          onImported={refresh}
        />
      )}
    </div>
  );
}