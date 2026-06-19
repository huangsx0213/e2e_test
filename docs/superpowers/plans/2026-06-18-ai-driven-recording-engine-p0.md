# AI-Driven Recording Engine P0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the P0 foundation of the AI-Driven Recording Engine — from NlCase (APPROVED) through Stagehand-driven act/extract recording, Refiner pipeline, AutoReplay, to draft suite persistence with SSE progress streaming.

**Architecture:** Agent-side `AIRecordingSession` drives Stagehand act/extract per NL step, emitting step+element events via `RecordingBridge` (extracted from existing `emitConsolidatedStep`). A `Refiner` pure-code pipeline post-processes recorded steps. `AutoReplay` runs 3x on the Agent side reusing the Stagehand browser. Server provides REST API, WS relay to SSEGateway, DB persistence, and `DraftSuiteSaver`. Provider config flows via WS bidirectional (no HTTP callback, no API key in WS messages).

**Tech Stack:** TypeScript, Stagehand v3.5, Playwright, Express, better-sqlite3, Zod v4, Vitest, React (frontend P1).

**Spec reference:** `docs/05-AIDrivenRecordingEngine.md` contains the full architecture and most code snippets. This plan implements P0-1 through P0-5 + module registration.

---

## File Structure

### New files (Agent)
- `agent/recorder/recording-bridge.ts` — step+element dual-emission bridge (extracted from `index.ts:245-304`)
- `agent/recorder/refiner.ts` — pure-code refinement pipeline (dedupe → assertions → parameterize → sanitize → selector expand → provenance)
- `agent/recorder/ai-recording-session.ts` — Stagehand act/extract loop + _enableRecorder mount + lazy observe + takeover
- `agent/recorder/auto-replay.ts` — 3x replay with flaky detection (Agent-side, reuses Stagehand page)
- `agent/recorder/__tests__/recording-bridge.test.ts`
- `agent/recorder/__tests__/refiner.test.ts`
- `agent/recorder/__tests__/ai-recording-session.test.ts`
- `agent/recorder/__tests__/auto-replay.test.ts`

### Modified files (Agent)
- `agent/recording-control.ts` — add `AI_RECORDER_START/STOP/TAKEOVER_COMPLETE/PROVIDER_CONFIG_REQUEST` handling
- `agent/index.ts` — add WS event subscription mechanism (`onWsEvent`/`offWsEvent`/`emitWs`) for bidirectional WS; wire AI recorder deps

### New files (Server)
- `server/modules/ai-driven-recorder/index.ts` — module entry + shared SSEGateway instance
- `server/modules/ai-driven-recorder/controller.ts` — REST API + run orchestration
- `server/modules/ai-driven-recorder/schema.ts` — Zod request schemas
- `server/modules/ai-driven-recorder/repository.ts` — DB CRUD for runs + step_logs
- `server/modules/ai-driven-recorder/ws-relay.ts` — RECORDING_EVENT → SSEGateway bridge
- `server/modules/ai-driven-recorder/draft-suite-saver.ts` — refinedSteps → saveSuite + link NlCase
- `server/modules/ai-driven-recorder/provider-matrix.ts` — provider certification matrix
- `server/modules/ai-driven-recorder/__tests__/repository.test.ts`
- `server/modules/ai-driven-recorder/__tests__/draft-suite-saver.test.ts`
- `server/modules/ai-driven-recorder/__tests__/ws-relay.test.ts`
- `server/migrations/030_ai_driven_recorder_schema.ts` — DB schema

### Modified files (Server)
- `server/modules/ai-test-gen/sse-gateway.ts` — refactor: parameterize cleanup events via constructor
- `server/app/registerRoutes.ts` — register `aiDrivenRecorderModule`
- `server/migrations/index.ts` — register migration 030

### Modified files (Shared)
- `shared/recording/protocol.ts` — add `AiRecorderWsEvent` union type + event name constants

---

## Task 1: Refactor SSEGateway — Parameterize Cleanup Events

**Files:**
- Modify: `server/modules/ai-test-gen/sse-gateway.ts`
- Test: `server/modules/ai-test-gen/__tests__/sse-gateway.test.ts` (new)

**Why:** AI recorder needs `run:complete`/`run:error` as cleanup triggers; ai-test-gen uses `pipeline:complete`/`pipeline:error`. Hardcoded events force duplicate instances. Parameterize via constructor.

- [ ] **Step 1: Write failing test for parameterized cleanup**

```typescript
// server/modules/ai-test-gen/__tests__/sse-gateway.test.ts
import { describe, it, expect, vi } from 'vitest';
import { SSEGateway } from '../sse-gateway';
import { Response } from 'express';

function mockRes(): any {
  const handlers: Record<string, Function> = {};
  return {
    setHeader: vi.fn(),
    flushHeaders: vi.fn(),
    write: vi.fn(),
    end: vi.fn(),
    on: (ev: string, fn: Function) => { handlers[ev] = fn; },
    emit: (ev: string) => handlers[ev]?.(),
  };
}

describe('SSEGateway', () => {
  it('uses default cleanup events (pipeline:complete, pipeline:error)', () => {
    const gw = new SSEGateway();
    const res = mockRes();
    gw.attachStream('run-1', res);
    gw.emit('run-1', 'pipeline:complete', {});
    expect(res.end).toHaveBeenCalled();
  });

  it('uses custom cleanup events when provided', () => {
    const gw = new SSEGateway({ cleanupEvents: ['run:complete', 'run:error'] });
    const res = mockRes();
    gw.attachStream('run-2', res);
    // pipeline:complete should NOT cleanup with custom config
    gw.emit('run-2', 'pipeline:complete', {});
    expect(res.end).not.toHaveBeenCalled();
    // run:complete SHOULD cleanup
    gw.emit('run-2', 'run:complete', {});
    expect(res.end).toHaveBeenCalled();
  });

  it('buffers events when no stream attached', () => {
    const gw = new SSEGateway();
    gw.emit('run-3', 'step:start', { i: 1 });
    const res = mockRes();
    gw.attachStream('run-3', res);
    expect(res.write).toHaveBeenCalledWith(expect.stringContaining('step:start'));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run server/modules/ai-test-gen/__tests__/sse-gateway.test.ts`
Expected: FAIL — constructor takes no args.

- [ ] **Step 3: Refactor SSEGateway**

Modify `server/modules/ai-test-gen/sse-gateway.ts`:
- Add constructor param `cleanupEvents: string[] = ['pipeline:complete', 'pipeline:error']`
- Replace hardcoded `pipeline:complete`/`pipeline:error` checks in `emit()`, `attachStream()` onSse, and buffer replay with `this.cleanupEvents.includes(event)`
- Keep `lastEvents` checkpoint logic gated on `pipeline:complete`/`pipeline:error` only when using defaults (or make it configurable too — but checkpoint:waiting is ai-test-gen specific; gate it on a `checkpointEvent` param defaulting to `'checkpoint:waiting'`)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run server/modules/ai-test-gen/__tests__/sse-gateway.test.ts`
Expected: PASS

- [ ] **Step 5: Verify ai-test-gen still works**

Run: `npx vitest run server/modules/ai-test-gen/__tests__/`
Expected: All existing tests PASS (default cleanup events preserved)

- [ ] **Step 6: Commit**

```bash
git add server/modules/ai-test-gen/sse-gateway.ts server/modules/ai-test-gen/__tests__/sse-gateway.test.ts
git commit -m "refactor(sse-gateway): parameterize cleanup events via constructor"
```

---

## Task 2: Extend shared/recording/protocol.ts — AI Recorder WS Event Types

**Files:**
- Modify: `shared/recording/protocol.ts`

**Why:** Define the WS event contract for AI recorder (start/stop/takeover/provider-config request/response) before implementing handlers.

- [ ] **Step 1: Add AiRecorderWsEvent type and constants**

Append to `shared/recording/protocol.ts` (after existing types, before the `RECORDING_EVENT` const block). Import `NlTestCase` and `ProviderConfig` types from contracts.

```typescript
// === AI-Driven Recorder WS Events ===

export interface AiRecorderStartData {
  runId: string;
  projectId: string;
  nlCase: NlTestCase;
  providerConfigId: string;
  options: { headless?: boolean; maxRetriesPerStep?: number; timeoutPerStep?: number };
  caseId: string;
  suiteId: string;
}

export interface AiRecorderProviderConfigRequestData {
  runId: string;
  providerConfigId: string;
}

export interface AiRecorderProviderConfigResponseData {
  runId: string;
  providerConfigId: string;
  providerConfig: ProviderConfig;
}

export type AiRecorderWsEvent =
  | { event: 'AI_RECORDER_START'; data: AiRecorderStartData }
  | { event: 'AI_RECORDER_STOP'; data: { runId: string } }
  | { event: 'AI_RECORDER_TAKEOVER_COMPLETE'; data: { runId: string; nlStepIndex: number } }
  | { event: 'AI_RECORDER_PROVIDER_CONFIG_REQUEST'; data: AiRecorderProviderConfigRequestData }
  | { event: 'AI_RECORDER_PROVIDER_CONFIG_RESPONSE'; data: AiRecorderProviderConfigResponseData };

export const AI_RECORDER_START_EVENT = 'AI_RECORDER_START';
export const AI_RECORDER_STOP_EVENT = 'AI_RECORDER_STOP';
export const AI_RECORDER_TAKEOVER_COMPLETE_EVENT = 'AI_RECORDER_TAKEOVER_COMPLETE';
export const AI_RECORDER_PROVIDER_CONFIG_REQUEST_EVENT = 'AI_RECORDER_PROVIDER_CONFIG_REQUEST';
export const AI_RECORDER_PROVIDER_CONFIG_RESPONSE_EVENT = 'AI_RECORDER_PROVIDER_CONFIG_RESPONSE';
export const AI_RECORDER_COMPLETE_EVENT = 'AI_RECORDER_COMPLETE';
```

Note: `ProviderConfig` type — check `shared/contracts/index.ts` for existing type; if not present, use the `ProviderConfigRow` shape from `server/modules/ai-test-gen/repository.ts` minus DB columns.

- [ ] **Step 2: Verify typecheck**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add shared/recording/protocol.ts
git commit -m "feat(protocol): add AI recorder WS event types"
```

---

## Task 3: Extract RecordingBridge Component

**Files:**
- Create: `agent/recorder/recording-bridge.ts`
- Create: `agent/recorder/__tests__/recording-bridge.test.ts`
- Modify: `agent/recorder/index.ts` (refactor `emitConsolidatedStep` to call bridge)

**Why:** AI mode must emit both step-recorded + element-recorded (like manual recording). Extract the dual-emission logic from `RecordingManager.emitConsolidatedStep` (`index.ts:245-304`) into a reusable bridge. Spec: §3.2.

- [ ] **Step 1: Write failing test for RecordingBridge**

```typescript
// agent/recorder/__tests__/recording-bridge.test.ts
import { describe, it, expect, vi } from 'vitest';
import { bridgeConsolidatedStep } from '../recording-bridge';
import type { RecorderStepPayload } from '../protocol';

describe('RecordingBridge', () => {
  it('emits both step-recorded and element-recorded for steps with locator', () => {
    const emitStep = vi.fn();
    const emitElement = vi.fn();
    const payload: RecorderStepPayload = {
      action: 'click',
      locator: { kind: 'official', selector: 'internal:role=button[name="Login"]' },
      locatorCandidates: [],
      value: '',
      pageUrl: 'https://app.com/login',
      timestamp: Date.now(),
    };
    bridgeConsolidatedStep(payload, 'proj-1', 'case-1', 'suite-1', {
      emitStepRecorded: emitStep,
      emitElementRecorded: emitElement,
    });
    expect(emitStep).once;
    expect(emitElement).once;
    expect(emitStep.mock.calls[0][0]).toMatchObject({ projectId: 'proj-1', caseId: 'case-1', suiteId: 'suite-1', type: 'UI' });
    expect(emitElement.mock.calls[0][0]).toMatchObject({ projectId: 'proj-1', caseId: 'case-1', suiteId: 'suite-1' });
  });

  it('emits only step-recorded for goto (no locator)', () => {
    const emitStep = vi.fn();
    const emitElement = vi.fn();
    const payload: RecorderStepPayload = {
      action: 'goto',
      locatorCandidates: [],
      value: 'https://app.com/home',
      pageUrl: 'https://app.com/home',
      timestamp: Date.now(),
    };
    bridgeConsolidatedStep(payload, 'proj-1', 'case-1', 'suite-1', {
      emitStepRecorded: emitStep,
      emitElementRecorded: emitElement,
    });
    expect(emitStep).once;
    expect(emitElement).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run agent/recorder/__tests__/recording-bridge.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement RecordingBridge**

Create `agent/recorder/recording-bridge.ts` with `bridgeConsolidatedStep()` function. Copy the logic from `agent/recorder/index.ts:245-304` (`emitConsolidatedStep`), adapting to the callback interface from spec §3.2. The function signature:

```typescript
export interface BridgeCallbacks {
  emitStepRecorded: (data: StepRecordedEvent['data']) => void;
  emitElementRecorded: (data: ElementRecordedEvent['data']) => void;
}

export function bridgeConsolidatedStep(
  cleanStep: RecorderStepPayload,
  projectId: string,
  caseId: string,
  suiteId: string,
  callbacks: BridgeCallbacks,
): void { /* ... */ }
```

Also export `buildStepDescription` helper (currently private in `index.ts`).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run agent/recorder/__tests__/recording-bridge.test.ts`
Expected: PASS

- [ ] **Step 5: Refactor RecordingManager.emitConsolidatedStep to use bridge**

Modify `agent/recorder/index.ts`: replace the body of `emitConsolidatedStep` (lines 245-304) with a call to `bridgeConsolidatedStep`, passing callbacks that invoke `s.onStepRecorded` / `s.onElementRecorded`. Move `buildStepDescription` to `recording-bridge.ts` and re-import.

- [ ] **Step 6: Verify manual recording tests still pass**

Run: `npx vitest run agent/recorder/__tests__/`
Expected: All PASS (no behavior change, just extraction)

- [ ] **Step 7: Commit**

```bash
git add agent/recorder/recording-bridge.ts agent/recorder/__tests__/recording-bridge.test.ts agent/recorder/index.ts
git commit -m "refactor(recorder): extract RecordingBridge for step+element dual-emission"
```

---

## Task 4: Implement Refiner — Pure-Code Pipeline

**Files:**
- Create: `agent/recorder/refiner.ts`
- Create: `agent/recorder/__tests__/refiner.test.ts`

**Why:** Post-process raw recorded steps: dedupe → assertion mapping → parameterize → password sanitize → selector expand → provenance tag. Spec: §3.3.

- [ ] **Step 1: Write failing tests for each pipeline stage**

Test cases (one `it` per stage):
- Deduplicator: two adjacent identical `click` steps → merged to one
- AssertionMapper: extractResult with `success: true` + assertions → last step in boundary gets assertions attached
- Parameterizer: `fill` with hardcoded `admin` → replaced with `${USERNAME}` variable reference (avoid `id` regex over-matching)
- PasswordSanitizer: `fill` into password field → value extracted to variable, step.data becomes `${PASSWORD}`
- SelectorExpander: step with single official locator → gains CSS + role fallback locators in metadata
- ProvenanceTagger: step within boundary → metadata.provenance = { nlStepIndex, instruction, actRetryCount, extractSuccess, fromFallback }

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run agent/recorder/__tests__/refiner.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement Refiner**

Create `agent/recorder/refiner.ts` with:
- `Refiner` class with `refine(rawSteps, boundaries, extractResults, nlInstructions?)` method
- Private methods per stage: `deduplicate`, `mapAssertions`, `parameterize`, `sanitizePasswords`, `expandSelectors`, `tagProvenance`
- Types: `StepProvenance`, `NlStepBoundary` (import from ai-recording-session or define shared)
- Keep it pure-code (no LLM calls) per spec

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run agent/recorder/__tests__/refiner.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add agent/recorder/refiner.ts agent/recorder/__tests__/refiner.test.ts
git commit -m "feat(recorder): add Refiner pure-code pipeline with provenance tagging"
```

---

## Task 5: Implement AIRecordingSession — Core

**Files:**
- Create: `agent/recorder/ai-recording-session.ts`
- Create: `agent/recorder/__tests__/ai-recording-session.test.ts`

**Why:** The core Stagehand act/extract loop with _enableRecorder mount, lazy observe, takeover, and AutoReplay invocation. Spec: §3.1.

**Note:** This task has external dependencies (Stagehand, real browser). Unit-test the orchestration logic with mocked Stagehand; integration tests that need a real browser + API key are separate (skip in CI, run manually like `stagehand-recorder-poc.test.ts`).

- [ ] **Step 1: Write unit test with mocked Stagehand**

Test the orchestration: given a mocked Stagehand that succeeds on act/extract, verify:
- All NL steps are iterated
- `onConsolidatedStep` called for each captured step
- `onEvent` emits `step:start` / `step:complete`
- `RecordingResult` has correct `stepBoundaries` and `replayReport` (mocked AutoReplay)
- Lazy observe: when act() fails on attempt 0, observe is called once; on attempt 1, observe is NOT called again
- Takeover: when `isHeadless=false` and act fails all retries, `onTakeoverRequest` is invoked

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run agent/recorder/__tests__/ai-recording-session.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement AIRecordingSession**

Create `agent/recorder/ai-recording-session.ts` per spec §3.1. Key elements:
- `AIRecordingSessionParams` interface (onConsolidatedStep, onEvent, onTakeoverRequest)
- `RecordingResult` interface (includes `replayReport`)
- `start()` method: Stagehand init (verbose:0) → mount _enableRecorder → goto startUrl → loop NL steps → flush → Refiner → AutoReplay (step 6.5) → cleanup
- `executeNlStep()`: act with retry + lazy observe + dirty-state self-heal + extract verification + takeover (headless:false only)
- Import `EXTRACT_ASSERTION_SCHEMA` — define in this file or a shared schema file
- Import `autoReplayDraftSuite` from `./auto-replay.ts` (Task 6, create stub first if needed)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run agent/recorder/__tests__/ai-recording-session.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add agent/recorder/ai-recording-session.ts agent/recorder/__tests__/ai-recording-session.test.ts
git commit -m "feat(recorder): add AIRecordingSession with Stagehand act/extract loop"
```

---

## Task 6: Implement AutoReplay — 3x Replay with Flaky Detection

**Files:**
- Create: `agent/recorder/auto-replay.ts`
- Create: `agent/recorder/__tests__/auto-replay.test.ts`

**Why:** Agent-side 3x replay reusing Stagehand browser, with early termination on 2 consecutive fails and flaky verdict. Spec: §3.5.

- [ ] **Step 1: Write failing tests**

Test cases:
- All 3 passes → verdict `pass`, passCount=3
- 2 pass 1 fail → verdict `flaky`
- All 3 fail → verdict `fail`
- Early termination: run 1 fail + run 2 fail → stops at 2 runs, verdict `fail`, `degraded: true`
- `replayOnce` resets to startUrl before each run

Mock `page.goto` and step execution.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run agent/recorder/__tests__/auto-replay.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement AutoReplay**

Create `agent/recorder/auto-replay.ts` per spec §3.5. Key:
- `autoReplayDraftSuite(suite, { page, startUrl, replayRuns? })` → `ReplayReport`
- `replayOnce(suite, page, startUrl)` → `SingleReplayResult`
- Early termination: `if (run >= 1 && results[run].failedSteps > 0 && results[run-1].failedSteps > 0) break;`
- Verdict: pass (all pass) / fail (all fail) / flaky (mixed)
- `replayOnce` executes steps via a simplified UIExecutor-style loop (reuse `UIExecutor.executeStep` if signature allows, otherwise inline minimal step execution)

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run agent/recorder/__tests__/auto-replay.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add agent/recorder/auto-replay.ts agent/recorder/__tests__/auto-replay.test.ts
git commit -m "feat(recorder): add AutoReplay with 3x replay and flaky detection"
```

---

## Task 7: Extend Agent WS — Bidirectional Events + AI Recorder Control

**Files:**
- Modify: `agent/index.ts` — add WS event subscription mechanism
- Modify: `agent/recording-control.ts` — add AI_RECORDER_* handling

**Why:** Agent needs `onWsEvent`/`offWsEvent`/`emitWs` for the provider config fetch flow (WS bidirectional). `recording-control.ts` must handle `AI_RECORDER_START` etc. Spec: §4.1, §4.2.

- [ ] **Step 1: Add WS event subscription to agent/index.ts**

Add a typed event emitter pattern:
```typescript
type WsEventHandler = (data: any) => void;
const wsEventHandlers = new Map<string, Set<WsEventHandler>>();

function onWsEvent(event: string, handler: WsEventHandler) {
  if (!wsEventHandlers.has(event)) wsEventHandlers.set(event, new Set());
  wsEventHandlers.get(event)!.add(handler);
}
function offWsEvent(event: string, handler: WsEventHandler) {
  wsEventHandlers.get(event)?.delete(handler);
}
function emitWs(event: string, data: any) {
  sendMsg(event, data);
}
```
In the `ws.on('message')` handler, after parsing, dispatch to registered handlers BEFORE the existing if-chain:
```typescript
const handlers = wsEventHandlers.get(parsed.event);
if (handlers) handlers.forEach(h => h(parsed.data));
```

- [ ] **Step 2: Add AI recorder handling to recording-control.ts**

Extend `RecordingControlDeps` with `onWsEvent`, `offWsEvent`, `emitWs`. Add handling for:
- `AI_RECORDER_START`: fetch provider config via WS bidirectional (`fetchProviderConfigViaWs`), create `AIRecordingSession` + `RecordingBridge`, run, emit `AI_RECORDER_COMPLETE`
- `AI_RECORDER_STOP`: abort current session
- `AI_RECORDER_TAKEOVER_COMPLETE`: resolve pending takeover promise
- `AI_RECORDER_PROVIDER_CONFIG_REQUEST`: (server-side, not agent — skip here)

Implement `fetchProviderConfigViaWs(deps, runId, providerConfigId)` per spec §4.1 (Promise + timeout + cleanup).

- [ ] **Step 3: Wire AI recorder deps in agent/index.ts**

In the `handleRecordingControlMessage` call, add `onWsEvent`, `offWsEvent`, `emitWs` to deps.

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 5: Commit**

```bash
git add agent/index.ts agent/recording-control.ts
git commit -m "feat(agent): add WS event subscription + AI recorder control handling"
```

---

## Task 8: DB Migration + Repository

**Files:**
- Create: `server/migrations/030_ai_driven_recorder_schema.ts`
- Modify: `server/migrations/index.ts`
- Create: `server/modules/ai-driven-recorder/repository.ts`
- Create: `server/modules/ai-driven-recorder/__tests__/repository.test.ts`

**Why:** Persist runs + step_logs. Spec: §7.

- [ ] **Step 1: Write migration**

Create `server/migrations/030_ai_driven_recorder_schema.ts` with the two tables from spec §7 (`ai_driven_recording_runs` + `ai_driven_recording_step_logs`) + indexes. Follow the pattern of `013_ai_test_gen_schema.ts`.

- [ ] **Step 2: Register migration in index.ts**

Add import + push to `migrations` array in `server/migrations/index.ts`.

- [ ] **Step 3: Write repository test**

Test CRUD: createRun, getRun, updateRunStatus, listRunsByProject, createStepLog, etc. Use in-memory DB.

- [ ] **Step 4: Run test to verify it fails**

Run: `npx vitest run server/modules/ai-driven-recorder/__tests__/repository.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 5: Implement repository**

Create `server/modules/ai-driven-recorder/repository.ts` with `AiDrivenRecorderRepository` class. Methods: `createRun`, `getRun`, `updateRun`, `listRunsByProject`, `getActiveRun`, `createStepLog`, `listStepLogs`. Follow `ai-test-gen/repository.ts` patterns.

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run server/modules/ai-driven-recorder/__tests__/repository.test.ts`
Expected: PASS

- [ ] **Step 7: Run migration to verify schema**

Run: `npx tsx server/seed.ts` or the app's migration runner.
Expected: Migration applies without error.

- [ ] **Step 8: Commit**

```bash
git add server/migrations/030_ai_driven_recorder_schema.ts server/migrations/index.ts server/modules/ai-driven-recorder/repository.ts server/modules/ai-driven-recorder/__tests__/repository.test.ts
git commit -m "feat(ai-driven-recorder): add DB schema + repository"
```

---

## Task 9: Server Module — Controller, Routes, WS Relay, DraftSuiteSaver, ProviderMatrix

**Files:**
- Create: `server/modules/ai-driven-recorder/index.ts`
- Create: `server/modules/ai-driven-recorder/controller.ts`
- Create: `server/modules/ai-driven-recorder/schema.ts`
- Create: `server/modules/ai-driven-recorder/ws-relay.ts`
- Create: `server/modules/ai-driven-recorder/draft-suite-saver.ts`
- Create: `server/modules/ai-driven-recorder/provider-matrix.ts`
- Create: `server/modules/ai-driven-recorder/__tests__/draft-suite-saver.test.ts`
- Create: `server/modules/ai-driven-recorder/__tests__/ws-relay.test.ts`

**Why:** REST API, WS→SSE relay, draft suite persistence, provider certification. Spec: §3.4, §4.3, §6, §8.

- [ ] **Step 1: Implement provider-matrix.ts**

Create `provider-matrix.ts` with the certification matrix from spec §6. Export `getProviderCertification(providerType)` → `'certified' | 'experimental' | 'unverified'` and `canStartAiRecording(providerType)` → boolean.

- [ ] **Step 2: Write + run draft-suite-saver test**

Test: given refinedSteps + nlCase, `saveDraftSuite` creates a suite via `saveSuite`, patches nlCase with `generatedSuiteId`, returns `{ suiteId, caseId, suite }`. Mock `saveSuite` and `nlCaseRepo`.

- [ ] **Step 3: Implement draft-suite-saver.ts**

Per spec §3.4. Use `saveSuite` from `../suites/repository.ts` and `nlCaseRepo` from `../nl-cases/repository.ts`.

- [ ] **Step 4: Write + run ws-relay test**

Test: `registerAiRecorderWsRelay` subscribes to `RECORDING_EVENT`. On `step:start`/`step:complete`/etc → `sseGateway.emit(runId, event, data)`. On `AI_RECORDER_COMPLETE` → `sseGateway.emit(runId, 'run:complete', data)`. Does NOT call RecordingService (step/element handled by existing ws-handlers).

- [ ] **Step 5: Implement ws-relay.ts**

Per spec §4.3. Import shared `sseGateway` instance from `./index.ts`.

- [ ] **Step 6: Implement schema.ts**

Zod schemas: `runRequestSchema` (nlCaseId, providerConfigId, options?), `runOptionsSchema`.

- [ ] **Step 7: Implement controller.ts**

`AiDrivenRecorderController` class with:
- `sseGateway: SSEGateway` (instance with `cleanupEvents: ['run:complete', 'run:error']`)
- `startRun(projectId, body)`: validate nlCase APPROVED + provider certified → create run record → pre-allocate suiteId/caseId → find idle agent → dispatch `AI_RECORDER_START` via WS → return `{ runId, suiteId, caseId }`
- `getRun(runId)`, `listRuns(projectId)`, `abortRun(runId)`, `deleteRun(runId)`
- `attachStream(runId, res)`: `sseGateway.attachStream(runId, res)`
- On `AI_RECORDER_COMPLETE` (via ws-relay): call `DraftSuiteSaver.save()` + write `replayReport` to DB + update run status

- [ ] **Step 8: Implement index.ts (module entry)**

```typescript
import { Router } from 'express';
import { AiDrivenRecorderController } from './controller.ts';
import { registerAiRecorderWsRelay } from './ws-relay.ts';

const router = Router();
const controller = new AiDrivenRecorderController();
registerAiRecorderWsRelay(controller.sseGateway);

// routes: POST /:projectId/runs, GET /:projectId/runs, GET /:projectId/runs/:runId, GET /:projectId/runs/:runId/stream, DELETE /:projectId/runs/:runId

export const aiDrivenRecorderModule = { basePath: '/api/ai-driven-recorder', router };
```

- [ ] **Step 9: Run all module tests**

Run: `npx vitest run server/modules/ai-driven-recorder/__tests__/`
Expected: PASS

- [ ] **Step 10: Commit**

```bash
git add server/modules/ai-driven-recorder/
git commit -m "feat(ai-driven-recorder): add server module (controller, routes, ws-relay, draft-suite-saver, provider-matrix)"
```

---

## Task 10: Module Registration + End-to-End Verification

**Files:**
- Modify: `server/app/registerRoutes.ts`

**Why:** Register the new module so routes are accessible.

- [ ] **Step 1: Register module in registerRoutes.ts**

Add import `aiDrivenRecorderModule` and add to `modules` array.

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Run full test suite**

Run: `npx vitest run`
Expected: All tests PASS (no regressions)

- [ ] **Step 4: Start server + verify routes exist**

Run: `npx tsx server/index.ts` (or the app's start command)
Then: `curl http://localhost:3000/api/ai-driven-recorder/proj-1/runs`
Expected: 200 with `[]` or valid JSON (not 404)

- [ ] **Step 5: Commit**

```bash
git add server/app/registerRoutes.ts
git commit -m "feat(ai-driven-recorder): register module in server routes"
```

---

## Self-Review Notes

**Spec coverage (P0):**
- P0-1 (RecordingBridge + AIRecordingSession + WS指令): Tasks 3, 5, 7 ✓
- P0-2 (Refiner): Task 4 ✓
- P0-3 (Server module + REST + Repository + WS Relay + SSEGateway): Tasks 1, 8, 9 ✓
- P0-4 (DraftSuiteSaver + AutoReplay): Tasks 6, 9 ✓
- P0-5 (Provider matrix + security): Task 9 (provider-matrix) ✓; token_usage tracking — field exists in schema, runtime tracking deferred per spec note (verify Stagehand exposes token usage)

**Deferred to P1:**
- Frontend integration (NlCasesPage AI Record button, useAiDrivenRecorderRun hook, RecorderRuntimePanel, TestBuilder jump) — spec §8.4
- WAITING_TAKEOVER robustness, dirty-state self-heal, schema validation, lazy observe — partially in Task 5, full robustness in P1-2

**Type consistency:**
- `RecorderStepPayload` from `agent/recorder/protocol.ts` (existing)
- `NlStepBoundary` defined in `ai-recording-session.ts`, imported by `refiner.ts`
- `ReplayReport` / `SingleReplayResult` defined in `auto-replay.ts`, imported by `ai-recording-session.ts`
- `AiRecorderWsEvent` in `shared/recording/protocol.ts`, used by both agent and server
