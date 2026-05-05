import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/shared/hooks/queryKeys";
import type { TestSuite } from "@/shared/types";
import type { ApiFilterConfig } from "../../../shared/recording/protocol";

export type RecordingMode = "ui" | "api" | "all";
export type RecordingTargetStatus =
  | "idle"
  | "busy"
  | "offline"
  | "disabled"
  | null;

interface UseTestCaseRecordingOptions {
  activeCaseId: string;
  activeSuiteId: string;
  currentEnvironment: string;
  currentProjectId: string;
}

function useRecordingSocket(
  projectId: string,
  onStepRecorded: (step: any, caseId: string, suiteId: string, type: 'UI' | 'API') => void,
  onRecordingStart: () => void,
  onRecordingStop: () => void,
) {
  const onStepRef = useRef(onStepRecorded);
  const onStartRef = useRef(onRecordingStart);
  const onStopRef = useRef(onRecordingStop);
  onStepRef.current = onStepRecorded;
  onStartRef.current = onRecordingStart;
  onStopRef.current = onRecordingStop;

  useEffect(() => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}`;
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      if (projectId) {
        ws.send(
          JSON.stringify({
            event: "SUBSCRIBE_PROJECT",
            data: { projectId },
          }),
        );
      }
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        if (
          message.event === "step-recorded" &&
          message.data.projectId === projectId
        ) {
          const { step, caseId, suiteId, type } = message.data;
          if (step && caseId) {
            onStepRef.current(step, caseId, suiteId, type);
          }
        } else if (message.event === "recorder-state-changed") {
          const { state } = message.data;
          if (state.action === "STOP") {
            onStopRef.current();
          } else if (state.action === "START") {
            onStartRef.current();
          }
        }
      } catch {
        // ignore parse errors
      }
    };

    return () => {
      ws.close();
    };
  }, [projectId]);
}

export function useTestCaseRecording({
  activeCaseId,
  activeSuiteId,
  currentEnvironment,
  currentProjectId,
}: UseTestCaseRecordingOptions) {
  const queryClient = useQueryClient();
  const defaultRecordingUrl = `${window.location.origin}/aut/login`;

  const [isRecordingModalOpen, setIsRecordingModalOpen] = useState(false);
  const [recordingUrl, setRecordingUrl] = useState(defaultRecordingUrl);
  const [apiFilter, setApiFilter] = useState("");
  const [apiFilterConfig, setApiFilterConfig] = useState<ApiFilterConfig | undefined>(undefined);
  const [recordingMode, setRecordingMode] = useState<RecordingMode>("ui");
  const [recordingTargetId, setRecordingTargetId] = useState<string | null>(null);
  const [recordingTargetStatus, setRecordingTargetStatus] = useState<RecordingTargetStatus>(null);
  const [isRecording, setIsRecording] = useState(false);

  const startRecording = async () => {
    if (!recordingTargetId) {
      alert("Please select an agent to record on.");
      return;
    }

    const urlToUse = recordingUrl.trim() || defaultRecordingUrl;
    if (!activeSuiteId || !currentProjectId || !activeCaseId) return;

    setIsRecording(true);
    setIsRecordingModalOpen(false);

    try {
      const response = await fetch("/api/recording/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetUrl: urlToUse,
          projectId: currentProjectId,
          environment: currentEnvironment,
          apiFilter: apiFilterConfig ? '' : apiFilter,
          apiFilterConfig,
          mode: recordingMode,
          agentId: recordingTargetId,
          caseId: activeCaseId,
          suiteId: activeSuiteId,
        }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error || response.statusText);
      }
    } catch (error) {
      console.error("Failed to start recording:", error);
      setIsRecording(false);
    }
  };

  const stopRecording = async () => {
    try {
      const response = await fetch("/api/recording/stop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId: recordingTargetId }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error || response.statusText);
      }
    } catch (error) {
      console.error("Failed to stop recording:", error);
    } finally {
      setIsRecording(false);
    }
  };

  const onStepRecorded = useCallback(
    (step: any, wsCaseId: string, wsSuiteId: string, type: 'UI' | 'API') => {
      queryClient.setQueryData<TestSuite[]>(queryKeys.suites, (oldSuites) => {
        if (!oldSuites) return oldSuites;
        return oldSuites.map((suite) => {
          if (suite.id !== wsSuiteId) return suite;
          return {
            ...suite,
            cases: suite.cases.map((testCase) => {
              if (testCase.id !== wsCaseId) return testCase;
              return { ...testCase, steps: [...testCase.steps, step] };
            }),
          };
        });
      });

      if (type === "API") {
        queryClient.invalidateQueries({ queryKey: queryKeys.endpoints });
        queryClient.invalidateQueries({ queryKey: queryKeys.headers });
        queryClient.invalidateQueries({ queryKey: queryKeys.bodies });
      }
    },
    [queryClient],
  );

  const onWsRecordingStart = useCallback(() => {
    setIsRecording(true);
  }, []);

  const onWsRecordingStop = useCallback(() => {
    setIsRecording(false);
    queryClient.invalidateQueries({ queryKey: queryKeys.suites });
  }, [queryClient]);

  useRecordingSocket(currentProjectId, onStepRecorded, onWsRecordingStart, onWsRecordingStop);

  useEffect(() => {
    const fetchServerInfo = async () => {
      try {
        const response = await fetch("/api/agents/server-info");
        if (!response.ok) return;

        const info = await response.json();
        setRecordingUrl((currentUrl) => {
          if (
            currentUrl === defaultRecordingUrl ||
            currentUrl === "http://localhost:3000/aut/login"
          ) {
            return `${info.baseUrl}/aut/login`;
          }
          return currentUrl;
        });
      } catch {
        // server-info not available
      }
    };
    fetchServerInfo();
  }, [defaultRecordingUrl]);

  return {
    apiFilter,
    apiFilterConfig,
    closeRecordingModal: () => setIsRecordingModalOpen(false),
    isRecording,
    isRecordingModalOpen,
    openRecordingModal: () => setIsRecordingModalOpen(true),
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
    startRecording,
    stopRecording,
  };
}
