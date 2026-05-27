import { useEffect, useRef, useCallback, useState } from 'react';

interface TestGenEvent {
  type: string;
  data: any;
  timestamp: number;
}

interface UseTestGenSSEOptions {
  runId: string | null;
  onEvent?: (event: TestGenEvent) => void;
}

export function useTestGenSSE({ runId, onEvent }: UseTestGenSSEOptions) {
  const controllerRef = useRef<AbortController | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  const start = useCallback(() => {
    if (!runId) {
      console.log('[test-gen-sse] start called without runId, skipping');
      return;
    }

    console.log(`[test-gen-sse] start: connecting to ${runId}`);
    setLastError(null);

    if (controllerRef.current) {
      controllerRef.current.abort();
    }

    const controller = new AbortController();
    controllerRef.current = controller;

    fetch(`/api/pipeline/${runId}/stream`, {
      method: 'GET',
      signal: controller.signal,
    }).then(async (response) => {
      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: `HTTP ${response.status}: ${response.statusText}` }));
        const msg = err.error || 'SSE connection failed';
        console.error(`[test-gen-sse] HTTP error: ${response.status}`, err);
        setLastError(msg);
        onEventRef.current?.({ type: 'test-gen:error', data: { message: msg, recoverable: false }, timestamp: Date.now() });
        return;
      }

      console.log(`[test-gen-sse] connected to ${runId}`);
      setIsConnected(true);
      const reader = response.body?.getReader();
      if (!reader) return;

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          console.log(`[test-gen-sse] ${runId}: stream ended`);
          break;
        }

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
        console.error(`[test-gen-sse] ${runId}: connection error:`, err.message);
        setLastError(err.message);
        onEventRef.current?.({ type: 'test-gen:error', data: { message: err.message, recoverable: false }, timestamp: Date.now() });
      }
      setIsConnected(false);
    });
  }, [runId]);

  const stop = useCallback(() => {
    console.log('[test-gen-sse] stop');
    controllerRef.current?.abort();
    controllerRef.current = null;
    setIsConnected(false);
    setLastError(null);
  }, []);

  useEffect(() => {
    return () => {
      controllerRef.current?.abort();
    };
  }, []);

  return { start, stop, isConnected, lastError };
}
