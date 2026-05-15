import React from "react";
import {
  CheckCircle2, XCircle, Loader2, PlayCircle, Terminal,
  X, Globe, StopCircle, Zap, ChevronDown,
} from "lucide-react";
import { ExecutionLogs } from "@/shared/execution/ExecutionLogs";
import { ExecutionTargetSelector } from "@/shared/ui/ExecutionTargetSelector";
import { useExecutionRun } from "@/shared/hooks/useExecutionRun";
import type { TestScenario, Project } from "@/shared/types";

interface ScenarioExecutionRunnerProps {
  scenario: TestScenario;
  project?: Project;
  environments: string[];
  initialEnvironment: string;
  onClose: () => void;
}

export const ScenarioExecutionRunner: React.FC<ScenarioExecutionRunnerProps> = ({
  scenario,
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
      type: "scenario",
      projectId: project?.id || "",
      scenarioId: scenario.id,
    },
    initialEnvironment,
  });

  return (
    <div className="flex flex-col h-full w-full bg-slate-900 overflow-hidden">
      <div className="h-16 px-6 bg-slate-900 border-b border-slate-800 flex justify-between items-center text-white shrink-0">
        <div className="flex items-center gap-4">
          <div
            className={`p-2 rounded-full ${isRunning ? "bg-blue-500/20 text-blue-400" : isQueued ? "bg-amber-500/20 text-amber-400" : status === "COMPLETED" ? "bg-emerald-500/20 text-emerald-400" : status === "IDLE" ? "bg-gray-500/20 text-gray-400" : "bg-red-500/20 text-red-400"}`}
          >
            {isQueued && <Loader2 className="animate-spin" size={20} />}
            {isRunning && <Loader2 className="animate-spin" size={20} />}
            {status === "COMPLETED" && <CheckCircle2 size={20} />}
            {status === "FAILED" && <XCircle size={20} />}
            {status === "IDLE" && <PlayCircle size={20} />}
          </div>
          <div>
            <h3 className="font-semibold text-lg tracking-tight">{scenario.name}</h3>
            <p className="text-xs text-slate-400 font-medium">Scenario Execution</p>
          </div>
        </div>
        <div className="flex items-center gap-6">
          {canRun && (
            <div className="flex items-end gap-5 mr-4">
              <div className="flex flex-col gap-1.5">
                <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider flex items-center gap-1.5 ml-1"><Globe size={12} className="text-blue-400" /> Target Env</span>
                <div className="relative">
                  <select className="bg-slate-800 border border-slate-700 text-slate-200 text-xs rounded px-3 py-1.5 focus:ring-1 focus:ring-blue-500 outline-none cursor-pointer w-32 appearance-none" value={selectedEnv} onChange={(e) => setSelectedEnv(e.target.value)}>
                    {environments.map((env) => <option key={env} value={env}>{env}</option>)}
                  </select>
                  <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider flex items-center gap-1.5 ml-1"><Zap size={12} className="text-amber-500" /> Run Target</span>
                <ExecutionTargetSelector selectedAgentId={selectedAgentId} onSelect={setSelectedAgentId} />
              </div>
              <button onClick={startExecution} className="h-[34px] px-6 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded shadow-lg shadow-blue-500/20 transition-all flex items-center gap-2 whitespace-nowrap mb-[1px]">
                <PlayCircle size={14} />
                {status === "IDLE" ? "Start Run" : "Re-run"}
              </button>
            </div>
          )}
          {(isRunning || isQueued) && (
            <button onClick={handleAbort} className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600/20 hover:bg-red-600/40 text-red-400 text-xs font-bold rounded border border-red-600/30 transition-all">
              <StopCircle size={14} /> Abort
            </button>
          )}
          <div className="flex flex-col items-end">
            <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Time Elapsed</span>
            <span className="font-mono text-sm text-slate-300 font-medium">{formatElapsed(elapsedMs)}</span>
          </div>
          <div className="h-6 w-px bg-slate-800 mx-2"></div>
          <button onClick={onClose} className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors"><X size={20} /></button>
        </div>
      </div>
      <div className="h-0.5 bg-slate-800 w-full">
        <div className={`h-full transition-all duration-300 ${status === "FAILED" ? "bg-red-500" : "bg-blue-500"} shadow-[0_0_10px_rgba(99,102,241,0.5)]`} style={{ width: `${progress}%` }}></div>
      </div>
      <div className="flex-1 overflow-hidden">
        <div className="h-full bg-slate-950 p-6 overflow-y-auto font-mono text-sm space-y-3 flex flex-col">
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