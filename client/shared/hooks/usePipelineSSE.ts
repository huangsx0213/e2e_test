import { useEffect, useRef, useCallback, useState } from 'react';

interface PipelineEvent {
  type: string;
  data: any;
  timestamp: number;
}

interface UsePipelineSSEOptions {
  projectId: string | null;
  config: any | null;
  onEvent?: (event: PipelineEvent) => void;
}

export function usePipelineSSE({ projectId, config, onEvent }: UsePipelineSSEOptions) {
  const controllerRef = useRef<AbortController | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  const start = useCallback(() => {
    if (!projectId || !config) return;

    if (controllerRef.current) {
      controllerRef.current.abort();
    }

    const controller = new AbortController();
    controllerRef.current = controller;

    const body = JSON.stringify({
      requirementIds: config.requirementIds,
      flowIds: config.flowIds,
      providerConfigName: config.providerConfigName,
      mode: config.mode,
      name: config.name,
    });

    fetch(`/api/pipeline/${projectId}/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      signal: controller.signal,
    }).then(async (response) => {
      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: 'Failed to start pipeline' }));
        onEventRef.current?.({ type: 'pipeline:error', data: { message: err.error || 'Unknown error', recoverable: false }, timestamp: Date.now() });
        return;
      }

      setIsConnected(true);
      const reader = response.body?.getReader();
      if (!reader) return;

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        let currentEvent = '';
        for (const line of lines) {
          if (line.startsWith('event: ')) {
            currentEvent = line.slice(7).trim();
          } else if (line.startsWith('data: ') && currentEvent) {
            try {
              const data = JSON.parse(line.slice(6));
              onEventRef.current?.({ type: currentEvent, data, timestamp: Date.now() });
            } catch {
              // skip malformed JSON
            }
            currentEvent = '';
          }
        }
      }
      setIsConnected(false);
    }).catch((err: any) => {
      if (err.name !== 'AbortError') {
        onEventRef.current?.({ type: 'pipeline:error', data: { message: err.message, recoverable: false }, timestamp: Date.now() });
      }
      setIsConnected(false);
    });
  }, [projectId, config]);

  const stop = useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    setIsConnected(false);
  }, []);

  useEffect(() => {
    return () => {
      controllerRef.current?.abort();
    };
  }, []);

  return { start, stop, isConnected };
}