import { createContext, useContext, type ReactNode } from 'react';
import type { SSEConnection } from '../sse/types';
import type { StartConfig } from './types';

export interface TestGenApiAdapter {
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

export interface TestGenRunDeps {
  api: TestGenApiAdapter;
  createSSEConnection: (url: string) => SSEConnection;
}

const TestGenRunDepsContext = createContext<TestGenRunDeps | null>(null);

export function TestGenRunDepsProvider({ deps, children }: { deps: TestGenRunDeps; children: ReactNode }) {
  return (
    <TestGenRunDepsContext.Provider value={deps}>
      {children}
    </TestGenRunDepsContext.Provider>
  );
}

export function useTestGenRunDeps(): TestGenRunDeps {
  const ctx = useContext(TestGenRunDepsContext);
  if (!ctx) {
    throw new Error('TestGenRunDepsProvider not found. Wrap your app with <TestGenRunDepsProvider>.');
  }
  return ctx;
}
