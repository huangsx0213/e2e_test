import React, { useEffect, useState, useRef, useCallback } from "react";
import { CrudActions } from "@/shared/hooks/useCrud";
import {
  TestSuite,
  ExecutionLog,
  Project,
  HeaderProfile,
  BodyTemplate,
  ApiEndpoint,
  TestPlan,
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

interface TestPlanExecutionRunnerProps {
  plan: TestPlan;
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

export const TestPlanExecutionRunner: React.FC<
  TestPlanExecutionRunnerProps
> = ({
  plan,
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
        // Connection dropped — mark as failed
        setStatus("FAILED");
        stopTimer();
        es.close();
        eventSourceRef.current = null;
      };
    },
    [stopTimer],
  );

  const handleRun = async () => {
    if (!project) return;
    setLogs([]);
    setStatus("RUNNING");
    setProgress(0);
    setElapsedMs(0);
    setReportId(null);

    try {
      const response = await executionApi.execute({
        type: "plan",
        projectId: project.id,
        planId: plan.id,
        environment: selectedEnv,
        agentId: selectedAgentId || undefined,
      });

      setReportId(response.reportId);
      startTimer();
      connectSSE(response.reportId);
    } catch (error: any) {
      console.error("Execution failed to start:", error);
      setStatus("FAILED");
      setLogs([
        {
          stepId: "system",
          timestamp: Date.now(),
          status: "FAILED",
          message: `Failed to start execution: ${error.message}`,
        },
      ]);
    }
  };

  const handleStop = async () => {
    if (reportId) {
      try {
        await executionApi.abort(reportId);
      } catch (e) {
        console.error("Failed to abort execution", e);
      }
    }
    setStatus("FAILED");
    stopTimer();
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
    setLogs((prev) => [
      ...prev,
      {
        stepId: "system",
        timestamp: Date.now(),
        status: "FAILED",
        message: "Execution aborted by user.",
      },
    ]);
  };

  return (
    <div className="flex flex-col h-full bg-slate-900 text-slate-300 font-mono text-sm">
      {/* Header */}
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
              disabled={status === "RUNNING"}
              className="bg-transparent border-none focus:ring-0 text-sm cursor-pointer hover:text-slate-200 disabled:opacity-50"
            >
              {environments.map((env) => (
                <option key={env} value={env} className="bg-slate-900">
                  {env}
                </option>
              ))}
            </select>
          </div>
          <div className="h-4 w-px bg-slate-800" />
          <ExecutionTargetSelector 
            selectedAgentId={selectedAgentId}
            onSelect={setSelectedAgentId}
          />
        </div>

        <div className="flex items-center gap-4">
          {status === "RUNNING" && (
            <div className="flex items-center gap-3 text-emerald-400 bg-emerald-400/10 px-3 py-1.5 rounded-full">
              <Loader2 size={14} className="animate-spin" />
              <span className="text-xs font-medium">Running</span>
              <span className="text-xs font-mono ml-2">
                {formatElapsed(elapsedMs)}
              </span>
            </div>
          )}
          {status === "COMPLETED" && (
            <div className="flex items-center gap-2 text-emerald-400 bg-emerald-400/10 px-3 py-1.5 rounded-full">
              <CheckCircle2 size={14} />
              <span className="text-xs font-medium">Completed</span>
              <span className="text-xs font-mono ml-2">
                {formatElapsed(elapsedMs)}
              </span>
            </div>
          )}
          {status === "FAILED" && (
            <div className="flex items-center gap-2 text-red-400 bg-red-400/10 px-3 py-1.5 rounded-full">
              <XCircle size={14} />
              <span className="text-xs font-medium">Failed</span>
              <span className="text-xs font-mono ml-2">
                {formatElapsed(elapsedMs)}
              </span>
            </div>
          )}

          <div className="h-4 w-px bg-slate-800" />

          {status === "RUNNING" ? (
            <button
              onClick={handleStop}
              className="flex items-center gap-2 px-4 py-1.5 bg-red-500/10 text-red-400 hover:bg-red-500/20 rounded-md transition-colors"
            >
              <StopCircle size={16} />
              Stop
            </button>
          ) : (
            <button
              onClick={handleRun}
              className="flex items-center gap-2 px-4 py-1.5 bg-indigo-600 text-white hover:bg-indigo-700 rounded-md transition-colors"
            >
              <PlayCircle size={16} />
              Run Plan
            </button>
          )}

          <button
            onClick={onClose}
            className="p-1.5 text-slate-500 hover:text-slate-300 hover:bg-slate-800 rounded-md transition-colors ml-2"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      {/* Progress Bar */}
      {(status === "RUNNING" || progress > 0) && (
        <div className="h-1 w-full bg-slate-800 shrink-0">
          <div
            className={`h-full transition-all duration-300 ${
              status === "FAILED" ? "bg-red-500" : "bg-indigo-500"
            }`}
            style={{ width: `${progress}%` }}
          />
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Terminal Log Area */}
        <div className="flex-1 bg-slate-950 p-6 overflow-y-auto font-mono text-sm space-y-3 flex flex-col">
          <div className="text-slate-500 text-xs font-bold uppercase tracking-widest mb-4 flex items-center gap-2">
            <Terminal size={12} /> Console Output
          </div>
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
};
