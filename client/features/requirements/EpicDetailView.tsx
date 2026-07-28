import React, { useState, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Save, Edit3, Eye, Check, X } from "lucide-react";
import type { Requirement } from "../../../shared/contracts/index";
import { useRequirementMutations } from "../../shared/hooks/useQueryHooks";

interface Props {
  epic: Requirement;
  projectId: string;
  onSaved: () => void;
}

export function EpicDetailView({ epic, projectId, onSaved }: Props) {
  const { update } = useRequirementMutations(projectId);
  const [title, setTitle] = useState(epic.title);
  const [description, setDescription] = useState(epic.description);
  const [humanId, setHumanId] = useState(epic.humanId || "");
  const [showPreview, setShowPreview] = useState(true);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "success" | "error">("idle");

  useEffect(() => {
    setTitle(epic.title);
    setDescription(epic.description);
    setHumanId(epic.humanId || "");
    setShowPreview(true);
    setSaveStatus("idle");
  }, [epic.id, epic.title, epic.description, epic.humanId]);

  const handleSave = async () => {
    if (!title.trim() || saveStatus === "saving") return;
    setSaveStatus("saving");
    try {
      await update(epic.id, {
        title,
        description,
        humanId: humanId || null,
      });
      setSaveStatus("success");
      setShowPreview(true);
      setTimeout(() => setSaveStatus("idle"), 2000);
      onSaved();
    } catch {
      setSaveStatus("error");
      setTimeout(() => setSaveStatus("idle"), 3000);
    }
  };

  return (
    <div className="h-full flex flex-col bg-white">
      <div className="shrink-0 max-w-5xl mx-auto w-full px-8 pt-6 pb-5 border-b border-slate-200">
        <div className="flex items-center gap-2 mb-3 text-xs">
          <span className="text-[10.5px] font-semibold px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 uppercase tracking-wider">
            Epic
          </span>
          {epic.humanId && <span className="font-mono text-slate-400">{epic.humanId}</span>}
        </div>

        <div className="flex items-start gap-4">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Epic title..."
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

        <div className="flex items-center gap-2 mt-5">
          <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
            ID
          </label>
          <input
            type="text"
            value={humanId}
            onChange={(e) => setHumanId(e.target.value.toUpperCase())}
            placeholder="E-001"
            className="font-mono bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-700 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none w-32"
          />
        </div>
      </div>

      <div className="flex-1 min-h-0 max-w-5xl mx-auto w-full flex flex-col px-8 py-6">
        <div className="flex items-center justify-between mb-2.5">
          <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
            Description
          </label>
          <div className="flex items-center bg-slate-100 rounded-lg p-0.5">
            <button
              type="button"
              onClick={() => setShowPreview(false)}
              className={`flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                !showPreview ? "bg-white text-slate-700 shadow-sm border border-slate-200" : "text-slate-500 hover:text-slate-700"
              }`}
            >
              <Edit3 size={12} /> Edit
            </button>
            <button
              type="button"
              onClick={() => setShowPreview(true)}
              className={`flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                showPreview ? "bg-white text-slate-700 shadow-sm border border-slate-200" : "text-slate-500 hover:text-slate-700"
              }`}
            >
              <Eye size={12} /> Preview
            </button>
          </div>
        </div>
        {showPreview ? (
          <div className="markdown-body flex-1 min-h-0 overflow-y-auto border border-slate-200 bg-slate-50/30 rounded-lg px-4 py-3 text-sm text-slate-700 leading-relaxed [&_p]:mb-2 [&_p:last-child]:mb-0">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {description || "*No description provided*"}
            </ReactMarkdown>
          </div>
        ) : (
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="flex-1 min-h-0 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none placeholder-slate-300 resize-none"
            placeholder="Describe the business objective of this epic. Provides AI context for downstream story generation."
          />
        )}
      </div>
    </div>
  );
}
