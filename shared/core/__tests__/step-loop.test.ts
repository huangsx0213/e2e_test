import { describe, expect, it, vi } from 'vitest';
import { executeSteps, MAX_MODULE_DEPTH } from '../step-loop.ts';
import type { TestStep, TaskPayload, IExecutionLogger, IVariableContext, IUiExecutor } from '../../contracts/index.ts';
import type { ExecutorDeps } from '../types.ts';

function mockLogger(): IExecutionLogger {
  return { log: vi.fn(), progress: vi.fn(), complete: vi.fn() };
}

function mockContext(): IVariableContext {
  return {
    resolve: vi.fn(),
    resolveAll: vi.fn(() => ({})),
    resolveDetailed: vi.fn(() => ({})),
    interpolate: vi.fn((s: string) => s),
    getCurrentStep: vi.fn(() => null),
    setCurrentStep: vi.fn(),
    setCurrentContext: vi.fn(),
    onVariableSet: vi.fn(),
    removeOnVariableSet: vi.fn(),
    createChildContext: vi.fn(),
    mergeChildExtractedVars: vi.fn(),
    clearCaseVars: vi.fn(),
    clearSuiteVars: vi.fn(),
    clearScenarioVars: vi.fn(),
    setSharedRuntimeVars: vi.fn(),
    setDynamicVariableCaches: vi.fn(),
    getDynamicVariableCaches: vi.fn(() => ({})),
    setRuntimeVar: vi.fn(),
  };
}

function mockAbortSignal(aborted = false): AbortSignal {
  return {
    aborted,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
    onabort: null,
    reason: '',
    throwIfAborted: vi.fn(),
  } as unknown as AbortSignal;
}

const noopExecutor: IUiExecutor = {
  initialize: vi.fn(async () => {}),
  executeStep: vi.fn(),
  captureStateScreenshot: vi.fn(),
  cleanup: vi.fn(),
};

const noopDeps: ExecutorDeps = {
  createContext: vi.fn(),
  executeApiStep: vi.fn(),
};

const basePayload = {
  runId: 'r1',
  reportId: 'r2',
  request: { type: 'suite' as const, projectId: 'p1', environment: 'dev' },
  project: { id: 'p1', name: 'Test', pages: [], modules: [], scenarios: [], plans: [] },
  suites: [],
  assets: { headers: [], bodies: [], endpoints: [] },
  environmentVariables: {},
  dynamicVariables: {},
  dynamicVariableConfigs: {},
  settings: { id: 's1' },
} as unknown as TaskPayload;

// ─── MAX_MODULE_DEPTH ───

describe('MAX_MODULE_DEPTH', () => {
  it('is set to 20', () => {
    expect(MAX_MODULE_DEPTH).toBe(20);
  });
});

// ─── executeSteps ───

describe('executeSteps', () => {
  it('skips disabled steps', async () => {
    const logger = mockLogger();
    const steps: TestStep[] = [
      { id: 's1', action: 'click', target: '.btn', enabled: false },
    ] as TestStep[];
    await executeSteps(steps, mockContext(), basePayload, logger, mockAbortSignal(), noopExecutor, noopDeps, 0);
    expect(logger.log).toHaveBeenCalledWith(expect.objectContaining({ stepId: 's1', status: 'SKIP' }));
  });

  it('throws on aborted signal', async () => {
    const signal = mockAbortSignal(true);
    await expect(
      executeSteps([{ id: 's1', action: 'click' } as TestStep], mockContext(), basePayload, mockLogger(), signal, noopExecutor, noopDeps, 0),
    ).rejects.toThrow('Execution aborted');
  });

  it('processes multiple steps in order', async () => {
    const logger = mockLogger();
    const steps: TestStep[] = [
      { id: 's1', action: 'waitForTimeout', data: '1' },
      { id: 's2', action: 'waitForTimeout', data: '1' },
    ] as TestStep[];
    await executeSteps(steps, mockContext(), basePayload, logger, mockAbortSignal(), noopExecutor, noopDeps, 0);
    // Both WAIT steps complete (assertions via PASS messages)
    const passLogs = (logger.log as ReturnType<typeof vi.fn>).mock.calls.filter(
      (c: any[]) => c[0].status === 'PASS',
    );
    expect(passLogs).toHaveLength(2);
  });
});
