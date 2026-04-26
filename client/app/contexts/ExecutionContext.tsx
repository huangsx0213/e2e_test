import { createContext, useContext } from 'react';
import { ExecutionState } from '@/app/types';

export interface ExecutionContextValue {
  executionState: ExecutionState | null;
  setExecutionState: (state: ExecutionState | null) => void;
}

export const ExecutionPanelContext = createContext<ExecutionContextValue | null>(null);

export function useExecutionPanelContext() {
  const ctx = useContext(ExecutionPanelContext);
  if (!ctx) throw new Error('useExecutionPanelContext must be used within ExecutionPanelContext.Provider');
  return ctx;
}
