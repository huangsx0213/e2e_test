import React, { useEffect, useState, useRef, useCallback } from "react";
import { CrudActions } from "@/shared/hooks/useCrud";
import {
  TestSuite,
  ExecutionLog,
  Project,
  HeaderProfile,
  BodyTemplate,
  ApiEndpoint,
  TestScenario,
  ExecutionReport,
} from "@/shared/types";
import {
  CheckCircle2,
  XCircle,
  Loader2,
  PlayCircle,
  Terminal,
  X,
  Globe,
  StopCircle,
} from "lucide-react";
import { executionApi } from "@/shared/services/api";
import { ExecutionLogs } from "@/shared/execution/ExecutionLogs";
import { ExecutionTargetSelector } from "@/shared/ui/ExecutionTargetSelector";

interface ScenarioExecutionRunnerProps {
  scenario: TestScenario;
  suites: TestSuite[];
  project?: Project;
  headers: HeaderProfile[];
  bodies: BodyTemplate[];
  endpoints: ApiEndpoint[];
  environments: string[];
  initialEnvironment: string;
  onClose: () => void;
  reportsApi: CrudActions<ExecutionReport>;
}

export const ScenarioExecutionRunner: React.FC<
  ScenarioExecutionRunnerProps
> = ({
  scenario,
  suites,
  project,
  headers,
  bodies,
  endpoints,
  environments,
  initialEnvironment,
  onClose,
  reportsApi,
}) => {
  const [logs, setLogs] = useState<ExecutionLog[]>([]);
  const [status, setStatus] = useState<
    "IDLE" | "RUNNING" | "COMPLETED" | "FAILED"
  >("IDLE");
  const [progress, setProgress] = useState(0);
  const [selectedEnv, setSelectedEnv] = useState<string>(initialEnvironment);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [reportId, setReportId] = useState<string | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const startTimeRef = useRef<number>(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  // Cleanup SSE and timer on unmount
  useEffect(() => {
    return () => {
      eventSourceRef.current?.close();
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const startTimer = useCallback(() => {
    startTimeRef.current = Date.now();
    timerRef.current = setInterval(() => {
      setElapsedMs(Date.now() - startTimeRef.current);
    }, 100);
  }, []);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const formatElapsed = (ms: number) => {
    const totalSec = Math.floor(ms / 1000);
    const min = Math.floor(totalSec / 60)
      .toString()
      .padStart(2, "0");
    const sec = (totalSec % 60).toString().padStart(2, "0");
    const tenths = Math.floor((ms % 1000) / 100);
    return `${min}:${sec}.${tenths}`;
  };

  const connectSSE = useCallback(
    (rId: string) => {
      const es = executionApi.stream(rId);
      eventSourceRef.current = es;

      es.addEventListener("log", (event) => {
        const data = JSON.parse(event.data);
        setLogs((prev) => [
          ...prev,
          {
            stepId: data.stepId,
            timestamp: data.timestamp,
            status: data.status,
            level: data.level,
            message: data.message,
            screenshot: data.screenshot,
            metadata: data.metadata,
          },
        ]);
      });

      es.addEventListener("progress", (event) => {
        const data = JSON.parse(event.data);
        setProgress(data.percent);
      });

      es.addEventListener("done", (event) => {
        const data = JSON.parse(event.data);
        setStatus(data.status === "COMPLETED" ? "COMPLETED" : "FAILED");
        setProgress(100);
        stopTimer();
        es.close();
        eventSourceRef.current = null;
      });

      es.onerror = () => {
        setStatus("FAILED");
        stopTimer();
        es.close();
        eventSourceRef.current = null;
      };
    },
    [stopTimer],
  );

  const startExecution = async () => {
    setStatus("RUNNING");
    setLogs([]);
    setProgress(0);
    startTimer();

    try {
      const response = await executionApi.execute({
        type: "scenario",
        projectId: project?.id || "",
        environment: selectedEnv,
        scenarioId: scenario.id,
        agentId: selectedAgentId || undefined,
      });

      setReportId(response.reportId);
      connectSSE(response.reportId);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      setLogs([
        {
          stepId: "error",
          timestamp: Date.now(),
          status: "FAIL",
          message: `❌ Failed to start execution: ${msg}`,
        },
      ]);
      setStatus("FAILED");
      stopTimer();
    }
  };

  const handleAbort = async () => {
    if (!reportId) return;
    try {
      await executionApi.abort(reportId);
    } catch {
      // Best effort
    }
  };

  return (
    <div className="flex flex-col h-full w-full bg-slate-900 overflow-hidden">
      {/* Header */}
      <div className="h-16 px-6 bg-slate-900 border-b border-slate-800 flex justify-between items-center text-white shrink-0">
        <div className="flex items-center gap-4">
          <div
            className={`p-2 rounded-full ${status === "RUNNING" ? "bg-blue-500/20 text-blue-400" : status === "COMPLETED" ? "bg-emerald-500/20 text-emerald-400" : status === "IDLE" ? "bg-gray-500/20 text-gray-400" : "bg-red-500/20 text-red-400"}`}
          >
            {status === "RUNNING" && (
              <Loader2 className="animate-spin" size={20} />
            )}
            {status === "COMPLETED" && <CheckCircle2 size={20} />}
            {status === "FAILED" && <XCircle size={20} />}
            {status === "IDLE" && <PlayCircle size={20} />}
          </div>
          <div>
            <h3 className="font-semibold text-lg tracking-tight">
              {scenario.name}
            </h3>
            <p className="text-xs text-slate-400 font-medium">
              Scenario Execution
            </p>
          </div>
        </div>
        <div className="flex items-center gap-6">
          {status !== "RUNNING" && (
            <div className="flex items-center gap-2 mr-4">
              <span className="text-xs text-slate-400 font-medium uppercase tracking-wider">
                Target Env:
              </span>
              <div className="relative">
                <Globe
                  size={14}
                  className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <select
                  className="bg-slate-800 border border-slate-700 text-slate-200 text-xs rounded pl-7 pr-2 py-1.5 focus:ring-1 focus:ring-blue-500 outline-none cursor-pointer"
                  value={selectedEnv}
                  onChange={(e) => setSelectedEnv(e.target.value)}
                >
                  {environments.map((env) => (
                    <option key={env} value={env}>
                      {env}
                    </option>
                  ))}
                </select>
              </div>

              <ExecutionTargetSelector 
                selectedAgentId={selectedAgentId}
                onSelect={setSelectedAgentId}
              />

              <button
                onClick={startExecution}
                className="ml-2 px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded shadow-lg shadow-blue-500/20 transition-all flex items-center gap-1.5"
              >
                <PlayCircle size={14} />
                {status === "IDLE" ? "Start Run" : "Re-run"}
              </button>
            </div>
          )}

          {status === "RUNNING" && (
            <button
              onClick={handleAbort}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600/20 hover:bg-red-600/40 text-red-400 text-xs font-bold rounded border border-red-600/30 transition-all"
            >
              <StopCircle size={14} />
              Abort
            </button>
          )}

          <div className="flex flex-col items-end">
            <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">
              Time Elapsed
            </span>
            <span className="font-mono text-sm text-slate-300 font-medium">
              {formatElapsed(elapsedMs)}
            </span>
          </div>
          <div className="h-6 w-px bg-slate-800 mx-2"></div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors"
          >
            <X size={20} />
          </button>
        </div>
      </div>

      {/* Progress Line */}
      <div className="h-0.5 bg-slate-800 w-full">
        <div
          className={`h-full transition-all duration-300 ${status === "FAILED" ? "bg-red-500" : "bg-blue-500"} shadow-[0_0_10px_rgba(99,102,241,0.5)]`}
          style={{ width: `${progress}%` }}
        ></div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Terminal Log */}
        <div className="flex-1 bg-slate-950 p-6 overflow-y-auto font-mono text-sm space-y-3 flex flex-col">
          <div className="text-slate-500 text-xs font-bold uppercase tracking-widest mb-4 flex items-center gap-2">
            <Terminal size={12} /> Console Output
          </div>
          <ExecutionLogs logs={logs} />
          <div ref={logsEndRef} />
        </div>
      </div>
    </div>
  );
};
