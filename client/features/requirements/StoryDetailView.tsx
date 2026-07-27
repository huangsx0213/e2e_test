import React, { useState, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Save, Edit3, Eye, AlertTriangle } from "lucide-react";
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

export function StoryDetailView({ story, acs, projectId, onSaved }: Props) {
  const { update } = useRequirementMutations(projectId);
  const { data: allItems = [] } = useRequirements(projectId);
  const [title, setTitle] = useState(story.title);
  const [description, setDescription] = useState(story.description);
  const [humanId, setHumanId] = useState(story.humanId || "");
  const [status, setStatus] = useState<Requirement["status"]>(story.status);
  const [priority, setPriority] = useState<Requirement["priority"]>(story.priority);
  const [mode, setMode] = useState<"edit" | "preview">("preview");

  useEffect(() => {
    setTitle(story.title);
    setDescription(story.description);
    setHumanId(story.humanId || "");
    setStatus(story.status);
    setPriority(story.priority);
  }, [story.id, story.title, story.description, story.humanId, story.status, story.priority]);

  const parsed = parseStoryMarkdown(description);
  const isEmpty = !description.trim();
  const showWarning = !isEmpty && !parsed.hasAllSegments;

  const approvedCount = acs.filter((a) => a.status === "APPROVED").length;
  const epic = allItems.find((r) => r.id === story.parentId);

  const handleSave = async () => {
    await update(story.id, { title, description, humanId: humanId || null, status, priority });
    onSaved();
  };

  return (
    <div className="bg-white">
      <div className="max-w-5xl mx-auto px-8 pt-6 pb-5 border-b border-slate-200">
        <div className="flex items-center gap-2 mb-3 text-xs">
          <span className="text-[10.5px] font-semibold px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 uppercase tracking-wider">
            Story
          </span>
          {story.humanId && (
            <span className="font-mono text-slate-400">{story.humanId}</span>
          )}
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
                : "bg-blue-50 text-blue-700 border-blue-200"
            }`}
          >
            {status}
          </span>
          <StoryFormatHelpTooltip />
        </div>

        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Story title..."
          className="w-full text-[32px] font-semibold text-slate-900 bg-transparent border-none outline-none placeholder-slate-300 tracking-tight p-0 mb-3"
        />

        <div className="flex items-center gap-4 text-xs mb-4">
          <div className="flex items-center gap-2">
            <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              Display ID
            </label>
            <input
              type="text"
              value={humanId}
              onChange={(e) => setHumanId(e.target.value.toUpperCase())}
              placeholder="AUTH-007"
              className="font-mono bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-700 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none w-32"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              Priority
            </label>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as Requirement["priority"])}
              className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-700 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none cursor-pointer"
            >
              <option value="CRITICAL">Critical (P0)</option>
              <option value="HIGH">High (P1)</option>
              <option value="MEDIUM">Medium (P2)</option>
              <option value="LOW">Low (P3)</option>
            </select>
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
              <option value="DRAFT">Draft</option>
              <option value="IN_PROGRESS">In Progress</option>
              <option value="APPROVED">Approved</option>
              <option value="DEPRECATED">Deprecated</option>
            </select>
          </div>
          <button
            onClick={handleSave}
            className="ml-auto flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white rounded-md transition-colors bg-blue-600 hover:bg-blue-700"
          >
            <Save size={12} /> Save
          </button>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-8 py-6">
        <div className="flex items-center justify-between mb-2.5">
          <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
            Description
          </label>
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
            <span>Format warning: As a / I want / So that segments not detected.</span>
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

      <div className="border-t border-slate-100 bg-slate-50/60 px-8 py-3 flex items-center gap-6 max-w-5xl mx-auto">
        <div className="flex items-center gap-5 font-mono text-xs">
          <div className="flex items-center gap-1.5">
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border bg-slate-100 border-slate-200 text-slate-600 text-xs font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
              {acs.length} ACs
            </span>
          </div>
          {approvedCount > 0 && (
            <div className="flex items-center gap-1.5">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md border bg-emerald-50 border-emerald-200 text-emerald-700 text-xs font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                {approvedCount} approved
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-8 py-6">
        <ACList acs={acs} parentStoryId={story.id} projectId={projectId} onSaved={onSaved} />
      </div>
    </div>
  );
}
