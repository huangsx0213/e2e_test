import { useEffect, useState, useRef, useCallback } from "react";
import { executionApi } from "@/shared/services/api";
import type { ExecutionLog } from "@/shared/types";

export type ExecutionStatus = "IDLE" | "QUEUED" | "RUNNING" | "COMPLETED" | "FAILED";

export interface UseExecutionRunOptions {
  request: {
    type: "case" | "suite" | "scenario" | "plan";
    projectId: string;
    suiteId?: string;
    caseId?: string;
    scenarioId?: string;
    planId?: string;
  };
  initialEnvironment: string;
}

export function useExecutionRun({ request, initialEnvironment }: UseExecutionRunOptions) {
  const [logs, setLogs] = useState<ExecutionLog[]>([]);
  const [status, setStatus] = useState<ExecutionStatus>("IDLE");
  const [queuePosition, setQueuePosition] = useState<number | null>(null);
  const [progress, setProgress] = useState(0);
  const [selectedEnv, setSelectedEnv] = useState(initialEnvironment);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [reportId, setReportId] = useState<string | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);

  const requestRef = useRef(request);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const startTimeRef = useRef<number>(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // When the user selects a different test case/suite/scenario/plan without
  // closing the runner, reset state so the button shows "Run" not "Re-run".
  if (request.type !== requestRef.current.type ||
      request.suiteId !== requestRef.current.suiteId ||
      request.caseId !== requestRef.current.caseId ||
      request.scenarioId !== requestRef.current.scenarioId ||
      request.planId !== requestRef.current.planId) {
    requestRef.current = request;
    setStatus("IDLE");
    setQueuePosition(null);
    setLogs([]);
    setProgress(0);
    setReportId(null);
    setElapsedMs(0);
    eventSourceRef.current?.close();
    eventSourceRef.current = null;
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

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

  const connectSSE = useCallback(
    (rId: string) => {
      const es = executionApi.stream(rId);
      eventSourceRef.current = es;

      es.addEventListener("log", (event) => {
        const data = JSON.parse(event.data);
        if (data.status === "QUEUED") {
          setStatus("QUEUED");
          setQueuePosition(data.metadata?.position);
        } else {
          setStatus((prev) => prev !== "RUNNING" && data.status === "INFO" ? "RUNNING" : prev);
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
        }
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

  const startExecution = useCallback(async () => {
    setStatus(selectedAgentId ? "QUEUED" : "RUNNING");
    setQueuePosition(null);
    setLogs([]);
    setProgress(0);
    startTimer();

    try {
      const response = await executionApi.execute({
        ...request,
        environment: selectedEnv,
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
  }, [request, selectedEnv, selectedAgentId, startTimer, connectSSE]);

  const handleAbort = useCallback(async () => {
    if (!reportId) return;
    try {
      await executionApi.abort(reportId);
    } catch { /* best effort */ }
  }, [reportId]);

  const formatElapsed = (ms: number) => {
    const totalSec = Math.floor(ms / 1000);
    const min = Math.floor(totalSec / 60).toString().padStart(2, "0");
    const sec = (totalSec % 60).toString().padStart(2, "0");
    const tenths = Math.floor((ms % 1000) / 100);
    return `${min}:${sec}.${tenths}`;
  };

  const isIdle = status === "IDLE";
  const isRunning = status === "RUNNING";
  const isQueued = status === "QUEUED";
  const isFinished = status === "COMPLETED" || status === "FAILED";
  const canRun = isIdle || isFinished;

  return {
    logs,
    status,
    queuePosition,
    progress,
    selectedEnv,
    selectedAgentId,
    reportId,
    elapsedMs,
    logsEndRef,
    setSelectedEnv,
    setSelectedAgentId,
    setStatus,
    startExecution,
    handleAbort,
    formatElapsed,
    isIdle,
    isRunning,
    isQueued,
    isFinished,
    canRun,
  };
}
