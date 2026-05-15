import type { TestSuite, RunResult } from '../contracts/index.ts';
import type { ExecutorDeps, SuiteRunContext } from './types.ts';
import { isAssertionFailure } from './types.ts';
import { executeSteps } from './step-loop.ts';

export async function executeSuite(
  payload: SuiteRunContext['payload'],
  logger: SuiteRunContext['logger'],
  signal: SuiteRunContext['signal'],
  uiExecutor: SuiteRunContext['uiExecutor'],
  deps: SuiteRunContext['deps'],
  onEnvVarExtracted?: SuiteRunContext['onEnvVarExtracted'],
): Promise<RunResult> {
  const suite = payload.suite || payload.suites?.find(s => s.id === payload.request.suiteId);
  if (!suite) throw new Error(`Suite ${payload.request.suiteId} not found`);

  const ctx: SuiteRunContext = { payload, logger, signal, uiExecutor, deps, onEnvVarExtracted };
  return runSuiteWithContext(suite, null, {}, {}, {}, 'SUITE', ctx, {}, {});
}

export async function runSuiteWithContext(
  suite: TestSuite,
  scenarioName: string | null,
  scenarioVariables: Record<string, string>,
  scenarioDataRow: Record<string, string>,
  scenarioOverrides: Record<string, string>,
  dataSource: 'SCENARIO' | 'SUITE',
  ctx: SuiteRunContext,
  sharedRuntimeVars: Record<string, string>,
  sharedDynamicCaches: Record<string, string>,
): Promise<RunResult> {
  const { payload, logger, signal, uiExecutor, deps, onEnvVarExtracted } = ctx;
  logger.log({ stepId: `suite-${suite.id}`, status: 'INFO', message: `📦 Executing Suite: ${suite.name}` });

  const suiteDefaults = (suite.variables || []).reduce(
    (acc, v) => ({ ...acc, [v.key]: v.value }),
    {} as Record<string, string>,
  );

  let dataRows = suite.dataRows && suite.dataRows.length > 0 ? suite.dataRows : [{}];

  if (dataSource === 'SCENARIO') {
    dataRows = [{}];
  }

  const totalCases = suite.cases.length * dataRows.length;
  let passedCases = 0;
  let failedCases = 0;
  let completedCases = 0;

  for (let rowIdx = 0; rowIdx < dataRows.length; rowIdx++) {
    const rowData = dataRows[rowIdx];
    if (dataRows.length > 1) {
      logger.log({
        stepId: `data-row-${rowIdx}`,
        status: 'INFO',
        message: `📊 Data Row ${rowIdx + 1}/${dataRows.length}`,
      });
    }

    const context = deps.createContext({
      environmentVariables: payload.environmentVariables,
      dynamicVariables: payload.dynamicVariables,
      dynamicVariableConfigs: payload.dynamicVariableConfigs,
      suiteVariables: suiteDefaults,
      suiteDataRow: rowData,
      scenarioVariables,
      scenarioDataRow,
      scenarioOverrides,
    });
    context.setCurrentContext(scenarioName, suite.name, null);

    context.setSharedRuntimeVars(sharedRuntimeVars);
    context.setDynamicVariableCaches(sharedDynamicCaches);

    let suiteAborted = false;

    try {
      context.onVariableSet((key, value, scope) => {
        logger.log({
          stepId: context.getCurrentStep() || 'var-set',
          status: 'INFO',
          level: 'info',
          message: `✨ Variable Set: ${key} = ${value} (${scope})`,
        });
      });

      if (signal.aborted) throw new Error('Execution aborted');

      if (suite.setupSteps && suite.setupSteps.length > 0) {
        logger.log({ stepId: 'suite-setup', status: 'INFO', message: '⚙️ Running Suite Setup Steps' });
        await executeSteps(suite.setupSteps, context, payload, logger, signal, uiExecutor, deps, 0, onEnvVarExtracted);
      }

      for (const testCase of suite.cases) {
        if (signal.aborted) throw new Error('Execution aborted');

        context.setCurrentContext(scenarioName, suite.name, testCase.name);

        logger.log({
          stepId: `case-${testCase.id}`,
          status: 'INFO',
          message: `  🧪 Running Case: ${testCase.name}`,
        });

        let casePassed = true;
        let caseErr: unknown = null;
        try {
          if (testCase.setupSteps && testCase.setupSteps.length > 0) {
            await executeSteps(testCase.setupSteps, context, payload, logger, signal, uiExecutor, deps, 1);
          }
          await executeSteps(testCase.steps, context, payload, logger, signal, uiExecutor, deps, 1);
        } catch (error) {
          casePassed = false;
          caseErr = error;
          const msg = error instanceof Error ? error.message : String(error);
          logger.log({
            stepId: `case-${testCase.id}-fail`,
            status: 'FAIL',
            message: `  ❌ Case Failed: ${msg}`,
          });
        } finally {
          try {
            if (testCase.teardownSteps && testCase.teardownSteps.length > 0) {
              await executeSteps(testCase.teardownSteps, context, payload, logger, signal, uiExecutor, deps, 1, onEnvVarExtracted);
            }
          } catch (teardownError) {
            logger.log({
              stepId: `case-${testCase.id}-teardown`,
              status: 'FAIL',
              message: `  ⚠️ Teardown Error: ${teardownError instanceof Error ? teardownError.message : String(teardownError)}`,
            });
          }
          context.clearCaseVars();
        }

        if (casePassed) passedCases++;
        else failedCases++;

        if (isAssertionFailure(caseErr)) {
          const remaining = suite.cases.length - completedCases - 1;
          suiteAborted = true;
          if (remaining > 0) {
            logger.log({
              stepId: `suite-${suite.id}-abort`,
              status: 'FAIL',
              message: ` ⏹️ Stopping suite: ${remaining} remaining case(s) skipped (fail-fast)`,
            });
          }
          break;
        }

        completedCases++;
        logger.progress({
          completed: completedCases,
          total: totalCases,
          percent: Math.round((completedCases / totalCases) * 100),
        });
      }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.log({
      stepId: `suite-${suite.id}-fail`,
      status: 'FAIL',
      message: `❌ Suite Failed: ${msg}`,
    });
    failedCases += suite.cases.length - completedCases;
    if (isAssertionFailure(error)) {
      suiteAborted = true;
    }
  } finally {
      try {
        if (suite.teardownSteps && suite.teardownSteps.length > 0) {
          logger.log({ stepId: 'suite-teardown', status: 'INFO', message: '🧹 Running Suite Teardown Steps' });
          await executeSteps(suite.teardownSteps, context, payload, logger, signal, uiExecutor, deps, 0, onEnvVarExtracted);
        }
      } catch (teardownError) {
        logger.log({
          stepId: 'suite-teardown',
          status: 'FAIL',
          message: `⚠️ Suite Teardown Error: ${teardownError instanceof Error ? teardownError.message : String(teardownError)}`,
        });
      }

      Object.assign(sharedDynamicCaches, context.getDynamicVariableCaches());
      context.clearSuiteVars();
      context.removeOnVariableSet();
    }

    if (suiteAborted) {
      const err = new Error(`Suite aborted by fail-fast assertion: ${suite.name}`);
      (err as any).isAssertionFailure = true;
      throw err;
    }
  }

  const allPassed = failedCases === 0;
  return {
    reportId: '',
    status: allPassed ? 'COMPLETED' : 'FAILED',
    passRate: totalCases > 0 ? Math.min(100, Math.round((passedCases / totalCases) * 100)) : 100,
    totalCases,
    passedCases,
    failedCases,
    durationMs: 0,
  };
}
