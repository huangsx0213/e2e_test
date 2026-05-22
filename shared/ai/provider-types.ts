export interface CircuitBreakerState {
  failureCount: number;
  lastFailureTime: number | null;
  isOpen: boolean;
  openSince: number | null;
}

export interface ProviderConfig {
  type: 'azure-openai' | 'nvidia-nim' | 'openrouter' | 'openai';
  endpoint?: string;
  apiKey: string;
  deployment?: string;
  apiVersion?: string;
  model?: string;
  fallbackConfigs?: ProviderConfig[];
  circuitBreaker?: {
    failureThreshold: number;
    resetTimeoutMs: number;
  };
}