import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/shared/hooks/queryKeys";
import type { TestSuite } from "@/shared/types";

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
  const [apiFilter, setApiFilter] = useState("*api*");
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
          apiFilter,
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

  useEffect(() => {
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const wsUrl = `${protocol}//${window.location.host}`;
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      if (currentProjectId) {
        ws.send(
          JSON.stringify({
            event: "SUBSCRIBE_PROJECT",
            data: { projectId: currentProjectId },
          }),
        );
      }
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        if (
          message.event === "step-recorded" &&
          message.data.projectId === currentProjectId
        ) {
          const step = message.data.step;
          const wsCaseId = message.data.caseId;
          const wsSuiteId = message.data.suiteId;

          if (step && wsCaseId) {
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

            if (message.data.type === "API") {
              queryClient.invalidateQueries({ queryKey: queryKeys.endpoints });
              queryClient.invalidateQueries({ queryKey: queryKeys.headers });
              queryClient.invalidateQueries({ queryKey: queryKeys.bodies });
            }
          }
        } else if (message.event === "recorder-state-changed") {
          const { state } = message.data;
          if (state.action === "STOP") {
            setIsRecording(false);
            queryClient.invalidateQueries({ queryKey: queryKeys.suites });
          } else if (state.action === "START") {
            setIsRecording(true);
          }
        }
      } catch (error) {
        console.error("Failed to parse WS message:", error);
      }
    };

    ws.onerror = (error) => console.error("WS error:", error);

    return () => {
      ws.close();
    };
  }, [currentProjectId, queryClient]);

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
      } catch (error) {
        console.warn("Failed to fetch server info for default URL:", error);
      }
    };

    fetchServerInfo();
  }, [defaultRecordingUrl]);

  return {
    apiFilter,
    closeRecordingModal: () => setIsRecordingModalOpen(false),
    isRecording,
    isRecordingModalOpen,
    openRecordingModal: () => setIsRecordingModalOpen(true),
    recordingMode,
    recordingTargetId,
    recordingTargetStatus,
    recordingUrl,
    setApiFilter,
    setRecordingMode,
    setRecordingTargetId,
    setRecordingTargetStatus,
    setRecordingUrl,
    startRecording,
    stopRecording,
  };
}
