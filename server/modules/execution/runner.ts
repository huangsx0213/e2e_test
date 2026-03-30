import type {
  TestStep,
  TestSuite,
  TestCase,
  TestScenario,
  Project,
  HeaderProfile,
  BodyTemplate,
  ApiEndpoint,
  ExecutionRequest,
  ExecutionRunStatus,
} from '../../shared/contracts/index.ts';
import { projectRepository } from '../projects/repository.ts';
import { suiteRepository } from '../suites/repository.ts';
import { headerRepository } from '../headers/repository.ts';
import { bodyRepository } from '../bodies/repository.ts';
import { endpointRepository } from '../endpoints/repository.ts';
import { reportRepository } from '../reports/repository.ts';
import { ExecutionContext } from './context.ts';
import { executeApiStep, type ApiAssets } from './api-executor.ts';
import { ExecutionLogger } from './logger.ts';
import { db } from '../../shared/db/client.ts';
import { randomId } from '../../shared/utils/index.ts';
import { UIExecutor } from './ui-executor.ts';
import { settingsRepository } from '../settings/repository.ts';

const MAX_MODULE_DEPTH = 20;

interface RunResult {
  reportId: string;
  status: 'COMPLETED' | 'FAILED' | 'ABORTED';
  passRate: number;
  totalCases: number;
  passedCases: number;
  failedCases: number;
  durationMs: number;
}

// ─── Active Run Registry (single-queue) ───

let activeRun: { id: string; abortController: AbortController } | null = null;
const loggerRegistry = new Map<string, ExecutionLogger>();

export function getActiveRunLogger(reportId: string): ExecutionLogger | undefined {
  return loggerRegistry.get(reportId);
}

export function isRunActive(): boolean {
  return activeRun !== null;
}

export function abortActiveRun(): boolean {
  if (!activeRun) return false;
  activeRun.abortController.abort();
  return true;
}

// ─── Main Entry Point ───

export async function startExecution(request: ExecutionRequest): Promise<{ reportId: string; runId: string }> {
  if (activeRun) {
    throw new Error('An execution is already running. Please wait for it to finish or abort it.');
  }

  const runId = randomId('run');
  const reportId = randomId('report');
  const abortController = new AbortController();

  // Create execution_run record
  db.prepare(`
    INSERT INTO execution_runs (id, report_id, type, project_id, environment, suite_id, case_id, scenario_id, status, started_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'RUNNING', ?)
  `).run(
    runId,
    reportId,
    request.type,
    request.projectId,
    request.environment,
    request.suiteId || null,
    request.caseId || null,
    request.scenarioId || null,
    Date.now(),
  );

  const logger = new ExecutionLogger(reportId);
  loggerRegistry.set(reportId, logger);
  activeRun = { id: runId, abortController };

  // Run asynchronously — don't block the HTTP response
  executeRunAsync(request, runId, reportId, logger, abortController.signal).catch(() => {
    // Errors are handled inside executeRunAsync
  });

  return { reportId, runId };
}

// ─── Async Execution ───

async function executeRunAsync(
  request: ExecutionRequest,
  runId: string,
  reportId: string,
  logger: ExecutionLogger,
  signal: AbortSignal,
): Promise<void> {
  const startTime = Date.now();
  let result: RunResult;
  const uiExecutor = new UIExecutor();

  try {
    // Load all required data from DB
    const project = projectRepository.get(request.projectId);
    if (!project) throw new Error(`Project ${request.projectId} not found`);

    const assets: ApiAssets = {
      headers: headerRepository.list().filter(h => h.projectId === request.projectId),
      bodies: bodyRepository.list().filter(b => b.projectId === request.projectId),
      endpoints: endpointRepository.list().filter(e => e.projectId === request.projectId),
    };

    logger.log({
      stepId: 'init',
      status: 'INFO',
      message: `🚀 Starting execution (${request.type}) in environment: ${request.environment}`,
    });

    if (request.type === 'case') {
      result = await executeSingleCase(request, project, assets, logger, signal, uiExecutor);
    } else if (request.type === 'suite') {
      result = await executeSuite(request, project, assets, logger, signal, uiExecutor);
    } else {
      result = await executeScenario(request, project, assets, logger, signal, uiExecutor);
    }

    result.reportId = reportId;
    result.durationMs = Date.now() - startTime;

  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const isAborted = signal.aborted;

    logger.log({
      stepId: 'error',
      status: 'FAIL',
      message: isAborted ? '⛔ Execution aborted by user' : `❌ Execution failed: ${message}`,
    });

    result = {
      reportId,
      status: isAborted ? 'ABORTED' : 'FAILED',
      passRate: 0,
      totalCases: 0,
      passedCases: 0,
      failedCases: 0,
      durationMs: Date.now() - startTime,
    };
  }

  // ─── Finalize ───
  const endTime = Date.now();

  await uiExecutor.cleanup();

  // Persist report
  reportRepository.save({
    id: reportId,
    suiteId: request.suiteId || request.scenarioId || request.projectId,
    suiteName: `Execution: ${request.type}`,
    environment: request.environment,
    startTime,
    endTime,
    status: result.status,
    passRate: result.passRate,
    totalCases: result.totalCases,
    passedCases: result.passedCases,
    failedCases: result.failedCases,
    logs: logger.getLogs().map(l => ({
      stepId: l.stepId,
      timestamp: l.timestamp,
      status: l.status,
      message: l.message,
      screenshot: l.screenshot,
    })),
  });

  // Update execution_run record
  db.prepare(`
    UPDATE execution_runs SET status = ?, finished_at = ?, error_message = ?
    WHERE id = ?
  `).run(
    result.status,
    endTime,
    result.status === 'FAILED' ? 'See report logs' : null,
    runId,
  );

  // Push final SSE event
  logger.complete({
    reportId,
    status: result.status,
    passRate: result.passRate,
  });

  // Cleanup
  loggerRegistry.delete(reportId);
  activeRun = null;
}

// ─── Case Execution ───

async function executeSingleCase(
  request: ExecutionRequest,
  project: Project,
  assets: ApiAssets,
  logger: ExecutionLogger,
  signal: AbortSignal,
  uiExecutor: UIExecutor,
): Promise<RunResult> {
  const suite = suiteRepository.get(request.suiteId!);
  if (!suite) throw new Error(`Suite ${request.suiteId} not found`);

  const testCase = suite.cases.find(c => c.id === request.caseId);
  if (!testCase) throw new Error(`Case ${request.caseId} not found`);

  const suiteDefaults = (suite.variables || []).reduce(
    (acc, v) => ({ ...acc, [v.key]: v.value }),
    {} as Record<string, string>,
  );
  const firstRowData = suite.dataRows && suite.dataRows.length > 0 ? suite.dataRows[0] : {};

  const context = ExecutionContext.create({
    suiteVariables: suiteDefaults,
    dataRowValues: firstRowData,
  });

  logger.log({ stepId: 'env', status: 'INFO', message: `🔧 Environment: ${request.environment}` });
  logger.log({ stepId: `case-${testCase.id}`, status: 'INFO', message: `🧪 Running Case: ${testCase.name}` });

  let passed = true;
  try {
    // Suite setup
    if (suite.setupSteps && suite.setupSteps.length > 0) {
      logger.log({ stepId: 'suite-setup', status: 'INFO', message: '⚙️ Running Suite Setup Steps' });
      await executeSteps(suite.setupSteps, context, project, assets, request.environment, logger, signal, uiExecutor, 0);
    }

    // Case setup
    if (testCase.setupSteps && testCase.setupSteps.length > 0) {
      logger.log({ stepId: 'case-setup', status: 'INFO', message: '⚙️ Running Case Setup Steps' });
      await executeSteps(testCase.setupSteps, context, project, assets, request.environment, logger, signal, uiExecutor, 0);
    }

    // Main steps
    await executeSteps(testCase.steps, context, project, assets, request.environment, logger, signal, uiExecutor, 0);

    // Case teardown
    if (testCase.teardownSteps && testCase.teardownSteps.length > 0) {
      logger.log({ stepId: 'case-teardown', status: 'INFO', message: '🧹 Running Case Teardown Steps' });
      await executeSteps(testCase.teardownSteps, context, project, assets, request.environment, logger, signal, uiExecutor, 0);
    }

    // Suite teardown
    if (suite.teardownSteps && suite.teardownSteps.length > 0) {
      logger.log({ stepId: 'suite-teardown', status: 'INFO', message: '🧹 Running Suite Teardown Steps' });
      await executeSteps(suite.teardownSteps, context, project, assets, request.environment, logger, signal, uiExecutor, 0);
    }

  } catch (error) {
    passed = false;
    const msg = error instanceof Error ? error.message : String(error);
    logger.log({ stepId: 'case-fail', status: 'FAIL', message: `❌ Case Failed: ${msg}` });
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

async function executeSuite(
  request: ExecutionRequest,
  project: Project,
  assets: ApiAssets,
  logger: ExecutionLogger,
  signal: AbortSignal,
  uiExecutor: UIExecutor,
): Promise<RunResult> {
  const suite = suiteRepository.get(request.suiteId!);
  if (!suite) throw new Error(`Suite ${request.suiteId} not found`);

  return await runSuiteWithContext(suite, {}, project, assets, request.environment, logger, signal, uiExecutor);
}

async function runSuiteWithContext(
  suite: TestSuite,
  scenarioOverrides: Record<string, string>,
  project: Project,
  assets: ApiAssets,
  environment: string,
  logger: ExecutionLogger,
  signal: AbortSignal,
  uiExecutor: UIExecutor,
): Promise<RunResult> {
  logger.log({ stepId: `suite-${suite.id}`, status: 'INFO', message: `📦 Executing Suite: ${suite.name}` });

  const suiteDefaults = (suite.variables || []).reduce(
    (acc, v) => ({ ...acc, [v.key]: v.value }),
    {} as Record<string, string>,
  );

  const dataRows = suite.dataRows && suite.dataRows.length > 0 ? suite.dataRows : [{}];
  const totalCases = suite.cases.length * dataRows.length;
  let passedCases = 0;
  let failedCases = 0;
  let completedCases = 0;

  for (let rowIdx = 0; rowIdx < dataRows.length; rowIdx++) {
    if (signal.aborted) throw new Error('Execution aborted');

    const rowData = dataRows[rowIdx];
    if (dataRows.length > 1) {
      logger.log({
        stepId: `data-row-${rowIdx}`,
        status: 'INFO',
        message: `📊 Data Row ${rowIdx + 1}/${dataRows.length}`,
      });
    }

    const context = ExecutionContext.create({
      suiteVariables: suiteDefaults,
      scenarioOverrides,
      dataRowValues: rowData,
    });

    // Suite setup
    if (suite.setupSteps && suite.setupSteps.length > 0) {
      logger.log({ stepId: 'suite-setup', status: 'INFO', message: '⚙️ Running Suite Setup Steps' });
      await executeSteps(suite.setupSteps, context, project, assets, environment, logger, signal, uiExecutor, 0);
    }

    for (const testCase of suite.cases) {
      if (signal.aborted) throw new Error('Execution aborted');

      logger.log({
        stepId: `case-${testCase.id}`,
        status: 'INFO',
        message: `  🧪 Running Case: ${testCase.name}`,
      });

      let casePassed = true;
      try {
        if (testCase.setupSteps && testCase.setupSteps.length > 0) {
          await executeSteps(testCase.setupSteps, context, project, assets, environment, logger, signal, uiExecutor, 1);
        }
        await executeSteps(testCase.steps, context, project, assets, environment, logger, signal, uiExecutor, 1);
        if (testCase.teardownSteps && testCase.teardownSteps.length > 0) {
          await executeSteps(testCase.teardownSteps, context, project, assets, environment, logger, signal, uiExecutor, 1);
        }
      } catch (error) {
        casePassed = false;
        const msg = error instanceof Error ? error.message : String(error);
        logger.log({
          stepId: `case-${testCase.id}-fail`,
          status: 'FAIL',
          message: `  ❌ Case Failed: ${msg}`,
        });
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

    // Suite teardown
    if (suite.teardownSteps && suite.teardownSteps.length > 0) {
      logger.log({ stepId: 'suite-teardown', status: 'INFO', message: '🧹 Running Suite Teardown Steps' });
      await executeSteps(suite.teardownSteps, context, project, assets, environment, logger, signal, uiExecutor, 0);
    }
  }

  const allPassed = failedCases === 0;
  return {
    reportId: '',
    status: allPassed ? 'COMPLETED' : 'FAILED',
    passRate: totalCases > 0 ? Math.round((passedCases / totalCases) * 100) : 100,
    totalCases,
    passedCases,
    failedCases,
    durationMs: 0,
  };
}

// ─── Scenario Execution ───

async function executeScenario(
  request: ExecutionRequest,
  project: Project,
  assets: ApiAssets,
  logger: ExecutionLogger,
  signal: AbortSignal,
  uiExecutor: UIExecutor,
): Promise<RunResult> {
  const scenario = project.scenarios?.find(s => s.id === request.scenarioId);
  if (!scenario) throw new Error(`Scenario ${request.scenarioId} not found`);

  logger.log({
    stepId: 'scenario',
    status: 'INFO',
    message: `🎬 Executing Scenario: ${scenario.name}`,
  });

  let totalCases = 0;
  let passedCases = 0;
  let failedCases = 0;

  for (const scenarioSuite of scenario.suites || []) {
    if (signal.aborted) throw new Error('Execution aborted');

    const suite = suiteRepository.get(scenarioSuite.suiteId);
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
      scenarioSuite.variableOverrides || {},
      project,
      assets,
      request.environment,
      logger,
      signal,
      uiExecutor,
    );

    totalCases += suiteResult.totalCases;
    passedCases += suiteResult.passedCases;
    failedCases += suiteResult.failedCases;
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
    passRate: totalCases > 0 ? Math.round((passedCases / totalCases) * 100) : 100,
    totalCases,
    passedCases,
    failedCases,
    durationMs: 0,
  };
}

// ─── Step Execution Loop ───

async function executeSteps(
  steps: TestStep[],
  context: ExecutionContext,
  project: Project,
  assets: ApiAssets,
  environment: string,
  logger: ExecutionLogger,
  signal: AbortSignal,
  uiExecutor: UIExecutor,
  depth: number,
): Promise<void> {
  for (let i = 0; i < steps.length; i++) {
    if (signal.aborted) throw new Error('Execution aborted');

    const step = steps[i];
    const indent = '  '.repeat(depth);

    // ─── RUN_MODULE ───
    if (step.action === 'RUN_MODULE') {
      if (depth >= MAX_MODULE_DEPTH) {
        throw new Error(`Max module depth (${MAX_MODULE_DEPTH}) exceeded — possible infinite recursion`);
      }

      const moduleId = step.target;
      const module = project.modules?.find(m => m.id === moduleId);

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
      await executeSteps(module.steps || [], childContext, project, assets, environment, logger, signal, uiExecutor, depth + 1);

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
        message: `${indent}🌐 [${step.action}] ${resolvedTarget}`,
      });

      try {
        const result = await executeApiStep(step, context, assets, environment);

        const isSuccess = result.status >= 200 && result.status < 400;
        const bodyPreview = result.body.length > 200 ? result.body.slice(0, 200) + '…' : result.body;

        logger.log({
          stepId: step.id,
          status: isSuccess ? 'PASS' : 'FAIL',
          message: `${indent}${isSuccess ? '✅' : '❌'} ${result.resolvedMethod} ${result.resolvedUrl} → ${result.status} ${result.statusText} (${result.durationMs}ms)`,
          details: {
            httpStatus: result.status,
            responseBody: bodyPreview,
            responseHeaders: result.headers,
            durationMs: result.durationMs,
          },
        });

        if (!isSuccess) {
          throw new Error(`API request failed: ${result.status} ${result.statusText}`);
        }

        // Store response body as runtime variable if step has EXTRACT_VAR-like intent
        // Users can reference the last API response via {{__RESPONSE_BODY__}}
        context.setRuntimeVar('__RESPONSE_BODY__', result.body);
        context.setRuntimeVar('__RESPONSE_STATUS__', String(result.status));

      } catch (error) {
        if (error instanceof Error && error.message.startsWith('API request failed:')) {
          throw error;
        }
        const msg = error instanceof Error ? error.message : String(error);
        logger.log({
          stepId: step.id,
          status: 'FAIL',
          message: `${indent}❌ Request Error: ${msg}`,
        });
        throw error;
      }
      continue;
    }

    // ─── UI Steps ───
    try {
      // Lazy init Playwright
      const allSettings = settingsRepository.list();
      const settings = allSettings.find(s => s.currentProjectId === project.id) || allSettings[0];
      const isHeadless = settings ? settings.headlessMode !== false : true;

      await uiExecutor.initialize({ headless: isHeadless });

      const resolvedTarget = context.interpolate(step.target || '');
      logger.log({
        stepId: step.id,
        status: 'RUNNING',
        message: `${indent}💻 [${step.action}] ${resolvedTarget ? resolvedTarget + ' ' : ''}${step.data ? '(' + context.interpolate(step.data) + ')' : ''}`,
      });

      const uiResult = await uiExecutor.executeStep(step, context, project.pages || []);

      logger.log({
        stepId: step.id,
        status: 'PASS',
        message: `${indent}✅ [${step.action}] Completed (${uiResult.durationMs}ms)`,
        screenshot: uiResult.screenshot,
        details: uiResult.extractedValue ? { extractedValue: uiResult.extractedValue } : undefined,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      
      // Try to capture error state screenshot
      const failScreenshot = await uiExecutor.captureStateScreenshot();

      logger.log({
        stepId: step.id,
        status: 'FAIL',
        message: `${indent}❌ UI Action Failed: ${msg}`,
        screenshot: failScreenshot || undefined,
      });
      throw error;
    }
  }
}
