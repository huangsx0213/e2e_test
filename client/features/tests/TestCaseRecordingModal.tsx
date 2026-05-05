import { Filter, Globe, Play, Video, X } from "lucide-react";
import { ExecutionTargetSelector } from "@/shared/ui/ExecutionTargetSelector";
import type { RecordingMode, RecordingTargetStatus } from "./useTestCaseRecording";

interface TestCaseRecordingModalProps {
  apiFilter: string;
  isOpen: boolean;
  onClose: () => void;
  onStartRecording: () => void;
  recordingMode: RecordingMode;
  recordingTargetId: string | null;
  recordingTargetStatus: RecordingTargetStatus;
  recordingUrl: string;
  setApiFilter: (value: string) => void;
  setRecordingMode: (value: RecordingMode) => void;
  setRecordingTargetId: (value: string | null) => void;
  setRecordingTargetStatus: (value: RecordingTargetStatus) => void;
  setRecordingUrl: (value: string) => void;
}

export function TestCaseRecordingModal({
  apiFilter,
  isOpen,
  onClose,
  onStartRecording,
  recordingMode,
  recordingTargetId,
  recordingTargetStatus,
  recordingUrl,
  setApiFilter,
  setRecordingMode,
  setRecordingTargetId,
  setRecordingTargetStatus,
  setRecordingUrl,
}: TestCaseRecordingModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="flex max-w-full flex-col overflow-hidden rounded-xl bg-white shadow-xl w-[480px] scale-100">
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
            <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-gray-500">
              API Record Filter <span className="font-normal normal-case text-gray-400">(optional)</span>
            </label>
            <div className="relative">
              <Filter
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
              />
              <input
                type="text"
                className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-9 pr-3 text-sm text-gray-900 outline-none transition-all placeholder-gray-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
                placeholder="e.g. *api.mydomain.com*"
                value={apiFilter}
                onChange={(event) => setApiFilter(event.target.value)}
              />
            </div>
            <p className="mt-1.5 flex items-start gap-1 text-[11px] text-gray-400">
              💡 Use glob patterns to filter the recorded background network requests.
            </p>
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
