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
  DynamicVariable,
  RunResult,
} from '../../shared/contracts/index.ts';
import { projectRepository } from '../projects/repository.ts';
import { suiteRepository } from '../suites/repository.ts';
import { headerRepository } from '../headers/repository.ts';
import { bodyRepository } from '../bodies/repository.ts';
import { endpointRepository } from '../endpoints/repository.ts';
import { reportRepository } from '../reports/repository.ts';
import { environmentRepository } from '../environments/repository.ts';
import { dynamicVariableRepository } from '../dynamic-variables/repository.ts';
import { ExecutionContext } from './context.ts';
import { interpolate } from '../../shared/utils/interpolate.ts';
import { executeApiStep, type ApiAssets } from './api-executor.ts';
import { ExecutionLogger } from './logger.ts';
import { db } from '../../shared/db/client.ts';
import { randomId } from '../../shared/utils/index.ts';
import { UIExecutor } from './ui-executor.ts';
import { executeSingleCase, executeSuite, executeScenario, executePlan, type ExecutorDeps } from '../../shared/core/executor.ts';
import type { TaskPayload, IVariableContext } from '../../shared/contracts/index.ts';
import { settingsRepository } from '../settings/repository.ts';
import { getActiveRunLogger, setActiveRunLogger, removeActiveRunLogger, isRunActive, registerRun, unregisterRun, abortActiveRun } from './run-registry.ts';

// ─── Main Entry Point ───

export async function startExecution(request: ExecutionRequest): Promise<{ reportId: string; runId: string }> {
  const isLocal = !request.agentId;
  if (isLocal && isRunActive()) {
    throw new Error('A local execution is already running. Please wait for it to finish or abort it.');
  }

  const runId = randomId('run');
  const reportId = randomId('report');
  const abortController = new AbortController();

  // Create execution_run record
  db.prepare(`
    INSERT INTO execution_runs (id, report_id, type, project_id, environment, suite_id, case_id, scenario_id, plan_id, status, started_at, agent_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'RUNNING', ?, ?)
  `).run(
    runId,
    reportId,
    request.type,
    request.projectId,
    request.environment,
    request.suiteId || null,
    request.caseId || null,
    request.scenarioId || null,
    request.planId || null,
    Date.now(),
    request.agentId || null
  );

  const logger = new ExecutionLogger(reportId);
  setActiveRunLogger(reportId, logger);
  registerRun(runId, { id: runId, abortController, isLocal });

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
  let displayName = `Execution: ${request.type}`;
  const uiExecutor = new UIExecutor();

    const deps: ExecutorDeps = {
      createContext: (options) => ExecutionContext.create(options) as IVariableContext,
      executeApiStep: (step, context, assets, environment, logger, indent, onEnvVarExtracted) =>
        executeApiStep(step, context as ExecutionContext, assets, environment, logger, indent, onEnvVarExtracted),
    };

  try {
    // Load all required data from DB
    const project = projectRepository.get(request.projectId);
    if (!project) throw new Error(`Project ${request.projectId} not found`);

    const assets: ApiAssets = {
      headers: headerRepository.list().filter(h => h.projectId === request.projectId),
      bodies: bodyRepository.list().filter(b => b.projectId === request.projectId),
      endpoints: endpointRepository.list().filter(e => e.projectId === request.projectId),
    };

    const environmentVariables = environmentRepository.getVariables(request.environment);

    const dynamicVarsList = await dynamicVariableRepository.findByProjectId(request.projectId);
    const dynamicVariables: Record<string, string> = {};
    const dynamicVariableConfigs: Record<string, DynamicVariable> = {};
    for (const v of dynamicVarsList) {
      dynamicVariableConfigs[v.name] = v;
      if (v.evaluationStrategy === 'ONCE_PER_RUN') {
        dynamicVariables[v.name] = interpolate(v.expression, dynamicVariables);
      } else {
        dynamicVariables[v.name] = v.expression;
      }
    }

    // Hydrate settings
    const settingsList = settingsRepository.list();
    const settings = settingsList.find(s => s.currentProjectId === project.id) || settingsList[0];

    // Precise Suite Loading: only send what is actually needed for this run
    let suites = [];
    if (request.type === 'plan') {
      const plan = project.plans?.find(p => p.id === request.planId);
      const requiredSuiteIds = new Set<string>();
      plan?.scenarios?.forEach(ps => {
        const scenario = project.scenarios?.find(s => s.id === ps.scenarioId);
        scenario?.suites?.forEach(ss => requiredSuiteIds.add(ss.suiteId));
      });
      suites = suiteRepository.list().filter(s => requiredSuiteIds.has(s.id));
    } else if (request.type === 'scenario') {
      const scenario = project.scenarios?.find(s => s.id === request.scenarioId);
      const requiredSuiteIds = new Set((scenario?.suites || []).map(ss => ss.suiteId));
      suites = suiteRepository.list().filter(s => requiredSuiteIds.has(s.id));
    }

    // ─── Resolve Name & Prepare Payload ───
    if (request.type === 'case') {
      const suite = suiteRepository.get(request.suiteId!);
      const testCase = suite?.cases.find(c => c.id === request.caseId);
      displayName = testCase ? testCase.name : `Case: ${request.caseId}`;
    } else if (request.type === 'suite') {
      const suite = suiteRepository.get(request.suiteId!);
      displayName = suite ? suite.name : `Suite: ${request.suiteId}`;
    } else if (request.type === 'scenario') {
      const scenario = project.scenarios?.find(s => s.id === request.scenarioId);
      displayName = scenario ? scenario.name : `Scenario: ${request.scenarioId}`;
    } else if (request.type === 'plan') {
      const plan = project.plans?.find(p => p.id === request.planId);
      displayName = plan ? plan.name : `Plan: ${request.planId}`;
    }

    const targetSuite = request.suiteId ? suiteRepository.get(request.suiteId) : undefined;

    const payload: TaskPayload = {
      runId,
      reportId,
      request,
      project,
      suite: targetSuite || undefined,
      suites: suites,
      assets,
      environmentVariables,
      dynamicVariables,
      dynamicVariableConfigs,
      settings: settings as any
    };

    logger.log({
      stepId: 'init',
      status: 'INFO',
      message: `🚀 Starting execution: ${displayName} in environment: ${request.environment}`,
    });

    // ─── Execute (Remote or Local) ───
    if (request.agentId) {
      console.log(`[EXEC] Dispatching task to agent ${request.agentId}: ${displayName} (${runId})`);
      const { dispatchToAgent } = await import('../agent/dispatcher.ts');
      result = await dispatchToAgent(request.agentId, payload) as any;
    } else {
      const onEnvVarExtracted = (name: string, value: string) => {
        const currentVars = environmentRepository.getVariables(request.environment);
        currentVars[name] = value;
        environmentRepository.updateVariables(request.environment, currentVars);
      };

      if (request.type === 'case') {
        console.log(`[EXEC] Starting case execution for: ${displayName}`);
        result = await executeSingleCase(payload, logger, signal, uiExecutor, deps, onEnvVarExtracted);
      } else if (request.type === 'suite') {
        console.log(`[EXEC] Starting suite execution for: ${displayName}`);
        result = await executeSuite(payload, logger, signal, uiExecutor, deps, onEnvVarExtracted);
      } else if (request.type === 'scenario') {
        console.log(`[EXEC] Starting scenario execution for: ${displayName}`);
        result = await executeScenario(payload, logger, signal, uiExecutor, deps, onEnvVarExtracted);
      } else {
        console.log(`[EXEC] Starting plan execution for: ${displayName}`);
        result = await executePlan(payload, logger, signal, uiExecutor, deps, onEnvVarExtracted);
      }
    }

    result.reportId = reportId;
    result.durationMs = Date.now() - startTime;

  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    const isAborted = signal.aborted;
    console.error(`[EXEC] Execution failed: ${message}`);

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
    suiteId: request.suiteId || request.scenarioId || request.planId || request.projectId,
    suiteName: displayName,
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
      level: l.level,
      message: l.message,
      screenshot: l.screenshot,
      metadata: l.metadata,
    })),
  });
  console.log(`[EXEC] Report saved successfully: ${reportId}`);

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
  logger.complete(result);

  console.log(`[EXEC] Task Finished: ${displayName} (${runId}) - Status: ${result.status} | Pass Rate: ${result.passRate}% | Cases: ${result.passedCases}/${result.totalCases}`);

  // Cleanup
  removeActiveRunLogger(reportId);
  unregisterRun(runId);
}
