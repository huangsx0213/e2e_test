/**
 * AI-Driven Recorder Run — 依赖注入 Provider
 *
 * 参考 TestGenRunDepsProvider 模式，提供 api adapter。
 * SSE 订阅在 hook 内部直接使用 fetch 实现（参考 useTestGenSSE 模式）。
 */

import { createContext, useContext, type ReactNode } from 'react';
import type { AiRecorderApiAdapter } from './types';

export interface AiDrivenRecorderRunDeps {
  api: AiRecorderApiAdapter;
}

const AiDrivenRecorderRunDepsContext = createContext<AiDrivenRecorderRunDeps | null>(null);

export function AiDrivenRecorderRunDepsProvider({
  deps,
  children,
}: {
  deps: AiDrivenRecorderRunDeps;
  children: ReactNode;
}) {
  return (
    <AiDrivenRecorderRunDepsContext.Provider value={deps}>
      {children}
    </AiDrivenRecorderRunDepsContext.Provider>
  );
}

export function useAiDrivenRecorderRunDeps(): AiDrivenRecorderRunDeps {
  const ctx = useContext(AiDrivenRecorderRunDepsContext);
  if (!ctx) {
    throw new Error('AiDrivenRecorderRunDepsProvider not found.');
  }
  return ctx;
}
