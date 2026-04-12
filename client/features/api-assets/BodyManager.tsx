import React, { useState, useEffect } from "react";
import {
  Plus,
  Trash2,
  Save,
  Search,
  FileCode,
  AlignLeft,
  Check,
  X,
} from "lucide-react";
import { CrudActions } from "@/shared/hooks/useCrud";
import { BodyTemplate } from "@/shared/types";
import { HelpTooltip } from "@/shared/ui/HelpTooltip";
import { ConfirmModal } from "@/shared/ui/ConfirmModal";

interface BodyManagerProps {
  bodies: BodyTemplate[];
  bodiesApi: CrudActions<BodyTemplate>;
  currentProjectId: string;
}

export const BodyManager: React.FC<BodyManagerProps> = ({
  bodies,
  bodiesApi,
  currentProjectId,
}) => {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  // Editing state
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editType, setEditType] =
    useState<BodyTemplate["contentType"]>("application/json");
  const [editContent, setEditContent] = useState("");
  const [editDefaultValues, setEditDefaultValues] = useState<
    Record<string, string>
  >({});
  const [formatError, setFormatError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<
    "idle" | "saving" | "success" | "error"
  >("idle");

  const selectedTemplate = bodies.find((t) => t.id === selectedId);

  useEffect(() => {
    if (selectedId && !bodies.find((b) => b.id === selectedId)) {
      setSelectedId(null);
    }
  }, [bodies, selectedId]);

  useEffect(() => {
    if (selectedTemplate) {
      setEditName(selectedTemplate.name);
      setEditDesc(selectedTemplate.description || "");
      setEditType(selectedTemplate.contentType);
      setEditContent(selectedTemplate.content);
      setEditDefaultValues(selectedTemplate.defaultValues || {});
      setSaveStatus("idle");
    }
  }, [selectedId, bodies]); // Re-run when selection changes

  const handleCreate = async () => {
    if (!currentProjectId) return;
    const newTemplate: BodyTemplate = {
      id: `b_${Date.now()}`,
      projectId: currentProjectId,
      name: "New Body Template",
      description: "",
      contentType: "application/json",
      content: '{\n  "key": "{{value}}"\n}',
      defaultValues: { value: "" },
    };
    await bodiesApi.create(newTemplate);
    setSelectedId(newTemplate.id);
  };

  const handleSave = async () => {
    if (!selectedId) return;
    setSaveStatus("saving");
    try {
      await bodiesApi.update(selectedId, {
        name: editName,
        description: editDesc,
        contentType: editType,
        content: editContent,
        defaultValues: editDefaultValues,
      });
      setSaveStatus("success");
      setTimeout(() => setSaveStatus("idle"), 3000);
    } catch (error) {
      setSaveStatus("error");
      setTimeout(() => setSaveStatus("idle"), 3000);
    }
  };

  const variables = Array.from(
    new Set(
      Array.from(editContent.matchAll(/\{\{([^}]+)\}\}/g)).map((m) => m[1]),
    ),
  );

  const handleFormat = () => {
    setFormatError(null);
    const formatJson = (text: string) => {
      // Temporarily replace unquoted {{var}} to make it valid JSON
      let tempText = text.replace(
        /([:\[,]\s*)\{\{([^}]+)\}\}/g,
        '$1"___VAR_$2___"',
      );
      const parsed = JSON.parse(tempText);
      let formatted = JSON.stringify(parsed, null, 2);
      // Replace back
      formatted = formatted.replace(/"___VAR_([^"]+)___"/g, "{{$1}}");
      return formatted;
    };

    const formatXml = (text: string) => {
      const PADDING = "  ";
      const reg = /(>)(<)(\/*)/g;
      let pad = 0;
      let formatted = "";
      let cleanXml = text.replace(/>\s+</g, "><").replace(reg, "$1\r\n$2$3");
      cleanXml.split("\r\n").forEach((node) => {
        let indent = 0;
        if (node.match(/.+<\/\w[^>]*>$/)) {
          indent = 0;
        } else if (node.match(/^<\/\w/)) {
          if (pad !== 0) {
            pad -= 1;
          }
        } else if (node.match(/^<\w[^>]*[^\/]>.*$/)) {
          indent = 1;
        } else {
          indent = 0;
        }
        formatted += PADDING.repeat(pad) + node + "\n";
        pad += indent;
      });
      return formatted.trim();
    };

    const showError = (msg: string) => {
      setFormatError(msg);
      setTimeout(() => setFormatError(null), 3000);
    };

    if (editType === "application/json") {
      try {
        setEditContent(formatJson(editContent));
      } catch (e) {
        showError("Invalid JSON format. Please check for syntax errors.");
      }
    } else if (editType === "application/xml") {
      try {
        setEditContent(formatXml(editContent));
      } catch (e) {
        showError("Failed to format XML.");
      }
    } else if (editType === "text/plain") {
      const trimmed = editContent.trim();
      if (!trimmed) return;

      if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
        try {
          setEditContent(formatJson(editContent));
          return;
        } catch (e) {
          // Fall through
        }
      }

      if (trimmed.startsWith("<") && trimmed.endsWith(">")) {
        try {
          setEditContent(formatXml(editContent));
          return;
        } catch (e) {
          // Fall through
        }
      }

      showError(
        "Could not automatically detect JSON or XML format in raw text.",
      );
    }
  };

  const handleDelete = async (id: string) => {
    await bodiesApi.remove(id);
    if (selectedId === id) setSelectedId(null);
  };

  const filteredTemplates = bodies.filter((t) =>
    t.name.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  return (
    <div className="flex h-full bg-white relative">
      <ConfirmModal
        isOpen={!!deleteConfirm}
        title="Delete Body Template"
        message="Are you sure you want to delete this body template? This action cannot be undone."
        onConfirm={() => {
          if (deleteConfirm) {
            handleDelete(deleteConfirm);
          }
          setDeleteConfirm(null);
        }}
        onClose={() => setDeleteConfirm(null)}
      />
      {/* Sidebar List */}
      <div className="w-80 border-r border-gray-200 flex flex-col bg-gray-50">
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold text-gray-900 flex items-center gap-2">
              Body Templates
              <HelpTooltip content="Create reusable request body templates with variables for your API calls." />
            </h2>
            <button
              onClick={handleCreate}
              className="p-1.5 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
            >
              <Plus size={16} />
            </button>
          </div>
          <div className="relative">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
              size={14}
            />
            <input
              type="text"
              placeholder="Search templates..."
              className="w-full pl-9 pr-3 py-2 bg-white border border-gray-200 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {filteredTemplates.map((template) => (
            <div
              key={template.id}
              onClick={() => setSelectedId(template.id)}
              className={`group flex items-center justify-between p-3 rounded-md cursor-pointer text-sm transition-all ${
                selectedId === template.id
                  ? "bg-white shadow-sm border border-blue-100 ring-1 ring-blue-500/20"
                  : "hover:bg-gray-100 border border-transparent"
              }`}
            >
              <div className="flex items-center gap-3 overflow-hidden">
                <div
                  className={`w-8 h-8 rounded-md flex items-center justify-center shrink-0 ${
                    selectedId === template.id
                      ? "bg-blue-50 text-blue-600"
                      : "bg-gray-200 text-gray-500"
                  }`}
                >
                  <FileCode size={16} />
                </div>
                <div className="min-w-0">
                  <div
                    className={`font-medium truncate ${selectedId === template.id ? "text-blue-900" : "text-gray-700"}`}
                  >
                    {template.name}
                  </div>
                  <div className="text-xs text-gray-400 truncate">
                    {template.contentType}
                  </div>
                </div>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setDeleteConfirm(template.id);
                }}
                className="opacity-0 group-hover:opacity-100 p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-all"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Main Editor Area */}
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        {selectedId ? (
          <>
            <div className="h-16 border-b border-gray-200 px-8 flex items-center justify-between shrink-0 bg-white">
              <div>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="text-lg font-bold text-gray-900 bg-transparent border-none focus:ring-0 p-0 placeholder-gray-300 w-full"
                  placeholder="Template Name"
                />
                <input
                  type="text"
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                  className="text-sm text-gray-500 bg-transparent border-none focus:ring-0 p-0 placeholder-gray-300 w-full mt-1"
                  placeholder="Add a description..."
                />
              </div>
              <div className="flex items-center gap-4">
                {saveStatus === "saving" && (
                  <span className="text-xs text-gray-500 animate-pulse">
                    Saving...
                  </span>
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
                <select
                  value={editType}
                  onChange={(e) =>
                    setEditType(e.target.value as BodyTemplate["contentType"])
                  }
                  className="text-sm border-gray-300 rounded-md shadow-sm focus:border-blue-500 focus:ring-blue-500"
                >
                  <option value="application/json">JSON</option>
                  <option value="application/xml">XML</option>
                  <option value="text/plain">Raw</option>
                </select>
                <button
                  onClick={handleFormat}
                  className="flex items-center gap-2 px-3 py-2 bg-gray-100 text-gray-700 rounded-md text-sm font-medium hover:bg-gray-200 transition-colors shadow-sm border border-gray-200"
                  title="Format Content"
                >
                  <AlignLeft size={16} />
                  <span>Format</span>
                </button>
                <button
                  onClick={handleSave}
                  disabled={saveStatus === "saving"}
                  className={`flex items-center gap-2 px-4 py-2 text-white text-sm font-medium rounded-md transition-colors shadow-sm ${
                    saveStatus === "saving"
                      ? "bg-blue-400 cursor-not-allowed"
                      : "bg-blue-600 hover:bg-blue-700"
                  }`}
                >
                  <Save size={16} />
                  <span>Save</span>
                </button>
              </div>
            </div>

            <div className="flex-1 flex overflow-hidden">
              {/* Left: Template Editor */}
              <div className="flex-1 flex flex-col border-r border-gray-200 bg-gray-50">
                <div className="px-4 py-2 border-b border-gray-200 bg-gray-100 flex justify-between items-center">
                  <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Template Definition
                  </span>
                  <span className="text-xs text-gray-400">
                    Use {"{{variable}}"} for dynamic values
                  </span>
                </div>
                <textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  className="flex-1 w-full p-4 font-mono text-sm bg-white resize-none focus:outline-none focus:ring-0 text-slate-800"
                  placeholder={`{\n  "key": "{{variable}}"\n}`}
                  spellCheck={false}
                />
              </div>

              {/* Right: Default Values */}
              <div className="w-80 flex flex-col bg-white">
                <div className="px-4 py-2 border-b border-gray-200 bg-gray-50 flex justify-between items-center">
                  <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Default Values
                  </span>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                  {variables.length === 0 ? (
                    <div className="text-sm text-gray-400 text-center py-4">
                      No variables found in template. Use {"{{variable}}"} to
                      add them.
                    </div>
                  ) : (
                    variables.map((variable) => (
                      <div key={variable} className="space-y-1">
                        <label className="block text-xs font-medium text-gray-700">
                          {variable}
                        </label>
                        <input
                          type="text"
                          value={editDefaultValues[variable] || ""}
                          onChange={(e) =>
                            setEditDefaultValues({
                              ...editDefaultValues,
                              [variable]: e.target.value,
                            })
                          }
                          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none"
                          placeholder={`Default for ${variable}`}
                        />
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-400">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
              <FileCode size={32} className="text-gray-300" />
            </div>
            <p className="text-lg font-medium text-gray-900">
              Select a template
            </p>
            <p className="text-sm mt-1">
              Select a body template from the sidebar or create a new one.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
