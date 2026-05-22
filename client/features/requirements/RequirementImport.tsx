import React, { useState } from "react";
import { X, Upload, FileText, FileSpreadsheet } from "lucide-react";

interface Props {
  projectId: string;
  onClose: () => void;
  onImported: () => void;
}

export function RequirementImport({ projectId, onClose, onImported }: Props) {
  const [content, setContent] = useState("");
  const [format, setFormat] = useState<"markdown" | "csv">("markdown");
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[] | null>(null);
  const [importResult, setImportResult] = useState<{ imported: number } | null>(null);

  const handleImport = async (force = false) => {
    if (!content.trim()) return;
    setImporting(true);
    setError(null);
    setWarnings(null);
    try {
      const res = await fetch(`/api/requirements/${projectId}/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, format }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Import failed");
      }
      const data = await res.json();
      if (!force && data.warnings && data.warnings.length > 0) {
        setWarnings(data.warnings);
        setImportResult({ imported: data.imported });
        return;
      }
      onImported();
      onClose();
    } catch (e: any) {
      setError(e.message || "Import failed");
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px] transition-opacity"
        onClick={onClose}
      />

      <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center shrink-0">
              <Upload size={20} className="text-blue-600" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">
                Import Requirements
              </h2>
              <p className="text-sm text-slate-500">
                Import requirements from a structured file.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 transition-colors p-1"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-5">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Source Format
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setFormat("markdown")}
                className={`flex items-center gap-2 px-4 py-3 rounded-lg border text-sm font-medium transition-all ${
                  format === "markdown"
                    ? "border-blue-500 bg-blue-50 text-blue-700 shadow-sm"
                    : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                }`}
              >
                <FileText size={16} />
                Markdown
              </button>
              <button
                onClick={() => setFormat("csv")}
                className={`flex items-center gap-2 px-4 py-3 rounded-lg border text-sm font-medium transition-all ${
                  format === "csv"
                    ? "border-blue-500 bg-blue-50 text-blue-700 shadow-sm"
                    : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                }`}
              >
                <FileSpreadsheet size={16} />
                CSV
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">
              Content
            </label>
            <textarea
              value={content}
              onChange={(e) => {
                setContent(e.target.value);
                setError(null);
              }}
              className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 outline-none placeholder-slate-400 resize-none font-mono"
              rows={10}
              placeholder={
                format === "markdown"
                  ? "# Epic Title\n## Feature Title\n### Story Title\n#### Acceptance Criteria description"
                  : "title,description,parent_title,priority\nLogin Feature,User auth module,,HIGH\nLogin Page,The login UI page,Login Feature,MEDIUM"
              }
            />
            <p className="text-xs text-slate-400 mt-1.5">
              {format === "markdown"
                ? "Use heading levels (#, ##, ###, ####) for hierarchy."
                : "Columns: title, description, parent_title (optional), priority (optional)."}
            </p>
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {error}
            </div>
          )}

          {warnings && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <p className="text-sm font-semibold text-amber-800 mb-2">
                Import completed with {warnings.length} warning(s)
              </p>
              <ul className="space-y-1">
                {warnings.map((w, i) => (
                  <li key={i} className="text-xs text-amber-700 list-disc ml-4">{w}</li>
                ))}
              </ul>
              <p className="text-xs text-amber-600 mt-2">
                {importResult?.imported} requirement(s) were imported despite warnings.
              </p>
            </div>
          )}
        </div>

        <div className="px-6 py-4 bg-slate-50 flex items-center justify-end gap-3 border-t border-slate-100">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-all"
          >
            Cancel
          </button>
          {warnings ? (
            <button
              onClick={() => handleImport(true)}
              className="px-4 py-2 text-sm font-bold text-white bg-amber-600 rounded-lg shadow-sm hover:bg-amber-700 shadow-amber-200 transition-all hover:scale-[1.02] active:scale-[0.98] flex items-center gap-2"
            >
              <Upload size={16} />
              Import Anyway
            </button>
          ) : (
            <button
              onClick={() => handleImport(false)}
              disabled={!content.trim() || importing}
              className="px-4 py-2 text-sm font-bold text-white bg-blue-600 rounded-lg shadow-sm hover:bg-blue-700 shadow-blue-200 transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <Upload size={16} />
              {importing ? "Importing..." : "Import"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}