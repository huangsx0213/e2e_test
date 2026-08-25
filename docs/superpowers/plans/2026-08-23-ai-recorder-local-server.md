# AI Recorder Local-Server Execution Plan

> For agentic workers: REQUIRED SUB-SKILL superpowers:subagent-driven-development (recommended) or executing-plans. Steps use checkbox syntax.

**Goal:** Add an explicit per-run `executionMode: 'agent' | 'local'` to AI Recorder; `local` executes the recording in the server process with identical SSE/persistence behavior and shared completion logic, no auto-fallback ever.

**Architecture:** New in-process LocalRecordingRunner reuses the hardened AIRecordingSession; completion/failure persistence extracted once into finalize-run.ts consumed by both ws-relay and the runner; a small run registry routes takeover/abort for both transports.

**Tech Stack:** TypeScript ESM, better-sqlite3, Stagehand v3 (dynamic import), Express, React 19, Vitest.

---

Approved spec: docs/superpowers/specs/2026-08-23-ai-recorder-local-server-design.md
Git commits intentionally omitted; work stays in the working tree alongside existing changes.

## File Structure

- Create server/migrations/011_add_recorder_execution_mode.ts
- Create server/modules/ai-driven-recorder/finalize-run.ts
- Create server/modules/ai-driven-recorder/run-registry.ts
- Create server/modules/ai-driven-recorder/local-runner.ts
- Modify server/migrations/index.ts; ai-driven-recorder/{repository,controller,ws-relay}.ts
- Tests: create __tests__/{finalize-run,run-registry,local-runner}.test.ts; extend repository/controller/ws-relay tests
- Client: shared/services/api.ts; features/ai-driven-recorder/RecorderConfigPanel.tsx (+ its test)

Verified facts to reuse:
- RecordingService ctor: `new RecordingService(defaultIngestService, wsService)` (server/modules/recording/ws-handlers.ts:8 pattern); handleStepRecorded/handleElementRecorded persist via ingest + broadcast.
- saveDraftSuite(projectId, nlCaseId, {steps}) -> {suiteId, caseId} (draft-suite-saver.ts).
- extractSecretValues(testData) exists in agent/recorder/refiner.ts.
- controller.test.ts mock harness: vi.mock websocketService/agent registry/nl-cases/suites repos; makeMockRepo() vi.fn object; real SSEGateway instance.

---

### Task 1: Persist And Expose executionMode

Files:
- Create server/migrations/011_add_recorder_execution_mode.ts
- Modify server/migrations/index.ts (import + append after migration 010)
- Modify server/modules/ai-driven-recorder/repository.ts (Row type + createRun param)
- Modify server/modules/ai-driven-recorder/controller.ts (validation + RunStatusResponse.executionMode)
- Test: extend __tests__/repository.test.ts and __tests__/controller.test.ts

Step 1: failing tests

Repository (isolated-DB pattern already in that file):

    it('defaults execution_mode to agent and persists overrides', () => {
      const a = repository.createRun({ projectId: 'p1', nlCaseId: 'n1' });
      const b = repository.createRun({ projectId: 'p1', nlCaseId: 'n2', executionMode: 'local' });
      expect(repository.getRun(a)).toMatchObject({ execution_mode: 'agent' });
      expect(repository.getRun(b)).toMatchObject({ execution_mode: 'local' });
    });

Controller:

    it('rejects invalid executionMode before any side effect', () => {
      expect(() => controller.startRun('p1', validStartBody({ executionMode: 'cloud' }))).toThrow(ValidationError);
      expect(saveSuite).not.toHaveBeenCalled();
      expect(mockRepo.createRun).not.toHaveBeenCalled();
    });

    it('records local mode on the run row and exposes it', () => {
      agentRegistry.getActiveConnections.mockReturnValue(new Map()); // no agent needed later tasks
      const res = controller.startRun('p1', validStartBody({ executionMode: 'local' }));
      expect(mockRepo.createRun).toHaveBeenCalledWith(expect.objectContaining({ executionMode: 'local' }));
      const status = controller.getRun('p1', res.runId);
      expect(status).toMatchObject({ executionMode: 'local' });
    });

(validStartBody = existing body helper in that file plus the field; if absent build from makeApprovedNlCase wiring used today.)

Step 2: run focused tests -> expected FAIL (missing column/param/field).

Step 3: implement

Migration file:

    import type Database from 'better-sqlite3';
    import { db } from '../shared/db/client.ts';
    import type { Migration } from './types.ts';

    export function applyRecorderExecutionMode(database: Database.Database): void {
      database.exec(`ALTER TABLE ai_driven_recording_runs ADD COLUMN execution_mode TEXT NOT NULL DEFAULT 'agent';`);
    }

    export const migration011AddRecorderExecutionMode: Migration = {
      id: '011_add_recorder_execution_mode',
      up: () => applyRecorderExecutionMode(db),
    };

Register in server/migrations/index.ts after 010.

Repository changes:
- AiDrivenRecorderRunRow gains `execution_mode: string;`
- createRun params gain `executionMode?: 'agent' | 'local'`; INSERT includes column with value `params.executionMode ?? 'agent'`.

Controller changes:
- Top of startRun: `const mode = (body as any)?.executionMode ?? 'agent'; if (mode !== 'agent' && mode !== 'local') throw new ValidationError('executionMode must be "agent" or "local"');`
- Pass `executionMode: mode` into repository.createRun.
- RunStatusResponse gains `executionMode: 'agent' | 'local'`; set it in getRun/listRuns from row.execution_mode.

Step 4: focused tests + npm run lint -> PASS. Behavior not yet branched.

### Task 2: Extract Shared Completion Persistence (pure refactor)

Files:
- Create server/modules/ai-driven-recorder/finalize-run.ts
- Modify ws-relay.ts handleAiRecorderComplete (~L145-229) to delegate; remove orphaned imports (saveDraftSuite/saveSuite/nlCaseRepo/TestSuite/TestCase)
- Test: new __tests__/finalize-run.test.ts; ws-relay.test.ts must pass UNCHANGED

Step 1: unit tests (mock SSEGateway class instance + repo vi.fn object; mock suites/nl-cases/draft-suite-saver modules like controller.test.ts does):

Case A preallocated ids: finalizeRunCompletion(deps,{runId:'r1',suiteId:'s1',caseId:'c1',refinedSteps:[{id:'x'}],replayReport:{verdict:'pass'}}) asserts saveSuite called with suite id s1 containing case c1 steps [{id:'x'}]; nlCaseRepo.save called with generatedSuiteId 's1'; updateRunResult ({suiteId:'s1',caseId:'c1',replayReport}); updateRunStatus ('r1','completed'); sse emit ('r1','run:complete', objectContaining {suiteId:'s1',caseId:'c1'}); returns {suiteId:'s1',caseId:'c1'}.
Case B empty ids: saveDraftSuite mocked -> {suiteId:'s9',caseId:'c9'}; assert result/updateRunResult use s9/c9 and no saveSuite direct call.
Case C unknown run: getRun undefined -> completion AND failure variants perform zero writes/emits.
Case D failure: finalizeRunFailure marks failed(error)+run:error; deleted-run variant performs nothing.

Step 2: implement finalize-run.ts by moving handleAiRecorderComplete success/error bodies verbatim into:

    export interface FinalizeRunDeps { repository: AiDrivenRecorderRepository; sseGateway: SSEGateway }
    export function finalizeRunCompletion(deps, params: {
      runId: string; suiteId: string; caseId: string;
      refinedSteps?: unknown[]; replayReport?: unknown;
    }): { suiteId: string; caseId: string }
    export function finalizeRunFailure(deps, params: { runId: string; error: string }): void

Semantics locked:
- suiteId/caseId resolution: params.X || run.result_suite_id/case_id || ''.
- Preallocated-update branch requires BOTH suiteId && caseId non-empty (old code required only suiteId because both always traveled together); else fallback saveDraftSuite(run.project_id, run.nl_case_id, {steps}).
- Completion fetches run first; unknown run warns+returns {'',''}.
- finalizeRunFailure first re-checks getRun (deleted runs must not resurrect SSE emitters or overwrite state), then updateRunStatus(failed,error) + emit run:error.

ws-relay delegation:

    function handleAiRecorderComplete(runId, data, sseGateway, repository) {
      const run = repository.getRun(runId);
      if (!run) { Log.for('ws-relay').warn(`AI_RECORDER_COMPLETE for unknown run: ${runId}`); return; }
      if (data.error) { finalizeRunFailure({ repository, sseGateway }, { runId, error: data.error }); return; }
      const result = data.result || {};
      finalizeRunCompletion({ repository, sseGateway }, {
        runId, suiteId: data.suiteId || '', caseId: data.caseId || '',
        refinedSteps: result.refinedSteps, replayReport: result.replayReport,
      });
    }

Step 3: npx vitest run server/modules/ai-driven-recorder/__tests__ -> ALL pass, ws-relay tests untouched.


### Task 3: Run Registry (dual-path takeover/abort)

Files:
- Create server/modules/ai-driven-recorder/run-registry.ts
- Test: new __tests__/run-registry.test.ts
- Modify ws-relay.ts TAKEOVER_COMPLETE case

Step 1 failing tests: register/get round-trip; getLocalRunHandle(undefined or missing) returns undefined; unregister idempotent; re-register overwrites previous handle.

Step 2 implement:

    export interface LocalRunHandle {
      abort(): void;
      resolveTakeover(result: boolean): void;
    }
    const registry = new Map<string, LocalRunHandle>();
    export function registerLocalRun(runId: string, handle: LocalRunHandle): void { registry.set(runId, handle); }
    export function unregisterLocalRun(runId: string): void { registry.delete(runId); }
    export function getLocalRunHandle(runId: string | undefined): LocalRunHandle | undefined {
      if (!runId) return undefined;
      return registry.get(runId);
    }

Step 3 wire ws-relay TAKEOVER_COMPLETE case: first statement inside the valid-runId branch becomes

    getLocalRunHandle(runId)?.resolveTakeover(true);

(local sessions resolve; the existing wsService.broadcast to agents stays and agents ignore unknown runIds). Add one ws-relay test: a registered fake handle is resolved by an incoming envelope; an unregistered runId leaves the broadcast behavior unchanged.

### Task 4: LocalRecordingRunner And Controller Dispatch

Files:
- Create server/modules/ai-driven-recorder/local-runner.ts
- Modify controller.ts (constructor wiring; startRun dispatch + capacity precheck; deleteRun gating)
- Tests: new __tests__/local-runner.test.ts; extend controller.test.ts

Runner contract (DI for tests):

    export interface LocalStartParams {
      runId: string;
      projectId: string;
      nlCase: NlTestCase;
      providerConfig: DecryptedProviderConfig;
      options: Record<string, any>;
      caseId: string;
      suiteId: string;
    }
    export class LocalRecordingRunner {
      constructor(deps: {
        sseGateway: SSEGateway;
        repository: AiDrivenRecorderRepository;
        recordingBridge?: {
          handleStepRecorded(d: any): void;
          handleElementRecorded(d: any): void;
        };
        maxConcurrentRuns?: number;
        takeoverTimeoutMs?: number;
      })
      assertCapacity(): void
      start(params: LocalStartParams): void
    }

capacity(): process.env.AI_RECORDER_MAX_LOCAL_RUNS overrides deps.maxConcurrentRuns; default 1; clamp minimum 1.

assertCapacity() throws ConflictError('Local recorder is busy: concurrent local run limit reached') when active >= capacity. start(params) calls assertCapacity(), active += 1, then void this.execute(params) (synchronous return so the HTTP 201 is not delayed).

execute(params):
- abortController = new AbortController()
- registerLocalRun(runId, { abort: () => abortController.abort(), resolveTakeover: v => this.takeoverResolvers.get(runId)?.(v) })
- secrets = extractSecretValues((nlCase as any).testData ?? [])
- session.start({ nlCase, providerConfig, options, signal, onConsolidatedStep, onEvent, onTakeoverRequest }) importing AIRecordingSession and SessionAbortedError from '../../../agent/recorder/ai-recording-session.ts'
- onEvent: sseGateway.emit(runId, event, { ...data, runId, caseId, suiteId })  // id injection = agent-path parity
- onConsolidatedStep: bridgeConsolidatedStep(step, projectId, caseId, suiteId, callbacks) where callbacks = { secrets, emitStepRecorded, emitElementRecorded }; emit* call deps.recordingBridge.handleStepRecorded/handleElementRecorded when provided, else fall back to sseGateway.emit(runId, 'step-recorded' | 'element-recorded', d). Import bridgeConsolidatedStep from '../../../agent/recorder/recording-bridge.ts'.
- onTakeoverRequest: register resolver keyed by runId with timeout deps.takeoverTimeoutMs ?? 120_000 resolving false; timer stored in this.takeoverTimers.
- success: finalizeRunCompletion(this.deps, { runId, suiteId, caseId, refinedSteps: result.steps, replayReport: result.replayReport })
- catch err: aborted = err instanceof SessionAbortedError; skip error log when aborted; finalizeRunFailure(this.deps, { runId, error: aborted ? 'Recording aborted by user' : String((err as Error)?.message ?? err) })
- finally: clear+delete takeover timer and resolver for runId; unregisterLocalRun(runId); active -= 1

Failing tests first (module-mock AIRecordingSession like recording-control.test.ts does; fake SSEGateway {emit: vi.fn()}; fake repo vi.fn object):

1. capacity: runner.start(a) reserves the only slot; expect(() => runner.start(b)).toThrow(ConflictError); after mocked session settles, start(c) succeeds (slot released).
2. bridging: mocked start invokes onEvent('step:start',{nlStepIndex:0}) and onConsolidatedStep(makeFillStep()); assert emit called with injected ids AND recordingBridge.handleStepRecorded called with objectContaining({projectId,type:'UI',caseId,suiteId}).
3. completion: mocked start resolves {steps:[{id:'refined'}],stepBoundaries:[],replayCandidateSuite:{}}; assert updateRunStatus('r1','completed') and emit('r1','run:complete',...).
4. abort: mocked start rejects new SessionAbortedError(); assert updateRunStatus('r1','failed','Recording aborted by user'), run:error emitted, no error log spam path.
5. takeover: capture onTakeoverRequest; call getLocalRunHandle('r1').resolveTakeover(true) -> awaited value true; with takeoverTimeoutMs:20 and never-resolving, resolves false quickly.
6. deleted-run guard: repo.getRun returns undefined at settle -> zero updateRunStatus/updateRunResult/emit.

Controller wiring and dispatch:

Constructor gains:

    this.localRunner = new LocalRecordingRunner({
      sseGateway,
      repository: this.repository,
      recordingBridge: new RecordingService(defaultIngestService, wsService),
    });

with imports RecordingService from '../recording/service.ts', defaultIngestService from '../recording/default-ingest.ts'. Make the field injectable for tests: optional constructor param `localRunner?: LocalRecordingRunner` defaulting to the production instance.

startRun ordering (409 must precede ALL side effects; agent-503 keeps legacy order after suite creation):

    if (mode === 'local') this.localRunner.assertCapacity();
    ... existing nlCase/provider/matrix/conflicting-run checks ...
    const suiteId/caseId/createRun as today (createRun now receives executionMode: mode);
    if (mode === 'local') {
      this.localRunner.start({ runId, projectId, nlCase, providerConfig, options: params.options ?? {}, caseId, suiteId });
    } else {
      ...existing idle-agent selection; keep 503 on none...; ws send START...
    }
    sseGateway.emit(runId,'run:start', {...}) unchanged.

deleteRun gating (prevents cross-mode STOP clobbering where deleting a local run would kill an unrelated agent session):

    if (active statuses) {
      if ((run as any).execution_mode === 'local') getLocalRunHandle(runId)?.abort();
      else wsService.broadcast(AI_RECORDER_STOP_EVENT, { runId });
    }

### Task 5: Frontend Execution Position Selector

Files:
- Modify client/shared/services/api.ts aiDrivenRecorder.start config param type: add optional executionMode?: 'agent' | 'local'
- Modify client/features/ai-driven-recorder/RecorderConfigPanel.tsx:
  - SavedRecorderConfig gains executionMode: 'agent' | 'local'; defaultRecorderConfig.executionMode = 'agent'
  - state const [executionMode, setExecutionMode] = useState(savedConfig?.executionMode ?? 'agent')
  - persist in the existing saveRecorderConfig effect
  - StartConfig payload in handleStart gains executionMode
  - UI: an Execution Position select (two options Agent / Local server) placed with the other run settings, matching existing label/control classes; disabled while panel disabled
- Test: extend the panel test file

Step 1 failing tests: selector renders both options; default agent when nothing saved; changing to Local server persists to localStorage key ai-recorder-config across remount; onStart payload includes executionMode:'local'.

Step 2 implement per above. Keep page/hook pass-through untouched if they already forward the whole config object; VERIFY useAiDrivenRecorderRun.start forwards config verbatim into api.aiDrivenRecorder.start (it does today for nlCaseId/providerConfigId/options) and add explicit propagation if it rebuilds the object field-by-field.

### Task 6: Full Verification

1. Focused: npx vitest run server/modules/ai-driven-recorder/__tests__ client/features/ai-driven-recorder
2. npm run lint
3. npm test (full)
4. npm run build
Expected: all green (existing non-failing warnings acceptable).

Manual smoke checklist (document results):
- Without any agent connected: start a local run against a simple page; live steps stream; complete lands refined steps in draft suite linked to the NlCase under preallocated ids; history shows mode local.
- Delete mid-run stops the browser session and leaves no orphan writes.
- With an agent connected: agent-mode regression unchanged; deleting an agent run does NOT broadcast STOP to a concurrently running LOCAL session and vice versa.
