import React, { useState, useEffect, useMemo, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Save, Edit3, Eye, AlertTriangle, Check, X, Link2, ChevronDown, GitBranch } from "lucide-react";
import type { Requirement } from "../../../shared/contracts/index";
import { useRequirementMutations, useRequirements } from "../../shared/hooks/useQueryHooks";
import { parseStoryMarkdown } from "../../shared/requirements/format-parser";
import { StoryFormatHelpTooltip } from "./StoryFormatHelpTooltip";
import { ACList } from "./ACList";

interface Props {
  story: Requirement;
  acs: Requirement[];
  projectId: string;
  onSaved: () => void;
}

const typeOptions: { value: NonNullable<Requirement["type"]>; label: string }[] = [
  { value: "functional", label: "Functional" },
  { value: "non-functional", label: "Non-Functional" },
  { value: "security", label: "Security" },
  { value: "data", label: "Data" },
];

const statusOptions: { value: Requirement["status"]; label: string }[] = [
  { value: "DRAFT", label: "Draft" },
  { value: "APPROVED", label: "Approved" },
  { value: "DEPRECATED", label: "Deprecated" },
];

function DependenciesMultiSelect({
  story,
  knownHumanIds,
  selected,
  onChange,
}: {
  story: Requirement;
  knownHumanIds: { humanId: string; title: string; id: string }[];
  selected: string[];
  onChange: (next: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Only show stories as candidate dependencies (not ACs, not other epics).
  const candidates = knownHumanIds.filter((c) => c.id !== story.id);
  const isSelected = (id: string) => selected.includes(id);

  const toggle = (id: string) => {
    if (isSelected(id)) {
      onChange(selected.filter((s) => s !== id));
    } else {
      onChange([...selected, id]);
    }
  };

  return (
    <div
      className="relative"
      ref={containerRef}
      onKeyDown={(e) => {
        if (e.key === "Escape") setOpen(false);
      }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium bg-slate-50 border border-slate-200 rounded-lg text-slate-700 hover:bg-slate-100 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <Link2 size={11} className="text-slate-400" />
        {selected.length === 0 ? (
          <span className="text-slate-400">No dependencies</span>
        ) : (
          <span className="font-mono">{selected.length} selected</span>
        )}
        <ChevronDown size={11} className={`text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div
          role="listbox"
          aria-multiselectable="true"
          className="absolute z-30 mt-1 w-80 max-h-72 overflow-y-auto bg-white border border-slate-200 rounded-lg shadow-lg p-1.5"
        >
          {candidates.length === 0 ? (
            <div className="px-3 py-4 text-[11px] text-slate-400 text-center">
              No other stories in this project
            </div>
          ) : (
            candidates.map((c) => (
              <label
                key={c.id}
                className="flex items-start gap-2 px-2.5 py-1.5 rounded-md hover:bg-slate-50 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={isSelected(c.id)}
                  onChange={() => toggle(c.id)}
                  className="mt-0.5 h-3.5 w-3.5 rounded border-slate-300 text-blue-600 focus:ring-2 focus:ring-blue-500/20"
                />
                <div className="flex-1 min-w-0">
                  <div className="font-mono text-[11px] font-semibold text-slate-700">{c.humanId}</div>
                  <div className="text-[11px] text-slate-500 truncate">{c.title}</div>
                </div>
              </label>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export function StoryDetailView({ story, acs, projectId, onSaved }: Props) {
  const { update } = useRequirementMutations(projectId);
  const { data: allItems = [] } = useRequirements(projectId);
  const [title, setTitle] = useState(story.title);
  const [description, setDescription] = useState(story.description);
  const [humanId, setHumanId] = useState(story.humanId || "");
  const [status, setStatus] = useState<Requirement["status"]>(story.status);
  const [type, setType] = useState<NonNullable<Requirement["type"]>>(story.type || "functional");
  const [dependencies, setDependencies] = useState<string[]>(story.dependencies || []);
  const [isFlow, setIsFlow] = useState<boolean>(story.isFlow ?? false);
  const [mode, setMode] = useState<"edit" | "preview">("preview");
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "success" | "error">("idle");
  useEffect(() => {
    setTitle(story.title);
    setDescription(story.description);
    setHumanId(story.humanId || "");
    setStatus(story.status);
    setType(story.type || "functional");
    setDependencies(story.dependencies || []);
    setIsFlow(story.isFlow ?? false);
    setMode("preview");
    setSaveStatus("idle");
  }, [story.id, story.title, story.description, story.humanId, story.status, story.type, story.dependencies, story.isFlow]);

  const parsed = parseStoryMarkdown(description);
  const isEmpty = !description.trim();
  const showWarning = !isEmpty && !parsed.hasAllSegments;

  const epic = allItems.find((r) => r.id === story.parentId);

  // Candidate dependencies: other stories in the same project.
  const dependencyCandidates = useMemo(() => {
    return allItems
      .filter((r) => r.level === "story" && r.id !== story.id)
      .map((r) => ({ humanId: r.humanId || r.id, title: r.title, id: r.id }));
  }, [allItems, story.id]);

  // Validate selected dependencies against known IDs in the same project.
  const knownIdSet = useMemo(
    () => new Set(dependencyCandidates.map((c) => c.id)),
    [dependencyCandidates],
  );
  const unknownDeps = dependencies.filter((d) => !knownIdSet.has(d));

  const handleSave = async () => {
    if (!title.trim() || saveStatus === "saving") return;
    setSaveStatus("saving");
    try {
      await update(story.id, {
        title,
        description,
        humanId: humanId || null,
        status,
        type,
        dependencies,
        isFlow,
      });
      setSaveStatus("success");
      setMode("preview");
      setTimeout(() => setSaveStatus("idle"), 2000);
      onSaved();
    } catch {
      setSaveStatus("error");
      setTimeout(() => setSaveStatus("idle"), 3000);
    }
  };

  return (
    <div className="bg-white h-full flex flex-col min-h-0 relative">
      <div className="shrink-0 max-w-5xl mx-auto w-full px-8 pt-6 pb-5 border-b border-slate-200">
        <div className="flex items-center gap-2 mb-3 text-xs">
          <span className="text-[10.5px] font-semibold px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 uppercase tracking-wider">
            Story
          </span>
          {story.humanId && <span className="font-mono text-slate-400">{story.humanId}</span>}
          {epic && (
            <>
              <span className="text-slate-300">·</span>
              <span className="text-slate-500">in Epic · {epic.title}</span>
            </>
          )}
          <span className="text-slate-300">·</span>
          <span
            className={`text-[10.5px] font-semibold px-2 py-0.5 rounded border uppercase tracking-wider ${
              status === "APPROVED"
                ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                : status === "DRAFT"
                ? "bg-slate-100 text-slate-500 border-slate-200"
                : "bg-slate-200 text-slate-600 border-slate-300"
            }`}
          >
            {status}
          </span>
        </div>

        <div className="flex items-start gap-4">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Story title..."
            className="flex-1 min-w-0 text-2xl font-bold text-slate-900 bg-transparent border-none outline-none placeholder-slate-300 tracking-tight p-0"
          />
          <div className="flex items-center gap-2 shrink-0 pt-1">
            {saveStatus === "saving" && <span className="text-xs text-slate-500 animate-pulse">Saving...</span>}
            {saveStatus === "success" && (
              <span className="text-xs text-green-600 font-medium flex items-center gap-1">
                <Check size={14} /> Saved
              </span>
            )}
            {saveStatus === "error" && (
              <span className="text-xs text-red-600 font-medium flex items-center gap-1">
                <X size={14} /> Failed
              </span>
            )}
            <button
              onClick={handleSave}
              disabled={!title.trim() || saveStatus === "saving"}
              className={`flex items-center gap-2 px-4 py-2 text-white text-sm font-medium rounded-md transition-colors shadow-sm ${
                !title.trim() || saveStatus === "saving"
                  ? "bg-blue-400 cursor-not-allowed"
                  : "bg-blue-600 hover:bg-blue-700"
              }`}
            >
              <Save size={16} /> Save
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-6 gap-y-3 mt-5">
          <div className="flex items-center gap-2">
            <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              ID
            </label>
            <input
              type="text"
              value={humanId}
              onChange={(e) => setHumanId(e.target.value.toUpperCase())}
              placeholder="AUTH-007"
              className="font-mono bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-700 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none w-28"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              Status
            </label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as Requirement["status"])}
              className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-700 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none cursor-pointer"
            >
              {statusOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              Type
            </label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as NonNullable<Requirement["type"]>)}
              className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-700 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none cursor-pointer"
            >
              {typeOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              Dependencies
            </label>
            {isFlow ? (
              <span className="text-[11px] text-slate-400 italic">
                Flow stories use AC-level relatedRequirementIds instead
              </span>
            ) : (
              <DependenciesMultiSelect
                story={story}
                knownHumanIds={dependencyCandidates}
                selected={dependencies}
                onChange={setDependencies}
              />
            )}
          </div>
          {unknownDeps.length > 0 && !isFlow && (
            <div className="text-[11px] text-amber-600">
              Unknown humanIds: {unknownDeps.join(", ")}
            </div>
          )}
          <div className="flex items-center gap-2">
            <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              Flow
            </label>
            <button
              type="button"
              role="switch"
              aria-checked={isFlow}
              onClick={() => setIsFlow((v) => !v)}
              className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-colors focus:ring-2 focus:ring-blue-500/20 outline-none ${
                isFlow
                  ? "bg-purple-50 border-purple-200 text-purple-700"
                  : "bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100"
              }`}
              title="Mark this story as a business flow (BDD Feature)"
            >
              <GitBranch size={12} className={isFlow ? "text-purple-500" : "text-slate-400"} />
              {isFlow ? "Flow story" : "Standard"}
            </button>
          </div>
        </div>

        {isFlow && (
          <div className="mt-3 px-3 py-2 rounded-md bg-purple-50 border border-purple-200 text-purple-800 text-xs flex items-center gap-2">
            <GitBranch size={14} className="shrink-0" />
            <span>This is a flow story — its ACs are BDD scenarios (Given/When/Then paths).</span>
          </div>
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="max-w-5xl mx-auto px-8 py-6">
          <div className="flex items-center justify-between mb-2.5">
            <div className="flex items-center gap-2">
              <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                Description
              </label>

              <StoryFormatHelpTooltip />
            </div>
            <div className="flex items-center bg-slate-100 rounded-lg p-0.5">
              <button
                type="button"
                onClick={() => setMode("edit")}
                className={`flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                  mode === "edit"
                    ? "bg-white text-slate-700 shadow-sm border border-slate-200"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                <Edit3 size={12} /> Edit
              </button>
              <button
                type="button"
                onClick={() => setMode("preview")}
                className={`flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                  mode === "preview"
                    ? "bg-white text-slate-700 shadow-sm border border-slate-200"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                <Eye size={12} /> Preview
              </button>
            </div>
          </div>

          {showWarning && (
            <div className="mb-3 px-3 py-2 rounded-md bg-amber-50 border border-amber-200 text-amber-800 text-xs flex items-center gap-2">
              <AlertTriangle size={14} />
              <span>As a / I want / So that segments not detected.</span>
            </div>
          )}

          {mode === "preview" ? (
            <div className="markdown-body rounded-lg border border-slate-200 bg-slate-50/30 px-5 py-4 text-sm text-slate-700 leading-relaxed [&_p]:mb-2 [&_p:last-child]:mb-0">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {description || "*No description provided*"}
              </ReactMarkdown>
            </div>
          ) : (
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none placeholder-slate-300 resize-none min-h-[160px]"
              placeholder={"As a user\nI want to do something\nSo that I get value"}
            />
          )}
        </div>

        <div className="max-w-5xl mx-auto px-8 py-6">
          <ACList acs={acs} parentStoryId={story.id} projectId={projectId} onSaved={onSaved} parentStoryIsFlow={isFlow} />
        </div>
      </div>
    </div>
  );
}
