import type { TestScenario, RunResult } from '../contracts/index.ts';
import type { SuiteRunContext, ExecutorDeps } from './types.ts';
import { isAssertionFailure } from './types.ts';
import type { TaskPayload, IExecutionLogger, IUiExecutor } from '../contracts/index.ts';
import { runSuiteWithContext } from './suite-executor.ts';

export async function executeScenario(
  payload: TaskPayload,
  logger: IExecutionLogger,
  signal: AbortSignal,
  uiExecutor: IUiExecutor,
  deps: ExecutorDeps,
  onEnvVarExtracted?: (name: string, value: string) => void,
): Promise<RunResult> {
  const scenario = payload.project.scenarios?.find(s => s.id === payload.request.scenarioId);
  if (!scenario) throw new Error(`Scenario ${payload.request.scenarioId} not found`);

  const ctx: SuiteRunContext = { payload, logger, signal, uiExecutor, deps, onEnvVarExtracted };
  return runScenario(scenario, ctx);
}

export async function runScenario(
  scenario: TestScenario,
  ctx: SuiteRunContext,
): Promise<RunResult> {
  const { payload, logger, signal, onEnvVarExtracted } = ctx;

  logger.log({
    stepId: 'scenario',
    status: 'INFO',
    message: `🎬 Executing Scenario: ${scenario.name}`,
  });

  let totalCases = 0;
  let passedCases = 0;
  let failedCases = 0;

  const scenarioVariables = (scenario.variables || []).reduce(
    (acc, v) => ({ ...acc, [v.key]: v.value }),
    {} as Record<string, string>
  );

  const scenarioDataRows = scenario.dataRows && scenario.dataRows.length > 0 ? scenario.dataRows : [{}];

  for (let sRowIdx = 0; sRowIdx < scenarioDataRows.length; sRowIdx++) {
    if (signal.aborted) throw new Error('Execution aborted');

    const scenarioRow = scenarioDataRows[sRowIdx];
    if (scenarioDataRows.length > 1) {
      logger.log({
        stepId: `scenario-row-${sRowIdx}`,
        status: 'INFO',
        message: `🔄 Scenario Iteration ${sRowIdx + 1}/${scenarioDataRows.length}`,
      });
    }

    const sharedRuntimeVars: Record<string, string> = {};
    const sharedDynamicCaches: Record<string, string> = {};

    for (const scenarioSuite of scenario.suites || []) {
      if (signal.aborted) throw new Error('Execution aborted');

      const suite = payload.suite || payload.suites?.find(s => s.id === scenarioSuite.suiteId);
      if (!suite) {
        logger.log({
          stepId: `ss-${scenarioSuite.id}`,
          status: 'FAIL',
          message: `❌ Suite ${scenarioSuite.suiteId} not found`,
        });
        continue;
      }

      try {
        const suiteResult = await runSuiteWithContext(
          suite,
          scenario.name,
          scenarioVariables,
          scenarioRow,
          scenarioSuite.variableOverrides || {},
          scenarioSuite.dataSource || 'SCENARIO',
          ctx,
          sharedRuntimeVars,
          sharedDynamicCaches,
        );

        totalCases += suiteResult.totalCases;
        passedCases += suiteResult.passedCases;
        failedCases += suiteResult.failedCases;
      } catch (suiteError) {
        if (isAssertionFailure(suiteError)) {
          logger.log({
            stepId: `scenario-${scenario.id}-abort`,
            status: 'FAIL',
            message: `⏹️ Stopping scenario: suite aborted by fail-fast assertion`,
          });
          throw suiteError;
        }
        logger.log({
          stepId: `ss-${scenarioSuite.id}`,
          status: 'FAIL',
          message: `❌ Suite ${suite.name} failed: ${suiteError instanceof Error ? suiteError.message : String(suiteError)}`,
        });
        failedCases += suite.cases.length;
        totalCases += suite.cases.length;
      }
    }
  }

  const allPassed = failedCases === 0;
  logger.log({
    stepId: 'scenario-finish',
    status: allPassed ? 'PASS' : 'FAIL',
    message: allPassed
      ? `🏁 Scenario Completed Successfully (${passedCases}/${totalCases} passed)`
      : `🏁 Scenario Completed with Failures (${passedCases}/${totalCases} passed)`,
  });

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
