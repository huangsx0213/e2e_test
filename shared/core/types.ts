import type { DynamicVariable } from '../contracts/index.ts';
import type { IVariableContext, IApiStepExecutor } from '../contracts/index.ts';
import type { IExecutionLogger, IUiExecutor } from '../contracts/index.ts';
import type { TaskPayload } from '../contracts/index.ts';

export interface ExecutorDeps {
  createContext: (options: {
    environmentVariables: Record<string, string>;
    dynamicVariables: Record<string, string>;
    dynamicVariableConfigs: Record<string, DynamicVariable>;
    suiteVariables: Record<string, string>;
    suiteDataRow: Record<string, string>;
    scenarioVariables?: Record<string, string>;
    scenarioDataRow?: Record<string, string>;
    scenarioOverrides?: Record<string, string>;
  }) => IVariableContext;
  executeApiStep: IApiStepExecutor;
}

export function isAssertionFailure(error: unknown): boolean {
  return error instanceof Error && !!(error as any).isAssertionFailure;
}

export function shouldSwallowAssertion(error: unknown, failureStrategy?: 'fail-fast' | 'soft'): boolean {
  return error instanceof Error && (error as any).isAssertionFailure && failureStrategy === 'soft';
}

/** Fixed execution infrastructure passed through all suite/plan/scenario layers. */
export interface SuiteRunContext {
  payload: TaskPayload;
  logger: IExecutionLogger;
  signal: AbortSignal;
  uiExecutor: IUiExecutor;
  deps: ExecutorDeps;
  onEnvVarExtracted?: (name: string, value: string) => void;
}
