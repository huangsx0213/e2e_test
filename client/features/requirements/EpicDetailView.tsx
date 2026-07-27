import React, { useState, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Save, Edit3, Eye, X, Check } from "lucide-react";
import type { Requirement } from "../../../shared/contracts/index";
import { useRequirementMutations } from "../../shared/hooks/useQueryHooks";

interface Props {
  epic: Requirement;
  projectId: string;
  onSaved: () => void;
}

const tagStyle = { bg: "bg-slate-100 border-slate-200", text: "text-slate-600", dot: "bg-slate-400" };

export function EpicDetailView({ epic, projectId, onSaved }: Props) {
  const { update } = useRequirementMutations(projectId);
  const [title, setTitle] = useState(epic.title);
  const [description, setDescription] = useState(epic.description);
  const [humanId, setHumanId] = useState(epic.humanId || "");
  const [priority, setPriority] = useState<Requirement["priority"]>(epic.priority);
  const [status, setStatus] = useState<Requirement["status"]>(epic.status);
  const [tags, setTags] = useState<string[]>(epic.tags || []);
  const [tagInput, setTagInput] = useState("");
  const [showPreview, setShowPreview] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "success" | "error">("idle");

  useEffect(() => {
    setTitle(epic.title);
    setDescription(epic.description);
    setHumanId(epic.humanId || "");
    setPriority(epic.priority);
    setStatus(epic.status);
    setTags(epic.tags || []);
  }, [epic.id, epic.title, epic.description, epic.humanId, epic.priority, epic.status, epic.tags]);

  const handleSave = async () => {
    if (!title.trim() || saveStatus === "saving") return;
    setSaveStatus("saving");
    try {
      await update(epic.id, {
        title,
        description,
        humanId: humanId || null,
        priority,
        status,
        tags,
      });
      setSaveStatus("success");
      setTimeout(() => setSaveStatus("idle"), 2000);
      onSaved();
    } catch {
      setSaveStatus("error");
      setTimeout(() => setSaveStatus("idle"), 3000);
    }
  };

  const addTag = (tag: string) => {
    const t = tag.trim().toLowerCase();
    if (t && !tags.includes(t)) setTags([...tags, t]);
  };
  const removeTag = (tag: string) => setTags(tags.filter((t) => t !== tag));

  const handleTagKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTag(tagInput);
      setTagInput("");
    }
    if (e.key === "Backspace" && !tagInput && tags.length > 0) {
      removeTag(tags[tags.length - 1]);
    }
  };

  return (
    <div className="h-full flex flex-col bg-white">
      <div className="shrink-0 max-w-5xl mx-auto w-full px-8 pt-6 pb-3">
        <div className="flex items-center gap-2 mb-3 text-xs">
          <span className="text-[10.5px] font-semibold px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 uppercase tracking-wider">
            Epic
          </span>
          {epic.humanId && <span className="font-mono text-slate-400">{epic.humanId}</span>}
        </div>

        <div className="flex items-center gap-4">
          <div className="flex-1 min-w-0">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Epic title..."
              className="w-full text-2xl font-bold text-slate-900 bg-transparent border-none outline-none placeholder-slate-300 tracking-tight p-0"
            />
          </div>
          <div className="flex items-center gap-3 shrink-0">
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
      </div>

      <div className="flex-1 min-h-0 max-w-5xl mx-auto w-full flex flex-col px-8 pb-8">
        <div className="shrink-0 mt-6">
          <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-2.5">
            Tags
          </label>
          <div className="flex flex-wrap items-center gap-1.5">
            {tags.map((tag) => (
              <span
                key={tag}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs font-medium ${tagStyle.bg} ${tagStyle.text}`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${tagStyle.dot}`} />
                {tag}
                <button type="button" onClick={() => removeTag(tag)} className="ml-0.5 hover:opacity-60">
                  <X size={11} />
                </button>
              </span>
            ))}
            <input
              type="text"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={handleTagKeyDown}
              placeholder={tags.length === 0 ? "Type tag and press Enter..." : ""}
              className="min-w-[80px] text-xs bg-transparent border-none outline-none placeholder-slate-300 text-slate-700 py-1"
            />
          </div>
        </div>

        <div className="shrink-0 flex flex-wrap items-center gap-4 mt-6">
          <div className="flex items-center gap-2">
            <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Display ID</label>
            <input
              type="text"
              value={humanId}
              onChange={(e) => setHumanId(e.target.value.toUpperCase())}
              placeholder="E-001"
              className="font-mono bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-700 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none w-32"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Priority</label>
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
            <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Status</label>
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
        </div>

        <hr className="shrink-0 border-slate-100 mt-6" />

        <div className="flex-1 min-h-0 flex flex-col mt-6">
          <div className="shrink-0 flex items-center justify-between mb-2.5">
            <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Description</label>
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
            <div className="flex-1 min-h-0 overflow-y-auto border border-slate-200 rounded-lg px-4 py-3 text-sm text-slate-700 [&_p]:mb-2 [&_p:last-child]:mb-0">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {description || "*No description provided*"}
              </ReactMarkdown>
            </div>
          ) : (
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="flex-1 min-h-0 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none placeholder-slate-300 resize-none"
              placeholder="Write a detailed description using Markdown..."
            />
          )}
        </div>
      </div>
    </div>
  );
}
