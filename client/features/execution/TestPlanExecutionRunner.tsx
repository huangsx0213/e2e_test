import React from "react";
import {
  CheckCircle2, XCircle, Loader2, PlayCircle, Terminal,
  X, Globe, StopCircle,
} from "lucide-react";
import { ExecutionLogs } from "@/shared/execution/ExecutionLogs";
import { ExecutionTargetSelector } from "@/shared/ui/ExecutionTargetSelector";
import { useExecutionRun } from "@/shared/hooks/useExecutionRun";
import type { TestPlan, TestSuite, Project } from "@/shared/types";

interface TestPlanExecutionRunnerProps {
  plan: TestPlan;
  suites: TestSuite[];
  project?: Project;
  environments: string[];
  initialEnvironment: string;
  onClose: () => void;
}

export const TestPlanExecutionRunner: React.FC<TestPlanExecutionRunnerProps> = ({
  plan,
  project,
  environments,
  initialEnvironment,
  onClose,
}) => {
  const {
    logs, status, progress, selectedEnv, selectedAgentId,
    elapsedMs, logsEndRef, setSelectedEnv, setSelectedAgentId,
    startExecution, handleAbort, formatElapsed, isRunning, isQueued, canRun,
  } = useExecutionRun({
    request: {
      type: "plan",
      projectId: project?.id || "",
      planId: plan.id,
    },
    initialEnvironment,
  });

  return (
    <div className="flex flex-col h-full bg-slate-900 text-slate-300 font-mono text-sm">
      <div className="flex items-center justify-between px-6 py-4 bg-slate-950 border-b border-slate-800 shrink-0">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Terminal size={18} className="text-indigo-400" />
            <h2 className="font-semibold text-slate-100">Plan: {plan.name}</h2>
          </div>
          <div className="h-4 w-px bg-slate-800" />
          <div className="flex items-center gap-2 text-slate-400">
            <Globe size={14} />
            <select
              value={selectedEnv}
              onChange={(e) => setSelectedEnv(e.target.value)}
              disabled={isRunning}
              className="bg-transparent border-none focus:ring-0 text-sm cursor-pointer hover:text-slate-200 disabled:opacity-50"
            >
              {environments.map((env) => <option key={env} value={env} className="bg-slate-900">{env}</option>)}
            </select>
          </div>
          <div className="h-4 w-px bg-slate-800" />
          <ExecutionTargetSelector selectedAgentId={selectedAgentId} onSelect={setSelectedAgentId} />
        </div>
        <div className="flex items-center gap-4">
          {isRunning && (
            <div className="flex items-center gap-3 text-emerald-400 bg-emerald-400/10 px-3 py-1.5 rounded-full">
              <Loader2 size={14} className="animate-spin" />
              <span className="text-xs font-medium">Running</span>
              <span className="text-xs font-mono ml-2">{formatElapsed(elapsedMs)}</span>
            </div>
          )}
          {status === "COMPLETED" && (
            <div className="flex items-center gap-2 text-emerald-400 bg-emerald-400/10 px-3 py-1.5 rounded-full">
              <CheckCircle2 size={14} />
              <span className="text-xs font-medium">Completed</span>
              <span className="text-xs font-mono ml-2">{formatElapsed(elapsedMs)}</span>
            </div>
          )}
          {status === "FAILED" && (
            <div className="flex items-center gap-2 text-red-400 bg-red-400/10 px-3 py-1.5 rounded-full">
              <XCircle size={14} />
              <span className="text-xs font-medium">Failed</span>
              <span className="text-xs font-mono ml-2">{formatElapsed(elapsedMs)}</span>
            </div>
          )}
          <div className="h-4 w-px bg-slate-800" />
          {(isRunning || isQueued) ? (
            <button onClick={handleAbort} className="flex items-center gap-2 px-4 py-1.5 bg-red-500/10 text-red-400 hover:bg-red-500/20 rounded-md transition-colors">
              <StopCircle size={16} /> Abort
            </button>
          ) : (
            <button onClick={startExecution} className="flex items-center gap-2 px-4 py-1.5 bg-indigo-600 text-white hover:bg-indigo-700 rounded-md transition-colors">
              <PlayCircle size={16} />
              {status === "IDLE" ? "Run Plan" : "Re-run"}
            </button>
          )}
          <button onClick={onClose} className="p-1.5 text-slate-500 hover:text-slate-300 hover:bg-slate-800 rounded-md transition-colors ml-2"><X size={18} /></button>
        </div>
      </div>
      {(isRunning || progress > 0) && (
        <div className="h-1 w-full bg-slate-800 shrink-0">
          <div className={`h-full transition-all duration-300 ${status === "FAILED" ? "bg-red-500" : "bg-indigo-500"}`} style={{ width: `${progress}%` }} />
        </div>
      )}
      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 bg-slate-950 p-6 overflow-y-auto font-mono text-sm space-y-3 flex flex-col">
          <div className="text-slate-500 text-xs font-bold uppercase tracking-widest mb-4 flex items-center gap-2"><Terminal size={12} /> Console Output</div>
          <ExecutionLogs logs={logs} />
          {logs.length === 0 && (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-500 text-sm gap-2 py-16">
              <Terminal size={32} className="text-slate-700" />
              <span className="font-medium">Waiting for execution…</span>
            </div>
          )}
          <div ref={logsEndRef} />
        </div>
      </div>
    </div>
  );
}