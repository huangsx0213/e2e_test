export type SSEStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface SSEEvent {
  type: string;
  data: unknown;
  timestamp: number;
}

export interface SSEConnectionHandlers {
  onEvent?: (event: SSEEvent) => void;
  onStatusChange?: (status: SSEStatus) => void;
  onError?: (error: Error) => void;
}

export interface SSEConnection {
  connect: () => void;
  disconnect: () => void;
  getStatus: () => SSEStatus;
  getLastError: () => string | null;
}
