import type { TaskPayload, RunResult } from '../contracts/index.ts';
import type { IExecutionLogger, IUiExecutor } from '../contracts/index.ts';
import type { SuiteRunContext, ExecutorDeps } from './types.ts';
import { isAssertionFailure } from './types.ts';
import { runScenario } from './scenario-executor.ts';

export async function executePlan(
  payload: TaskPayload,
  logger: IExecutionLogger,
  signal: AbortSignal,
  uiExecutor: IUiExecutor,
  deps: ExecutorDeps,
  onEnvVarExtracted?: (name: string, value: string) => void,
): Promise<RunResult> {
  const plan = payload.project.plans?.find(p => p.id === payload.request.planId);
  if (!plan) throw new Error(`Plan ${payload.request.planId} not found`);

  const ctx: SuiteRunContext = { payload, logger, signal, uiExecutor, deps, onEnvVarExtracted };

  logger.log({
    stepId: 'plan',
    status: 'INFO',
    message: `📋 Executing Plan: ${plan.name}`,
  });

  let totalCases = 0;
  let passedCases = 0;
  let failedCases = 0;

  for (const planScenario of plan.scenarios || []) {
    if (signal.aborted) throw new Error('Execution aborted');

    const scenario = payload.project.scenarios?.find(s => s.id === planScenario.scenarioId);
    if (!scenario) {
      logger.log({
        stepId: `ps-${planScenario.id}`,
        status: 'FAIL',
        message: `❌ Scenario ${planScenario.scenarioId} not found`,
      });
      continue;
    }

    logger.log({
      stepId: `ps-${planScenario.id}`,
      status: 'INFO',
      message: `🎬 Executing Scenario: ${scenario.name}`,
    });

    try {
      const scenarioResult = await runScenario(scenario, ctx);

      totalCases += scenarioResult.totalCases;
      passedCases += scenarioResult.passedCases;
      failedCases += scenarioResult.failedCases;
    } catch (scenarioError) {
      if (isAssertionFailure(scenarioError)) {
        logger.log({
          stepId: `plan-${planScenario.id}-abort`,
          status: 'FAIL',
          message: `⏹️ Stopping plan: scenario aborted by fail-fast assertion`,
        });
        throw scenarioError;
      }
      logger.log({
        stepId: `ps-${planScenario.id}`,
        status: 'FAIL',
        message: `❌ Scenario ${scenario.name} failed: ${scenarioError instanceof Error ? scenarioError.message : String(scenarioError)}`,
      });
      // When a scenario fails without assertion abort, count all its suites' cases as failed
      for (const scenarioSuite of scenario.suites || []) {
        const suite = payload.suite || payload.suites?.find(s => s.id === scenarioSuite.suiteId);
        if (suite) {
          failedCases += suite.cases.length;
          totalCases += suite.cases.length;
        }
      }
    }
  }

  const allPassed = failedCases === 0;
  logger.log({
    stepId: 'plan-finish',
    status: allPassed ? 'PASS' : 'FAIL',
    message: allPassed
      ? `🏁 Plan Completed Successfully (${passedCases}/${totalCases} passed)`
      : `🏁 Plan Completed with Failures (${passedCases}/${totalCases} passed)`,
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
