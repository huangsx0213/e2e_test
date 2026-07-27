import React, { useState, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Save, Trash2, Edit3, Eye, ArrowUp, ArrowDown, AlertTriangle } from "lucide-react";
import type { Requirement } from "../../../shared/contracts/index";
import { useRequirementMutations } from "../../shared/hooks/useQueryHooks";
import { parseACMarkdown } from "../../shared/requirements/format-parser";
import { ACFormatHelpTooltip } from "./ACFormatHelpTooltip";

interface Props {
  ac: Requirement;
  index: number;
  parentStoryId: string;
  projectId: string;
  onSaved: (ac: Requirement) => void;
  onMoveUp: (id: string) => void;
  onMoveDown: (id: string) => void;
}

export function ACCard({ ac, index, parentStoryId, projectId, onSaved, onMoveUp, onMoveDown }: Props) {
  const { update, remove } = useRequirementMutations(projectId);
  const [description, setDescription] = useState(ac.description);
  const [flowType, setFlowType] = useState<"atomic" | "flow">(ac.flowType || "atomic");
  const [mode, setMode] = useState<"edit" | "preview">("preview");

  useEffect(() => {
    setDescription(ac.description);
    setFlowType(ac.flowType || "atomic");
  }, [ac.id, ac.description, ac.flowType]);

  const parsed = parseACMarkdown(description);
  const isEmpty = !description.trim();
  const showWarning = !isEmpty && !parsed.hasAllSegments;

  const handleSave = async () => {
    try {
      await update(ac.id, { description, flowType });
      onSaved({ ...ac, description, flowType });
    } catch (e) {
      console.error("Save failed", e);
    }
  };

  const handleToggleFlowType = async () => {
    const next: "atomic" | "flow" = flowType === "atomic" ? "flow" : "atomic";
    setFlowType(next);
    try {
      await update(ac.id, { flowType: next });
      onSaved({ ...ac, flowType: next });
    } catch (e) {
      setFlowType(flowType);
      console.error("Toggle failed", e);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm(`Delete AC ${ac.humanId || ac.id}?`)) return;
    try {
      await remove(ac.id);
      onSaved({ ...ac, description: "__deleted__" } as Requirement);
    } catch (e) {
      console.error("Delete failed", e);
    }
  };

  return (
    <article
      className={`bg-white border rounded-lg overflow-hidden ${
        isEmpty ? "border-dashed border-slate-300 opacity-90" : "border-slate-200"
      }`}
    >
      <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-3">
        <span className="font-mono text-[11px] text-slate-500 flex items-center gap-2">
          {ac.humanId && <span className="font-semibold text-slate-700">{ac.humanId}</span>}
          <span className="text-slate-300">·</span>
          <span>#{index}</span>
        </span>
        {ac.status === "DRAFT" && (
          <span className="text-[10.5px] font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-500 border border-slate-200 uppercase tracking-wider">
            Draft
          </span>
        )}
        <button
          onClick={handleToggleFlowType}
          aria-label="toggle flow type"
          className="ml-auto flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700"
        >
          <span>{flowType === "atomic" ? "Atomic" : "Flow"}</span>
          <span
            className={`w-7 h-3.5 rounded-full relative transition-colors ${
              flowType === "flow" ? "bg-slate-300" : "bg-emerald-500"
            }`}
          >
            <span
              className={`absolute top-0.5 w-2.5 h-2.5 rounded-full bg-white shadow transition-all ${
                flowType === "flow" ? "left-0.5" : "right-0.5"
              }`}
            />
          </span>
        </button>
        <ACFormatHelpTooltip />
      </div>

      <div className="px-5 py-4">
        {showWarning && (
          <div className="mb-3 px-3 py-2 rounded-md bg-amber-50 border border-amber-200 text-amber-800 text-xs flex items-center gap-2">
            <AlertTriangle size={14} />
            <span>Format warning: Given/When/Then segments not detected.</span>
          </div>
        )}

        {isEmpty ? (
          <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50/30 px-4 py-6 text-sm text-slate-400 text-center italic">
            Empty — awaiting content
          </div>
        ) : mode === "preview" ? (
          <div className="markdown-body rounded-lg border border-slate-200 bg-slate-50/30 px-4 py-3 text-sm text-slate-700 leading-relaxed [&_p]:mb-2 [&_p:last-child]:mb-0">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{description}</ReactMarkdown>
          </div>
        ) : (
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm text-slate-900 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none placeholder-slate-300 resize-none min-h-[120px]"
            placeholder={"Given:\nWhen:\nThen:"}
          />
        )}

        <div className="mt-3 flex items-center gap-2">
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
          <button
            onClick={() => onMoveUp(ac.id)}
            className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
            title="Move up"
          >
            <ArrowUp size={14} />
          </button>
          <button
            onClick={() => onMoveDown(ac.id)}
            className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
            title="Move down"
          >
            <ArrowDown size={14} />
          </button>
          <button
            onClick={handleDelete}
            className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors"
            title="Delete AC"
          >
            <Trash2 size={14} />
          </button>
          <button
            onClick={handleSave}
            className="ml-auto flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white rounded-md transition-colors bg-blue-600 hover:bg-blue-700"
          >
            <Save size={12} /> Save
          </button>
        </div>
      </div>
    </article>
  );
}
