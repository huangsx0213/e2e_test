import type { TaskPayload, RunResult } from '../contracts/index.ts';
import type { IExecutionLogger, IUiExecutor } from '../contracts/index.ts';
import type { ExecutorDeps } from './types.ts';
import { executeSteps } from './step-loop.ts';

export async function executeSingleCase(
  payload: TaskPayload,
  logger: IExecutionLogger,
  signal: AbortSignal,
  uiExecutor: IUiExecutor,
  deps: ExecutorDeps,
  onEnvVarExtracted?: (name: string, value: string) => void,
): Promise<RunResult> {
  const suite = payload.suite || payload.suites?.find(s => s.id === payload.request.suiteId);
  if (!suite) throw new Error(`Suite ${payload.request.suiteId} not found`);

  const testCase = suite.cases.find(c => c.id === payload.request.caseId);
  if (!testCase) throw new Error(`Case ${payload.request.caseId} not found`);

  const suiteDefaults = (suite.variables || []).reduce(
    (acc, v) => ({ ...acc, [v.key]: v.value }),
    {} as Record<string, string>,
  );
  const firstRowData = suite.dataRows && suite.dataRows.length > 0 ? suite.dataRows[0] : {};

  const context = deps.createContext({
    environmentVariables: payload.environmentVariables,
    dynamicVariables: payload.dynamicVariables,
    dynamicVariableConfigs: payload.dynamicVariableConfigs,
    suiteVariables: suiteDefaults,
    suiteDataRow: firstRowData,
  });
  context.setCurrentContext(null, suite.name, testCase.name);

  context.onVariableSet((key, value, scope) => {
    logger.log({
      stepId: context.getCurrentStep() || 'var-set',
      status: 'INFO',
      level: 'info',
      message: `✨ Variable Set: ${key} = ${value} (${scope})`,
    });
  });

  logger.log({ stepId: 'env', status: 'INFO', message: `🔧 Environment: ${payload.request.environment}` });
  logger.log({ stepId: `case-${testCase.id}`, status: 'INFO', message: `🧪 Running Case: ${testCase.name}` });

  let passed = true;
  try {
    if (suite.setupSteps && suite.setupSteps.length > 0) {
      logger.log({ stepId: 'suite-setup', status: 'INFO', message: '⚙️ Running Suite Setup Steps' });
      await executeSteps(suite.setupSteps, context, payload, logger, signal, uiExecutor, deps, 0, onEnvVarExtracted);
    }

    if (testCase.setupSteps && testCase.setupSteps.length > 0) {
      logger.log({ stepId: 'case-setup', status: 'INFO', message: '⚙️ Running Case Setup Steps' });
      await executeSteps(testCase.setupSteps, context, payload, logger, signal, uiExecutor, deps, 0, onEnvVarExtracted);
    }

    await executeSteps(testCase.steps, context, payload, logger, signal, uiExecutor, deps, 0, onEnvVarExtracted);

  } catch (error) {
    passed = false;
    const msg = error instanceof Error ? error.message : String(error);
    logger.log({ stepId: 'case-fail', status: 'FAIL', message: `❌ Case Failed: ${msg}` });
  } finally {
    try {
      if (testCase.teardownSteps && testCase.teardownSteps.length > 0) {
        logger.log({ stepId: 'case-teardown', status: 'INFO', message: '🧹 Running Case Teardown Steps' });
        await executeSteps(testCase.teardownSteps, context, payload, logger, signal, uiExecutor, deps, 0);
      }
    } catch (teardownError) {
      logger.log({
        stepId: 'case-teardown',
        status: 'FAIL',
        message: `⚠️ Teardown Error: ${teardownError instanceof Error ? teardownError.message : String(teardownError)}`,
      });
    }

    try {
      if (suite.teardownSteps && suite.teardownSteps.length > 0) {
        logger.log({ stepId: 'suite-teardown', status: 'INFO', message: '🧹 Running Suite Teardown Steps' });
        await executeSteps(suite.teardownSteps, context, payload, logger, signal, uiExecutor, deps, 0, onEnvVarExtracted);
      }
    } catch (teardownError) {
      logger.log({
        stepId: 'suite-teardown',
        status: 'FAIL',
        message: `⚠️ Teardown Error: ${teardownError instanceof Error ? teardownError.message : String(teardownError)}`,
      });
    }

    context.clearCaseVars();
    context.removeOnVariableSet();
  }

  logger.log({
    stepId: 'finish',
    status: passed ? 'PASS' : 'FAIL',
    message: passed ? '🏁 Execution Completed Successfully' : '🏁 Execution Completed with Failures',
  });

  return {
    reportId: '',
    status: passed ? 'COMPLETED' : 'FAILED',
    passRate: passed ? 100 : 0,
    totalCases: 1,
    passedCases: passed ? 1 : 0,
    failedCases: passed ? 0 : 1,
    durationMs: 0,
  };
}
