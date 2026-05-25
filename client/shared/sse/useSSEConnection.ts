import { useEffect, useRef, useState, useCallback } from 'react';
import type { SSEStatus, SSEEvent } from './types';
import { createFetchSSEConnection } from './connection';

interface UseSSEConnectionOptions {
  url: string | null;
  onEvent?: (event: SSEEvent) => void;
  autoConnect?: boolean;
}

interface UseSSEConnectionReturn {
  status: SSEStatus;
  isConnected: boolean;
  lastError: string | null;
  connect: () => void;
  disconnect: () => void;
}

export function useSSEConnection({
  url,
  onEvent,
  autoConnect = true,
}: UseSSEConnectionOptions): UseSSEConnectionReturn {
  const [status, setStatus] = useState<SSEStatus>('disconnected');
  const [lastError, setLastError] = useState<string | null>(null);
  const connRef = useRef<ReturnType<typeof createFetchSSEConnection> | null>(null);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  const connect = useCallback(() => {
    if (!url) return;
    connRef.current?.disconnect();
    connRef.current = createFetchSSEConnection(url, {
      onEvent: (event) => onEventRef.current?.(event),
      onStatusChange: setStatus,
      onError: (err) => setLastError(err.message),
    });
    connRef.current.connect();
  }, [url]);

  const disconnect = useCallback(() => {
    connRef.current?.disconnect();
    connRef.current = null;
    setStatus('disconnected');
    setLastError(null);
  }, []);

  useEffect(() => {
    if (autoConnect && url) connect();
    return () => disconnect();
  }, [url, autoConnect, connect, disconnect]);

  return { status, isConnected: status === 'connected', lastError, connect, disconnect };
}
