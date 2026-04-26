import type { Project, TestSuite, TestStep, DynamicVariable, ExecutionRequest } from '../contracts/index.ts';
import type { IExecutionLogger, TaskPayload, RunResult, IVariableContext, IUiExecutor, IApiStepExecutor } from '../contracts/index.ts';

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

const MAX_MODULE_DEPTH = 20;

// RunResult is imported from contracts

// ─── Case Execution ───

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

  // Log variable sets
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
    // Suite setup
    if (suite.setupSteps && suite.setupSteps.length > 0) {
      logger.log({ stepId: 'suite-setup', status: 'INFO', message: '⚙️ Running Suite Setup Steps' });
      await executeSteps(suite.setupSteps, context, payload, logger, signal, uiExecutor, deps, 0, onEnvVarExtracted);
    }

    // Case setup
    if (testCase.setupSteps && testCase.setupSteps.length > 0) {
      logger.log({ stepId: 'case-setup', status: 'INFO', message: '⚙️ Running Case Setup Steps' });
      await executeSteps(testCase.setupSteps, context, payload, logger, signal, uiExecutor, deps, 0, onEnvVarExtracted);
    }

    // Main steps
    await executeSteps(testCase.steps, context, payload, logger, signal, uiExecutor, deps, 0, onEnvVarExtracted);

  } catch (error) {
    passed = false;
    const msg = error instanceof Error ? error.message : String(error);
    logger.log({ stepId: 'case-fail', status: 'FAIL', message: `❌ Case Failed: ${msg}` });
  } finally {
    try {
      // Case teardown
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
      // Suite teardown
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

// ─── Suite Execution ───

export async function executeSuite(
  payload: TaskPayload,
  logger: IExecutionLogger,
  signal: AbortSignal,
  uiExecutor: IUiExecutor,
  deps: ExecutorDeps,
  onEnvVarExtracted?: (name: string, value: string) => void,
): Promise<RunResult> {
  const suite = payload.suite || payload.suites?.find(s => s.id === payload.request.suiteId);
  if (!suite) throw new Error(`Suite ${payload.request.suiteId} not found`);

  return await runSuiteWithContext(
    suite,
    null, // scenarioName
    {}, // scenarioVariables
    {}, // scenarioDataRow
    {}, // scenarioOverrides
    'SUITE', payload, logger, signal, uiExecutor, deps, {}, // sharedRuntimeVars
    {}, // sharedDynamicCaches
    onEnvVarExtracted
  );
}

async function runSuiteWithContext(
  suite: TestSuite,
  scenarioName: string | null,
  scenarioVariables: Record<string, string>,
  scenarioDataRow: Record<string, string>,
  scenarioOverrides: Record<string, string>,
  dataSource: 'SCENARIO' | 'SUITE',
  payload: TaskPayload,
  logger: IExecutionLogger,
  signal: AbortSignal,
  uiExecutor: IUiExecutor,
  deps: ExecutorDeps,
  sharedRuntimeVars: Record<string, string>,
  sharedDynamicCaches: Record<string, string>,
  onEnvVarExtracted?: (name: string, value: string) => void,
): Promise<RunResult> {
  logger.log({ stepId: `suite-${suite.id}`, status: 'INFO', message: `📦 Executing Suite: ${suite.name}` });

  const suiteDefaults = (suite.variables || []).reduce(
    (acc, v) => ({ ...acc, [v.key]: v.value }),
    {} as Record<string, string>,
  );

  let dataRows = suite.dataRows && suite.dataRows.length > 0 ? suite.dataRows : [{}];

  // If scenario-driven, we ignore the suite's internal data rows to prevent unwanted multiplication
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

    // Log variable sets
    context.onVariableSet((key, value, scope) => {
      logger.log({
        stepId: context.getCurrentStep() || 'var-set',
        status: 'INFO',
        level: 'info',
        message: `✨ Variable Set: ${key} = ${value} (${scope})`,
      });
    });

    // Inject shared runtime variables (e.g. EXTRACT_VAR results) to carry across suites in a scenario iteration
    context.setSharedRuntimeVars(sharedRuntimeVars);
    // Inject shared dynamic caches (e.g. ONCE_PER_SCENARIO)
    context.setDynamicVariableCaches(sharedDynamicCaches);

    try {
      if (signal.aborted) throw new Error('Execution aborted');

      // Suite setup
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
        try {
          if (testCase.setupSteps && testCase.setupSteps.length > 0) {
            await executeSteps(testCase.setupSteps, context, payload, logger, signal, uiExecutor, deps, 1);
          }
          await executeSteps(testCase.steps, context, payload, logger, signal, uiExecutor, deps, 1);
        } catch (error) {
          casePassed = false;
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

      // Capture updated caches (especially ONCE_PER_SCENARIO)
      Object.assign(sharedDynamicCaches, context.getDynamicVariableCaches());
      // Clear suite-scoped caches
      context.clearSuiteVars();
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

// ─── Plan Execution ───

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

      // A fresh runtime context per scenario iteration to share variables between suites
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

        const suiteResult = await runSuiteWithContext(
          suite,
          scenario.name,
          scenarioVariables,
          scenarioRow,
          scenarioSuite.variableOverrides || {}, scenarioSuite.dataSource || 'SCENARIO', payload, logger, signal, uiExecutor, deps, sharedRuntimeVars, sharedDynamicCaches,
          onEnvVarExtracted
        );

        totalCases += suiteResult.totalCases;
        passedCases += suiteResult.passedCases;
        failedCases += suiteResult.failedCases;
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

// ─── Scenario Execution ───

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

    // A fresh runtime context per scenario iteration to share variables between suites
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

      const suiteResult = await runSuiteWithContext(
        suite,
        scenario.name,
        scenarioVariables,
        scenarioRow,
        scenarioSuite.variableOverrides || {}, scenarioSuite.dataSource || 'SCENARIO', payload, logger, signal, uiExecutor, deps, sharedRuntimeVars, sharedDynamicCaches,
        onEnvVarExtracted
      );

      totalCases += suiteResult.totalCases;
      passedCases += suiteResult.passedCases;
      failedCases += suiteResult.failedCases;
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

// ─── Step Execution Loop ───

async function executeSteps(
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

    // Track current step ID in context for variable capture logging
    context.setCurrentStep(step.id);
    if (step.enabled === false) {
      logger.log({
        stepId: step.id,
        status: 'SKIP',
        message: `${indent}⏭️ Step Skipped (disabled): ${step.action}`
      });
      continue;
    }

    // ─── RUN_MODULE ───
    if (step.action === 'RUN_MODULE') {
      if (depth >= MAX_MODULE_DEPTH) {
        throw new Error(`Max module depth (${MAX_MODULE_DEPTH}) exceeded — possible infinite recursion`);
      }

      const moduleId = step.target;
      const module = payload.project.modules?.find(m => m.id === moduleId);

      if (!module) {
        logger.log({ stepId: step.id, status: 'FAIL', message: `${indent}❌ Module Not Found: ${moduleId}` });
        throw new Error(`Module ${moduleId} not found`);
      }

      logger.log({ stepId: step.id, status: 'RUNNING', message: `${indent}📦 Executing Module: ${module.name}` });

      const moduleDefaults: Record<string, string> = {};
      for (const p of module.params || []) {
        moduleDefaults[p.name] = p.defaultValue || '';
      }

      let overrides: Record<string, string> = {};
      try {
        if (step.data) overrides = JSON.parse(step.data);
      } catch {
        // Not JSON — ignore
      }

      const childContext = context.createChildContext(moduleDefaults, overrides);
      await executeSteps(module.steps || [], childContext, payload, logger, signal, uiExecutor, deps, depth + 1, onEnvVarExtracted);

      // Merge extracted variables back into the parent context, applying the namespace if provided
      context.mergeChildExtractedVars(childContext, step.namespace);

      logger.log({ stepId: step.id, status: 'PASS', message: `${indent}✅ Module Completed: ${module.name}` });
      continue;
    }

    // ─── WAIT ───
    if (step.action.trim().toUpperCase() === 'WAIT') {
      const ms = parseInt(context.interpolate(step.data || '1000'), 10) || 1000;
      logger.log({ stepId: step.id, status: 'RUNNING', message: `${indent}⏳ Waiting ${ms}ms` });
      await new Promise(resolve => setTimeout(resolve, ms));
      logger.log({ stepId: step.id, status: 'PASS', message: `${indent}✅ Wait completed` });
      continue;
    }

    // ─── API Steps ───
    if (step.action.startsWith('API_')) {
      const resolvedTarget = context.interpolate(step.target || '');
      logger.log({
        stepId: step.id,
        status: 'RUNNING',
        level: 'info',
        message: `${indent}🌐 [${step.action}] ${resolvedTarget}`,
      });

      let result: any = undefined;
      try {
        result = await deps.executeApiStep(step, context, payload.assets, payload.request.environment, logger, indent, onEnvVarExtracted);

        const isSuccess = result.status >= 200 && result.status < 400;
        const bodyPreview = result.body.length > 200 ? result.body.slice(0, 200) + '…' : result.body;

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

        // Log assertions and extractions after the main API log
        if (logger) {
          result.assertionLogs.forEach(log => logger.log({ ...log, stepId: step.id }));
          result.extractionLogs.forEach(log => logger.log({ ...log, stepId: step.id }));
        }

        const anyAssertionFailed = result.assertionLogs.some(log => log.status === 'FAIL');

        if (!isSuccess) {
          throw new Error(`API request failed: ${result.status} ${result.statusText}`);
        }

        if (anyAssertionFailed) {
          // Find the first failure message and throw it
          const failureLog = result.assertionLogs.find(log => log.status === 'FAIL');
          const err = new Error(failureLog?.message.trim().replace(/^❌\s*/, '') || 'Assertion Failed');
          (err as any).isAssertionFailure = true;
          throw err;
        }

      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);

        // If it's an API request failure or Assertion failure, we've already logged the details
        // We just need to throw to stop execution
        if (error instanceof Error && (msg.startsWith('API request failed:') || (error as any).isAssertionFailure)) {
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
      continue;
    }

    // ─── UI Steps ───
    let uiResult: any = undefined;
    try {
      // Lazy init Playwright
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
      if (step.action.startsWith('ASSERT_') && uiResult.assertionDetails) {
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

      // Log UI logs (Smart Wait assertions, etc.) after the main UI log
      if (logger && uiResult.logs) {
        uiResult.logs.forEach(log => logger.log({ ...log, stepId: step.id }));
      }

      const anySmartWaitFailed = uiResult.logs?.some((l: any) => l.status === 'FAIL' && l.message.includes('Smart Wait Assertion Failed'));
      if (anySmartWaitFailed) {
        const failure = uiResult.logs.find((l: any) => l.status === 'FAIL' && l.message.includes('Smart Wait Assertion Failed'));
        const err = new Error(failure?.message.trim().replace(/^❌\s*/, '') || 'Smart Wait Assertion Failed');
        (err as any).isAssertionFailure = true;
        throw err;
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);

      // If it's an assertion failure, we've already logged the details (Smart Wait etc.)
      // We just need to throw to stop execution
      if (error instanceof Error && (error as any).isAssertionFailure) {
        throw error;
      }

      // Try to capture error state screenshot
      const failScreenshot = await uiExecutor.captureStateScreenshot();

      let logMessage = `${indent}❌ UI Action Failed: ${msg}`;
      if (step.action.startsWith('ASSERT_') && (error as any).assertionDetails) {
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
}
