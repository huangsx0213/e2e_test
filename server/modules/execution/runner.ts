import { dispatchToAgent, abortRemoteRun } from '../agent/dispatcher.ts';
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
import { interpolate } from './interpolator.ts';
import { executeApiStep, type ApiAssets } from './api-executor.ts';
import { ExecutionLogger } from './logger.ts';
import { db } from '../../shared/db/client.ts';
import { randomId } from '../../shared/utils/index.ts';
import { UIExecutor } from './ui-executor.ts';
import { executeSingleCase, executeSuite, executeScenario, executePlan } from '../../shared/core/executor.ts';
import type { TaskPayload } from '../../shared/contracts/index.ts';
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

  // Also try to abort remote runs if this report is matched
  // Since activeRun doesn't store reportId directly in the registry object, 
  // we can iterate the active mappings if needed, but usually reportId is enough.
  // We'll rely on the reportId being passed to an abortRemoteRun if we had it.
  // Actually, runner.ts manages reportId. Let's make it smarter.
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
    INSERT INTO execution_runs (id, report_id, type, project_id, environment, suite_id, case_id, scenario_id, plan_id, status, started_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'RUNNING', ?)
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
  let displayName = `Execution: ${request.type}`;
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

    if (request.agentId) {
      logger.log({
        stepId: 'dispatch',
        status: 'INFO',
        message: `📡 Dispatching task to Remote Agent: ${request.agentId}`,
      });
      result = (await dispatchToAgent(request.agentId, payload)) as any;
    } else {
      if (request.type === 'case') {
        const suite = suiteRepository.get(request.suiteId!);
        const testCase = suite?.cases.find(c => c.id === request.caseId);
        displayName = testCase ? testCase.name : `Execution: ${request.type}`;
        console.log(`[EXEC] Starting case execution for: ${displayName}`);
        result = await executeSingleCase(payload, logger, signal, uiExecutor);
      } else if (request.type === 'suite') {
        const suite = suiteRepository.get(request.suiteId!);
        displayName = suite ? suite.name : `Execution: ${request.type}`;
        console.log(`[EXEC] Starting suite execution for: ${displayName}`);
        result = await executeSuite(payload, logger, signal, uiExecutor);
      } else if (request.type === 'scenario') {
        const scenario = project.scenarios?.find(s => s.id === request.scenarioId);
        displayName = scenario ? scenario.name : `Execution: ${request.type}`;
        console.log(`[EXEC] Starting scenario execution for: ${displayName}`);
        result = await executeScenario(payload, logger, signal, uiExecutor);
      } else {
        const plan = project.plans?.find(p => p.id === request.planId);
        displayName = plan ? plan.name : `Execution: ${request.type}`;
        console.log(`[EXEC] Starting plan execution for: ${displayName}`);
        result = await executePlan(payload, logger, signal, uiExecutor);
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
  console.log(`[EXEC] Saving report: ${displayName} (${reportId})`);
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
