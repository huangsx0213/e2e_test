import { createContext, useContext, type ReactNode } from 'react';
import type { SSEConnection } from '../sse/types';
import type { StartConfig } from './types';

export interface PipelineApiAdapter {
  runs: (projectId: string) => Promise<any[]>;
  active: (projectId: string) => Promise<any | null>;
  get: (runId: string) => Promise<any>;
  start: (projectId: string, config: StartConfig) => Promise<{ runId: string }>;
  resume: (runId: string, action: any) => Promise<any>;
  checkpoint: (runId: string) => Promise<any>;
  logs: (runId: string, agentName?: string) => Promise<any[]>;
  abort: (runId: string) => Promise<any>;
  delete: (runId: string) => Promise<any>;
}

export interface PipelineRunDeps {
  api: PipelineApiAdapter;
  createSSEConnection: (url: string) => SSEConnection;
}

const PipelineRunDepsContext = createContext<PipelineRunDeps | null>(null);

export function PipelineRunDepsProvider({ deps, children }: { deps: PipelineRunDeps; children: ReactNode }) {
  return (
    <PipelineRunDepsContext.Provider value={deps}>
      {children}
    </PipelineRunDepsContext.Provider>
  );
}

export function usePipelineRunDeps(): PipelineRunDeps {
  const ctx = useContext(PipelineRunDepsContext);
  if (!ctx) {
    throw new Error('PipelineRunDepsProvider not found. Wrap your app with <PipelineRunDepsProvider>.');
  }
  return ctx;
}
