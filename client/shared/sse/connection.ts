import type { SSEStatus, SSEEvent, SSEConnection, SSEConnectionHandlers } from './types';

const RETRY_DELAYS = [1000, 2000, 4000, 8000, 16000];

export function createFetchSSEConnection(
  url: string,
  handlers: SSEConnectionHandlers,
): SSEConnection {
  let controller: AbortController | null = null;
  let status: SSEStatus = 'disconnected';
  let lastError: string | null = null;
  let retryCount = 0;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;

  const setStatus = (s: SSEStatus) => {
    status = s;
    handlers.onStatusChange?.(s);
  };

  const doConnect = () => {
    if (controller) controller.abort();
    controller = new AbortController();
    const signal = controller.signal;
    setStatus('connecting');

    fetch(url, { signal })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        setStatus('connected');
        retryCount = 0;
        const reader = response.body?.getReader();
        if (!reader) return;
        const decoder = new TextDecoder();
        let buffer = '';

        let currentEvent = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';
          for (const line of lines) {
            if (line.startsWith('event: ')) {
              currentEvent = line.slice(7).trim();
            } else if (line.startsWith('data: ') && currentEvent) {
              try {
                handlers.onEvent?.({ type: currentEvent, data: JSON.parse(line.slice(6)), timestamp: Date.now() });
              } catch {
                /* skip malformed JSON */
              }
              currentEvent = '';
            }
          }
        }
        setStatus('disconnected');
      })
      .catch((err: Error) => {
        if (err.name === 'AbortError') return;
        lastError = err.message;
        setStatus('error');
        handlers.onError?.(err);
        const delay = RETRY_DELAYS[Math.min(retryCount, RETRY_DELAYS.length - 1)];
        retryCount++;
        if (!controller?.signal.aborted) {
          retryTimer = setTimeout(doConnect, delay);
        }
      });
  };

  return {
    connect: () => {
      retryCount = 0;
      doConnect();
    },
    disconnect: () => {
      if (retryTimer) clearTimeout(retryTimer);
      controller?.abort();
      controller = null;
      setStatus('disconnected');
      lastError = null;
    },
    getStatus: () => status,
    getLastError: () => lastError,
  };
}
