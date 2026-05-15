import type { TestStep, TestModule, TaskPayload } from '../contracts/index.ts';
import type { IExecutionLogger, IVariableContext, IUiExecutor, ApiExecutionResult, LogLevel } from '../contracts/index.ts';
import type { ExecutorDeps } from './types.ts';
import { shouldSwallowAssertion, isAssertionFailure } from './types.ts';

export const MAX_MODULE_DEPTH = 20;

export async function executeSteps(
  steps: TestStep[],
  context: IVariableContext,
  payload: TaskPayload,
  logger: IExecutionLogger,
  signal: AbortSignal,
  uiExecutor: IUiExecutor,
  deps: ExecutorDeps,
  depth: number,
  onEnvVarExtracted?: (name: string, value: string) => void,
): Promise<void> {
  for (let i = 0; i < steps.length; i++) {
    if (signal.aborted) throw new Error('Execution aborted');

    const step = steps[i];
    const indent = '  '.repeat(depth);

    context.setCurrentStep(step.id);
    if (step.enabled === false) {
      logger.log({
        stepId: step.id,
        status: 'SKIP',
        message: `${indent}⏭️ Step Skipped (disabled): ${step.action}`
      });
      continue;
    }

    if (step.action === 'runModule') {
      await executeModuleStep(step, context, payload, logger, signal, uiExecutor, deps, depth, indent, onEnvVarExtracted);
    } else if (step.action.trim() === 'waitForTimeout') {
      await executeWaitStep(step, context, logger, indent);
    } else if (step.action.startsWith('api')) {
      await executeApiStepAction(step, context, payload, logger, deps, indent, onEnvVarExtracted);
    } else {
      await executeUiStepAction(step, context, payload, logger, signal, uiExecutor, indent, onEnvVarExtracted);
    }
  }
}

async function executeModuleStep(
  step: TestStep,
  context: IVariableContext,
  payload: TaskPayload,
  logger: IExecutionLogger,
  signal: AbortSignal,
  uiExecutor: IUiExecutor,
  deps: ExecutorDeps,
  depth: number,
  indent: string,
  onEnvVarExtracted?: (name: string, value: string) => void,
): Promise<void> {
  if (depth >= MAX_MODULE_DEPTH) {
    throw new Error(`Max module depth (${MAX_MODULE_DEPTH}) exceeded — possible infinite recursion`);
  }

  const module = payload.project.modules?.find(m => m.id === step.target);
  if (!module) {
    logger.log({ stepId: step.id, status: 'FAIL', message: `${indent}❌ Module Not Found: ${step.target}` });
    throw new Error(`Module ${step.target} not found`);
  }

  logger.log({ stepId: step.id, status: 'RUNNING', message: `${indent}📦 Executing Module: ${module.name}` });

  const moduleDefaults: Record<string, string> = {};
  for (const p of module.params || []) {
    moduleDefaults[p.name] = p.defaultValue || '';
  }

  let overrides: Record<string, string> = {};
  try {
    if (step.data) overrides = JSON.parse(step.data);
  } catch { /* not JSON — ignore */ }

  const childContext = context.createChildContext(moduleDefaults, overrides);
  await executeSteps(module.steps || [], childContext, payload, logger, signal, uiExecutor, deps, depth + 1, onEnvVarExtracted);

  context.mergeChildExtractedVars(childContext, step.namespace);
  logger.log({ stepId: step.id, status: 'PASS', message: `${indent}✅ Module Completed: ${module.name}` });
}

async function executeWaitStep(
  step: TestStep,
  context: IVariableContext,
  logger: IExecutionLogger,
  indent: string,
): Promise<void> {
  const ms = parseInt(context.interpolate(step.data || '1000'), 10) || 1000;
  logger.log({ stepId: step.id, status: 'RUNNING', message: `${indent}⏳ Waiting ${ms}ms` });
  await new Promise(resolve => setTimeout(resolve, ms));
  logger.log({ stepId: step.id, status: 'PASS', message: `${indent}✅ Wait completed` });
}

async function executeApiStepAction(
  step: TestStep,
  context: IVariableContext,
  payload: TaskPayload,
  logger: IExecutionLogger,
  deps: ExecutorDeps,
  indent: string,
  onEnvVarExtracted?: (name: string, value: string) => void,
): Promise<void> {
  const resolvedTarget = context.interpolate(step.target || '');
  logger.log({
    stepId: step.id,
    status: 'RUNNING',
    level: 'info',
    message: `${indent}🌐 [${step.action}] ${resolvedTarget}`,
  });

  let result: ApiExecutionResult | undefined = undefined;
  try {
    result = await deps.executeApiStep(step, context, payload.assets, payload.request.environment, logger, indent, onEnvVarExtracted);

    const isSuccess = result.status >= 200 && result.status < 400;

    logger.log({
      stepId: step.id,
      status: isSuccess ? 'PASS' : 'FAIL',
      level: isSuccess ? 'success' : 'error',
      message: `${indent}${isSuccess ? '✅' : '❌'} ${result.resolvedMethod} ${result.resolvedUrl} → ${result.status} ${result.statusText} (${result.durationMs}ms)`,
      metadata: {
        network: {
          url: result.resolvedUrl,
          method: result.resolvedMethod,
          status: result.status,
          requestHeaders: result.resolvedHeaders,
          requestBody: result.resolvedBody,
          responseHeaders: result.headers,
          responseBody: result.body,
          durationMs: result.durationMs,
        },
        variables: context.resolveDetailed()
      },
    });

    if (logger) {
      result.assertionLogs.forEach(log => logger.log({ ...log, stepId: step.id }));
      result.extractionLogs.forEach(log => logger.log({ ...log, stepId: step.id }));
    }

    const anyAssertionFailed = result.assertionLogs.some(log => log.status === 'FAIL');

    if (!isSuccess) {
      if (step.failureStrategy !== 'soft') {
        throw new Error(`API request failed: ${result.status} ${result.statusText}`);
      }
      const err = new Error(`API request failed: ${result.status} ${result.statusText}`);
      (err as any).isAssertionFailure = true;
      throw err;
    }

    if (anyAssertionFailed && step.failureStrategy !== 'soft') {
      const failureLog = result.assertionLogs.find(log => log.status === 'FAIL');
      const err = new Error(failureLog?.message.trim().replace(/^❌\s*/, '') || 'Assertion Failed');
      (err as any).isAssertionFailure = true;
      throw err;
    }
  } catch (error) {
    if (shouldSwallowAssertion(error, step.failureStrategy)) return;

    const msg = error instanceof Error ? error.message : String(error);
    if (isAssertionFailure(error) || (error instanceof Error && msg.startsWith('API request failed:'))) {
      throw error;
    }

    logger.log({
      stepId: step.id,
      status: 'FAIL',
      level: 'error',
      message: `${indent}❌ Request Error: ${msg}`,
      metadata: {
        errorStack: error instanceof Error ? error.stack : undefined,
        variables: context.resolveAll()
      }
    });
    throw error;
  }
}

async function executeUiStepAction(
  step: TestStep,
  context: IVariableContext,
  payload: TaskPayload,
  logger: IExecutionLogger,
  signal: AbortSignal,
  uiExecutor: IUiExecutor,
  indent: string,
  onEnvVarExtracted?: (name: string, value: string) => void,
): Promise<void> {
  let uiResult: {
    durationMs: number;
    screenshot?: string;
    extractedValue?: string;
    assertionDetails?: { expected: string; actual: string; target?: string };
    logs?: { status: string; level: LogLevel; message: string }[];
  } | undefined = undefined;
  try {
    const allSettings = [payload.settings];
    const settings = allSettings.find(s => s.currentProjectId === payload.project.id) || allSettings[0];
    const isHeadless = settings ? settings.headlessMode !== false : true;
    const recordVideo = settings ? settings.recordVideo !== false : true;

    await uiExecutor.initialize({
      headless: isHeadless,
      viewportWidth: settings?.viewportWidth,
      viewportHeight: settings?.viewportHeight,
      recordVideo,
      logger
    });

    const resolvedTarget = context.interpolate(step.target || '');
    logger.log({
      stepId: step.id,
      status: 'RUNNING',
      level: 'info',
      message: `${indent}💻 [${step.action}] ${resolvedTarget ? resolvedTarget + ' ' : ''}${step.data ? '(' + context.interpolate(step.data) + ')' : ''}`,
    });

    uiResult = await uiExecutor.executeStep(step, context, payload.project.pages || [], payload.request.environment, onEnvVarExtracted);

    let logMessage = `${indent}✅ [${step.action}] Completed (${uiResult.durationMs}ms)`;
    if (step.action.startsWith('assert') && uiResult.assertionDetails) {
      const { expected, actual, target } = uiResult.assertionDetails;
      const targetStr = target ? ` ${target}` : '';
      logMessage = `${indent}✅ Assertion Passed: [${step.action}]${targetStr} (Expected: '${expected}', Actual: '${actual}')`;
    }

    logger.log({
      stepId: step.id,
      status: 'PASS',
      level: 'success',
      message: logMessage,
      screenshot: uiResult.screenshot,
      metadata: {
        variables: context.resolveDetailed(),
        extractedValue: uiResult.extractedValue,
        assertionDetails: uiResult.assertionDetails
      }
    });

    if (logger && uiResult.logs) {
      uiResult.logs.forEach(log => logger.log({ ...log, stepId: step.id }));
    }
  } catch (error) {
    if (shouldSwallowAssertion(error, step.failureStrategy)) return;
    if (isAssertionFailure(error)) throw error;

    const msg = error instanceof Error ? error.message : String(error);

    const failScreenshot = await uiExecutor.captureStateScreenshot();

    let logMessage = `${indent}❌ UI Action Failed: ${msg}`;
    if (step.action.startsWith('assert') && (error as any).assertionDetails) {
      const { expected, actual, target } = (error as any).assertionDetails;
      const targetStr = target ? ` ${target}` : '';
      logMessage = `${indent}❌ Assertion Failed: [${step.action}]${targetStr} (Expected: '${expected}', Actual: '${actual}')`;
    }

    logger.log({
      stepId: step.id,
      status: 'FAIL',
      level: 'error',
      message: logMessage,
      screenshot: failScreenshot || undefined,
      metadata: {
        errorStack: error instanceof Error ? error.stack : undefined,
        variables: context.resolveDetailed(),
        assertionDetails: (error as any).assertionDetails
      }
    });
    throw error;
  }
}
