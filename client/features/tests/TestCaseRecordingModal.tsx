import { Filter, Globe, Play, Video, X, Plus, Trash2 } from "lucide-react";
import { ExecutionTargetSelector } from "@/shared/ui/ExecutionTargetSelector";
import type { RecordingMode, RecordingTargetStatus } from "./useTestCaseRecording";
import type { ApiFilterConfig, ApiFilterField, ApiFilterOperator } from "../../../shared/recording/protocol";

interface TestCaseRecordingModalProps {
  apiFilter: string;
  apiFilterConfig?: ApiFilterConfig;
  isOpen: boolean;
  onClose: () => void;
  onStartRecording: () => void;
  recordingMode: RecordingMode;
  recordingTargetId: string | null;
  recordingTargetStatus: RecordingTargetStatus;
  recordingUrl: string;
  setApiFilter: (value: string) => void;
  setApiFilterConfig: (value: ApiFilterConfig | undefined) => void;
  setRecordingMode: (value: RecordingMode) => void;
  setRecordingTargetId: (value: string | null) => void;
  setRecordingTargetStatus: (value: RecordingTargetStatus) => void;
  setRecordingUrl: (value: string) => void;
}

const fieldOptions: { value: ApiFilterField; label: string }[] = [
  { value: 'url', label: 'URL' },
  { value: 'method', label: 'Method' },
  { value: 'status', label: 'Status' },
];

const operatorOptions: Record<ApiFilterField, { value: ApiFilterOperator; label: string }[]> = {
  url: [
    { value: 'contains', label: 'contains' },
    { value: 'startsWith', label: 'starts with' },
    { value: 'endsWith', label: 'ends with' },
    { value: 'equals', label: 'equals' },
    { value: 'regex', label: 'matches regex' },
  ],
  method: [
    { value: 'equals', label: 'equals' },
    { value: 'notEquals', label: 'not equals' },
  ],
  status: [
    { value: 'equals', label: 'equals' },
    { value: 'notEquals', label: 'not equals' },
    { value: 'startsWith', label: 'starts with' },
  ],
};

function defaultRule() {
  return { field: 'url' as ApiFilterField, operator: 'contains' as ApiFilterOperator, value: '' };
}

export function TestCaseRecordingModal({
  apiFilter,
  apiFilterConfig,
  isOpen,
  onClose,
  onStartRecording,
  recordingMode,
  recordingTargetId,
  recordingTargetStatus,
  recordingUrl,
  setApiFilter,
  setApiFilterConfig,
  setRecordingMode,
  setRecordingTargetId,
  setRecordingTargetStatus,
  setRecordingUrl,
}: TestCaseRecordingModalProps) {
  if (!isOpen) return null;

  const isAdvanced = !!apiFilterConfig;
  const config = apiFilterConfig || { mode: 'include' as const, conditions: 'all' as const, rules: [] };

  const updateConfig = (patch: Partial<ApiFilterConfig>) => {
    if (!apiFilterConfig) return;
    setApiFilterConfig({ ...apiFilterConfig, ...patch });
  };

  const updateRule = (index: number, patch: Partial<typeof config.rules[number]>) => {
    const rules = config.rules.map((r, i) => (i === index ? { ...r, ...patch } : r));
    updateConfig({ rules });
  };

  const addRule = () => {
    updateConfig({ rules: [...config.rules, defaultRule()] });
  };

  const removeRule = (index: number) => {
    const rules = config.rules.filter((_, i) => i !== index);
    if (rules.length === 0) {
      setApiFilterConfig(undefined);
    } else {
      updateConfig({ rules });
    }
  };

  const switchToAdvanced = () => {
    const rules = apiFilter.trim()
      ? [{ field: 'url' as const, operator: 'contains' as const, value: apiFilter.trim() }]
      : [];
    setApiFilterConfig({ mode: 'include', conditions: 'all', rules });
  };

  const switchToSimple = () => {
    setApiFilterConfig(undefined);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="flex max-w-full flex-col overflow-hidden rounded-xl bg-white shadow-xl w-[520px] scale-100">
        <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50/50 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 text-blue-600">
              <Video size={16} className="fill-current" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-gray-900">
                Start Recording Action Steps
              </h3>
              <p className="mt-0.5 text-xs text-gray-500">
                Enter the starting URL to begin tracking UI & API intents.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 transition-colors hover:text-gray-600"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-6">
          <div>
            <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-gray-500">
              Target App URL
            </label>
            <div className="relative">
              <Globe
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
              />
              <input
                type="url"
                className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm text-gray-900 outline-none transition-all placeholder-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                placeholder={`${window.location.origin}/aut/login`}
                value={recordingUrl}
                onChange={(event) => setRecordingUrl(event.target.value)}
                autoFocus
              />
            </div>
          </div>

          <div>
            <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-gray-500">
              Recording Mode
            </label>
            <select
              value={recordingMode}
              onChange={(event) => setRecordingMode(event.target.value as RecordingMode)}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 outline-none transition-all focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
            >
              <option value="ui">UI Steps Only</option>
              <option value="api">API Requests Only</option>
              <option value="all">All Events</option>
            </select>
            <p className="mt-1.5 text-[11px] text-gray-400">
              No in-page toolbar. Recording is controlled from this dialog.
            </p>
          </div>

          <div>
            <ExecutionTargetSelector
              selectedAgentId={recordingTargetId}
              onSelect={setRecordingTargetId}
              onSelectedStatusChange={setRecordingTargetStatus}
              mode="recording"
            />
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500">
                API Record Filter <span className="font-normal normal-case text-gray-400">(optional)</span>
              </label>
              <button
                type="button"
                onClick={isAdvanced ? switchToSimple : switchToAdvanced}
                className="text-[11px] text-blue-600 hover:text-blue-700 font-medium"
              >
                {isAdvanced ? '← Simple Mode' : 'Advanced ▾'}
              </button>
            </div>

            {isAdvanced ? (
              <div className="space-y-3 rounded-lg border border-gray-200 bg-gray-50/50 p-3">
                <div className="flex items-center gap-2">
                  <select
                    value={config.mode}
                    onChange={(e) => updateConfig({ mode: e.target.value as 'include' | 'exclude' })}
                    className="rounded-md border border-gray-300 bg-white px-2 py-1.5 text-xs text-gray-700 outline-none focus:border-blue-500"
                  >
                    <option value="include">Include</option>
                    <option value="exclude">Exclude</option>
                  </select>
                  <span className="text-xs text-gray-500">where</span>
                  <select
                    value={config.conditions}
                    onChange={(e) => updateConfig({ conditions: e.target.value as 'all' | 'any' })}
                    className="rounded-md border border-gray-300 bg-white px-2 py-1.5 text-xs text-gray-700 outline-none focus:border-blue-500"
                  >
                    <option value="all">all</option>
                    <option value="any">any</option>
                  </select>
                  <span className="text-xs text-gray-500">conditions met</span>
                </div>

                {config.rules.map((rule, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <select
                      value={rule.field}
                      onChange={(e) => {
                        const field = e.target.value as ApiFilterField;
                        const ops = operatorOptions[field];
                        updateRule(index, {
                          field,
                          operator: ops.some(o => o.value === rule.operator) ? rule.operator : ops[0].value,
                        });
                      }}
                      className="w-24 rounded-md border border-gray-300 bg-white px-2 py-1.5 text-xs text-gray-700 outline-none focus:border-blue-500"
                    >
                      {fieldOptions.map(o => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>

                    <select
                      value={rule.operator}
                      onChange={(e) => updateRule(index, { operator: e.target.value as ApiFilterOperator })}
                      className="w-28 rounded-md border border-gray-300 bg-white px-2 py-1.5 text-xs text-gray-700 outline-none focus:border-blue-500"
                    >
                      {operatorOptions[rule.field].map(o => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>

                    {rule.field === 'method' ? (
                      <select
                        value={rule.value}
                        onChange={(e) => updateRule(index, { value: e.target.value })}
                        className="flex-1 rounded-md border border-gray-300 bg-white px-2 py-1.5 text-xs text-gray-700 outline-none focus:border-blue-500"
                      >
                        <option value="">Select method...</option>
                        <option value="GET">GET</option>
                        <option value="POST">POST</option>
                        <option value="PUT">PUT</option>
                        <option value="PATCH">PATCH</option>
                        <option value="DELETE">DELETE</option>
                      </select>
                    ) : (
                      <input
                        type="text"
                        value={rule.value}
                        onChange={(e) => updateRule(index, { value: e.target.value })}
                        placeholder={rule.field === 'url' ? 'e.g. api.example.com' : rule.field === 'status' ? 'e.g. 200' : ''}
                        className="flex-1 rounded-md border border-gray-300 bg-white px-2 py-1.5 text-xs text-gray-700 outline-none placeholder-gray-400 focus:border-blue-500"
                      />
                    )}

                    <button
                      type="button"
                      onClick={() => removeRule(index)}
                      className="shrink-0 rounded-md p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}

                <button
                  type="button"
                  onClick={addRule}
                  className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-700 font-medium"
                >
                  <Plus size={12} /> Add Rule
                </button>
              </div>
            ) : (
              <>
                <div className="relative">
                  <Filter
                    size={14}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                  />
                  <input
                    type="text"
                    className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm text-gray-900 outline-none transition-all placeholder-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                    placeholder="e.g. api.mydomain.com"
                    value={apiFilter}
                    onChange={(event) => setApiFilter(event.target.value)}
                  />
                </div>
                <p className="mt-1.5 flex items-start gap-1 text-[11px] text-gray-400">
                  Only record requests whose URL contains this text.
                </p>
              </>
            )}
          </div>
        </div>

        <div className="flex shrink-0 justify-end gap-3 border-t border-gray-100 bg-gray-50 px-6 py-4">
          <button
            onClick={onClose}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={onStartRecording}
            disabled={recordingTargetStatus !== "idle"}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Play size={14} className="fill-current" /> Start Recording
          </button>
        </div>
      </div>
    </div>
  );
}