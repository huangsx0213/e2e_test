import React, { useState, useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Requirement } from "../../../shared/contracts/index";
import { useRequirementMutations } from "../../shared/hooks/useQueryHooks";
import { Save, Eye, Edit3, X, FileText, Check } from "lucide-react";

interface Props {
  item: Requirement | null;
  projectId: string;
  parentId?: string | null;
  suggestedLevel?: Requirement["level"] | null;
  onSaved: () => void;
}

const tagStyle = { bg: "bg-slate-100 border-slate-200", text: "text-slate-600", dot: "bg-slate-400" };

export function RequirementEditor({
  item,
  projectId,
  parentId,
  suggestedLevel,
  onSaved,
}: Props) {
  const { create, update } = useRequirementMutations(projectId);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [level, setLevel] = useState<Requirement["level"]>("story");
  const [priority, setPriority] = useState<Requirement["priority"]>("MEDIUM");
  const [status, setStatus] = useState<Requirement["status"]>("DRAFT");
  const [tags, setTags] = useState<string[]>([]);
  const [showPreview, setShowPreview] = useState(false);
  const [tagInput, setTagInput] = useState("");
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
  const tagInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (item) {
      setTitle(item.title);
      setDescription(item.description);
      setLevel(item.level || "story");
      setPriority(item.priority);
      setStatus(item.status);
      setTags(item.tags || []);
    } else {
      setTitle("");
      setDescription("");
      setLevel(suggestedLevel || "story");
      setPriority("MEDIUM");
      setStatus("DRAFT");
      setTags([]);
    }
  }, [item, suggestedLevel]);

  const handleSave = async () => {
    if (!title.trim() || saveStatus === "saving") return;
    setSaveStatus("saving");
    try {
      if (item) {
        await update(item.id, {
          title,
          description,
          level,
          priority,
          status,
          tags,
        });
      } else {
        await create({
          projectId,
          parentId: parentId ?? null,
          title,
          description,
          level,
          priority,
          status,
          tags,
          position: 0,
          metadata: {},
        } as any);
      }
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
    if (t && !tags.includes(t)) {
      setTags([...tags, t]);
    }
  };

  const removeTag = (tag: string) => {
    setTags(tags.filter((t) => t !== tag));
  };

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

  if (!item && !projectId) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-slate-400 bg-slate-50 h-full">
        <div className="w-16 h-16 rounded-full bg-white shadow-sm border border-slate-100 flex items-center justify-center mb-4">
          <FileText size={32} className="text-slate-300" />
        </div>
        <p className="font-medium text-slate-500">
          Select a requirement to view details
        </p>
        <p className="text-xs text-slate-400 mt-1">
          Or use the sidebar to create a new requirement
        </p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-white">
      {/* ── Top bar: title + save button ── */}
      <div className="shrink-0 max-w-[1600px] mx-auto w-full px-8 pt-6 pb-3">
        <div className="flex items-center gap-4">
          <div className="flex-1 min-w-0">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Requirement title..."
              className="w-full text-2xl font-bold text-slate-900 bg-transparent border-none outline-none placeholder-slate-300 tracking-tight p-0"
            />
            {item && (
              <div className="flex items-center gap-2 mt-1.5">
                <span className="text-xs font-mono text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                  {item.id}
                </span>
                {item.parentId && (
                  <>
                    <span className="text-slate-300 text-xs">/</span>
                    <span className="text-xs text-slate-400 font-mono">
                      {item.parentId}
                    </span>
                  </>
                )}
              </div>
            )}
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {saveStatus === "saving" && (
              <span className="text-xs text-slate-500 animate-pulse">Saving...</span>
            )}
            {saveStatus === "success" && (
              <span className="text-xs text-green-600 font-medium flex items-center gap-1">
                <Check size={14} /> Saved successfully
              </span>
            )}
            {saveStatus === "error" && (
              <span className="text-xs text-red-600 font-medium flex items-center gap-1">
                <X size={14} /> Save failed
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
              <Save size={16} />
              <span>{item ? "Save" : "Create"}</span>
            </button>
          </div>
        </div>
      </div>

      {/* ── Main content ── */}
      <div className="flex-1 min-h-0 max-w-[1600px] mx-auto w-full flex flex-col px-8 pb-8">

        {/* ── Tags ── */}
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
                <button
                  type="button"
                  onClick={() => removeTag(tag)}
                  className="ml-0.5 hover:opacity-60 transition-opacity"
                >
                  <X size={11} />
                </button>
              </span>
            ))}
            <input
              ref={tagInputRef}
              type="text"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={handleTagKeyDown}
              onBlur={() => {
                if (tagInput.trim()) {
                  addTag(tagInput);
                  setTagInput("");
                }
              }}
              placeholder={tags.length === 0 ? "Type tag and press Enter..." : ""}
              className="min-w-[80px] text-xs bg-transparent border-none outline-none placeholder-slate-300 text-slate-700 py-1"
            />
          </div>
          <p className="text-[11px] text-slate-400 mt-1.5">
            Press Enter or comma to add, Backspace to remove last
          </p>
        </div>

        {/* ── Metadata row ── */}
        <div className="shrink-0 flex flex-wrap items-center gap-4 mt-6">
          <div className="flex items-center gap-2">
            <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              Level
            </label>
            <select
              value={level}
              onChange={(e) =>
                setLevel(e.target.value as Requirement["level"])
              }
              className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-700 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none cursor-pointer"
            >
              <option value="epic">Epic</option>
              <option value="feature">Feature</option>
              <option value="story">Story</option>
              <option value="ac">AC</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              Priority
            </label>
            <select
              value={priority}
              onChange={(e) =>
                setPriority(e.target.value as Requirement["priority"])
              }
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
              onChange={(e) =>
                setStatus(e.target.value as Requirement["status"])
              }
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

        {/* ── Description ── */}
        <div className="flex-1 min-h-0 flex flex-col mt-6">
          <div className="shrink-0 flex items-center justify-between mb-2.5">
            <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              Description
            </label>
            <div className="flex items-center bg-slate-100 rounded-lg p-0.5">
              <button
                type="button"
                onClick={() => setShowPreview(false)}
                className={`flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                  !showPreview
                    ? "bg-white text-slate-700 shadow-sm border border-slate-200"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                <Edit3 size={12} />
                Edit
              </button>
              <button
                type="button"
                onClick={() => setShowPreview(true)}
                className={`flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                  showPreview
                    ? "bg-white text-slate-700 shadow-sm border border-slate-200"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                <Eye size={12} />
                Preview
              </button>
            </div>
          </div>
          {showPreview ? (
            <div className="flex-1 min-h-0 overflow-y-auto border border-slate-200 rounded-lg px-4 py-3 text-sm text-slate-700 [&_h1]:text-lg [&_h1]:font-bold [&_h1]:text-slate-900 [&_h1]:mb-2 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:text-slate-900 [&_h2]:mb-2 [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:text-slate-900 [&_h3]:mb-1 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:mb-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:mb-2 [&_li>p]:mb-0 [&_code]:text-xs [&_code]:bg-slate-100 [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_pre]:bg-slate-100 [&_pre]:p-3 [&_pre]:rounded-lg [&_pre]:overflow-x-auto [&_pre]:mb-3 [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_blockquote]:border-l-4 [&_blockquote]:border-slate-300 [&_blockquote]:pl-3 [&_blockquote]:text-slate-500 [&_blockquote]:italic [&_blockquote]:mb-2 [&_table]:w-full [&_table]:border-collapse [&_table]:mb-3 [&_th]:border [&_th]:border-slate-300 [&_th]:px-3 [&_th]:py-2 [&_th]:bg-slate-50 [&_th]:text-left [&_th]:text-xs [&_th]:font-semibold [&_td]:border [&_td]:border-slate-300 [&_td]:px-3 [&_td]:py-2 [&_a]:text-blue-600 [&_a]:underline [&_a:hover]:text-blue-800 [&_p]:mb-2 [&_p:last-child]:mb-0 [&_hr]:border-slate-200 [&_hr]:my-3 [&_img]:max-w-full [&_img]:rounded-lg [&_input[type=checkbox]]:accent-blue-600 [&_input[type=checkbox]]:mr-1.5">
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
