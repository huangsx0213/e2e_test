# AI Recorder P0 Production Hardening Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the four broken links that make AI Recorder unusable in production (refined steps never persisted, STOP cannot abort, takeover Done is a dead letter, no call timeouts) plus stop leaking typed secrets and the tracked `agent/.env`.

**Architecture:** Keep the existing three-tier event flow (server orchestration → WS → agent Stagehand session → SSE). All fixes are contract/lifecycle corrections inside the existing modules — no new services. The agent owns abort/timeout enforcement; the server keeps treating COMPLETE-with-error as terminal; the frontend routes takeover through the existing `RECORDING_EVENT` envelope broadcast.

**Tech Stack:** TypeScript ESM, ws, Stagehand v3 + Playwright, React 19, Vitest.

---

Scope decision (user-approved): P0 only. Out of scope: SSE reconnect, ACK/buffered transport, step-log REST endpoint, project-switch isolation, replay report UI, dead auto-replay removal.

Git commits are intentionally omitted; all work stays in the working tree.

## File Structure

- Modify `agent/recorder/ai-recording-session.ts`: abort signal, per-call timeout helper, typed errors.
- Modify `agent/recording-control.ts`: refinedSteps payload, secrets extraction for bridge, STOP/reset ordering.
- Modify `agent/recorder/refiner.ts`: export reusable exact-match redaction helper.
- Modify `agent/recorder/recording-bridge.ts`: redact live values before emit.
- Modify `client/features/ai-driven-recorder/AiDrivenRecorderPage.tsx`: envelope-wrapped takeover send with pending state.
- Modify `client/features/ai-driven-recorder/RecorderRuntimePanel.tsx`: disable Done while takeover send is in flight.
- Modify `.gitignore`: ensure `agent/.env` ignored; untrack it.
- Tests: extend `agent/__tests__/recording-control.test.ts`, `agent/recorder/__tests__/ai-recording-session.test.ts`, `agent/recorder/__tests__/recording-bridge.test.ts`, `client/features/ai-driven-recorder/__tests__/` (page + runtime panel tests).

---

### Task 1: Persist Refined Steps (C1)

The session's `result.steps` already contains refiner output (dedupe/redact/parameterize), but `agent/recording-control.ts:224` ships it as `result.steps` while `server/modules/ai-driven-recorder/ws-relay.ts:180` persists only `result.refinedSteps`. Fix the agent payload to the server contract.

**Files:**
- Modify: `agent/recording-control.ts:223-225`
- Test: `agent/__tests__/recording-control.test.ts`

- [ ] **Step 1: Write the failing test**

In the existing `AI_RECORDER_START` describe block, add:

```ts
it('reports refinedSteps (not raw steps) in AI_RECORDER_COMPLETE', async () => {
  const emitted: Array<{ event: string; data: any }> = [];
  const deps = makeDeps({ emitRecordingEvent: (event, data) => { emitted.push({ event, data }); } });
  // makeDeps must stub AIRecordingSession.prototype.start via vi.spyOn to resolve:
  // { steps: [{ id: 'refined-1' }], stepBoundaries: [], replayCandidateSuite: {} }
  await handleRecordingControlMessage(
    { event: 'AI_RECORDER_START', data: { runId: 'r1', projectId: 'p1', nlCase: makeNlCase(), providerConfigId: 'pc1', caseId: 'c1', suiteId: 's1' } },
    deps,
  );
  const complete = emitted.find((e) => e.event === 'AI_RECORDER_COMPLETE');
  expect(complete?.data.result.refinedSteps).toEqual([{ id: 'refined-1' }]);
});
```

Reuse the file's existing helpers/mocks for `makeDeps`/`makeNlCase`; if they do not exist yet, follow the pattern used by the ws-relay tests (`server/modules/ai-driven-recorder/__tests__/ws-relay.test.ts`) with `vi.spyOn(AIRecordingSession.prototype, 'start')`.

- [ ] **Step 2: Run test to verify it fails**

```powershell
npx vitest run agent/__tests__/recording-control.test.ts
```

Expected: FAIL — `result.refinedSteps` is `undefined`.

- [ ] **Step 3: Implement**

Replace `agent/recording-control.ts:223-224` with an explicit server-contract payload:

```ts
// 4. 上报完成（refinedSteps 为 Server 落库契约字段，见 ws-relay.handleAiRecorderComplete）
deps.emitRecordingEvent(AI_RECORDER_COMPLETE_EVENT, {
  runId,
  result: {
    refinedSteps: result.steps,
    stepBoundaries: result.stepBoundaries,
    replayCandidateSuite: result.replayCandidateSuite,
    replayReport: result.replayReport,
  },
  caseId,
  suiteId,
});
```

- [ ] **Step 4: Run focused tests**

```powershell
npx vitest run agent/__tests__/recording-control.test.ts server/modules/ai-driven-recorder/__tests__/ws-relay.test.ts
```

Expected: PASS.

### Task 2: Wire AbortSignal End-To-End (C2)

STOP currently flips status flags while the session keeps running. Thread an `AbortSignal` through the session and make STOP semantics correct.

**Files:**
- Modify: `agent/recorder/ai-recording-session.ts` (params interface ~line 48, `start()` loop ~lines 308-333)
- Modify: `agent/recording-control.ts:241-258`
- Test: `agent/recorder/__tests__/ai-recording-session.test.ts`, `agent/__tests__/recording-control.test.ts`

- [ ] **Step 1: Write failing session tests**

Add to `ai-recording-session.test.ts` (reuse its existing mocked-Stagehand harness):

```ts
it('stops before the next NL step when aborted between steps', async () => {
  const executed: number[] = [];
  const session = new AIRecordingSession();
  vi.spyOn(session as any, 'executeNlStep').mockImplementation(async (_i: number, step: any) => {
    executed.push(step.sequence);
    return { nlStepIndex: step.sequence, startStepIdx: 0, endStepIdx: 0 };
  });
  const controller = new AbortController();
  await expect(session.start({
    ...baseParams(),
    signal: controller.signal,
    options: {},
  })).rejects.toThrow(/aborted/i);
  controller.abort(); // abort before first step would throw immediately; abort inside executeNlStep instead:
});

it('rejects immediately when the signal is already aborted', async () => {
  const controller = new AbortController();
  controller.abort();
  const session = new AIRecordingSession();
  await expect(session.start({ ...baseParams(), signal: controller.signal, options: {} }))
    .rejects.toThrow(SessionAbortedError);
});
```

For the first test, abort from inside the mocked `executeNlStep` after pushing one entry so the between-steps check fires:

```ts
vi.spyOn(session as any, 'executeNlStep').mockImplementation(async (_i, step) => {
  executed.push(step.sequence);
  controller.abort();
  return { nlStepIndex: step.sequence, startStepIdx: 0, endStepIdx: 0 };
});
```

Assert `executed.length === 1` and error is `instanceof SessionAbortedError`. Export the error class from the module:

- [ ] **Step 2: Run tests and confirm failure**

```powershell
npx vitest run agent/recorder/__tests__/ai-recording-session.test.ts
```

Expected: FAIL — no `signal` support / no `SessionAbortedError`.

- [ ] **Step 3: Implement session-side abort**

In `ai-recording-session.ts`:

```ts
export class SessionAbortedError extends Error {
  constructor() {
    super('AI recording session aborted');
    this.name = 'SessionAbortedError';
  }
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new SessionAbortedError();
}
```

Extend `AIRecordingSessionParams` with `signal?: AbortSignal;`. Inside `start(params)`:

- First line of the `try` block (after console.warn patching): `throwIfAborted(params.signal);`
- Inside the step loop, at the top of each iteration before `executeNlStep`: `throwIfAborted(params.signal);`
- After the loop, before consolidator flush: `throwIfAborted(params.signal);`

Do not wrap individual Stagehand calls here — Task 3's timeout wrapper will also observe the signal.

- [ ] **Step 4: Write failing control-level test**

In `recording-control.test.ts`:

```ts
it('reports an aborted COMPLETE and resets state once when STOP arrives mid-run', async () => {
  const emitted: Array<{ event: string; data: any }> = [];
  let releaseStart!: (value: any) => void;
  const startSpy = vi.spyOn(AIRecordingSession.prototype, 'start')
    .mockImplementation(() => new Promise((resolve) => { releaseStart = resolve; }));
  const resetAfterStop = vi.fn();
  const deps = makeDeps({ emitRecordingEvent: (e, d) => emitted.push({ event: e, data: d }), resetAfterStop });

  const running = handleRecordingControlMessage(
    { event: 'AI_RECORDER_START', data: { runId: 'r1', projectId: 'p1', nlCase: makeNlCase(), providerConfigId: 'pc1', caseId: 'c1', suiteId: 's1' } },
    deps,
  );
  await vi.waitForAsync(() => {}); // let START handler reach await
  await handleRecordingControlMessage({ event: 'AI_RECORDER_STOP', data: { runId: 'r1' } }, deps);
  expect(resetAfterStop).not.toHaveBeenCalled();          // STOP must not reset while session winds down

  releaseStart(undefined);                                 // session rejects via abort in real flow
  await running;
  const complete = emitted.find((e) => e.event === 'AI_RECORDER_COMPLETE');
  expect(complete?.data.error).toMatch(/abort/i);
  expect(resetAfterStop).toHaveBeenCalledTimes(1);         // exactly once, from START finally
});
```

- [ ] **Step 5: Implement control-side changes**

Rewrite `agent/recording-control.ts:241-258`:

```ts
if (parsed.event === AI_RECORDER_STOP_EVENT) {
  const { runId } = parsed.data || {};
  deps.logger.info(`[AGENT] Received AI Recorder Stop: run=${runId}`);
  // 仅触发中止；状态复位统一由 START 处理器的 finally 负责，
  // 避免 session 仍在收尾时 Agent 就被标记 idle。
  currentAiSession?.abort();
  const cb = takeoverCallbacks.get(runId);
  if (cb) {
    cb.clearTimeout();
    cb.resolve(false);
    takeoverCallbacks.delete(runId);
  }
  return true;
}
```

Adjust the START catch block so aborts are reported as a normal terminal event, not an error log storm:

```ts
} catch (error) {
  const aborted = error instanceof SessionAbortedError;
  if (!aborted) deps.logger.error('[AGENT] AI Recorder failed:', error);
  deps.emitRecordingEvent(AI_RECORDER_COMPLETE_EVENT, {
    runId,
    error: aborted ? 'Recording aborted by user' : (error instanceof Error ? error.message : String(error)),
    caseId,
    suiteId,
  });
  return true;
} finally {
  currentAiSession = null;
  deps.resetAfterStop();
}
```

Import `SessionAbortedError` from `./recorder/ai-recording-session.ts`. Keep `currentAiSession = new AbortController()` assignment and pass `signal: currentAiSession.signal` into `session.start({...})`.

Also fix the pre-existing double-reset risk: the manual `RECORDING_STOP` branch is unrelated and stays as-is.

- [ ] **Step 6: Run focused tests**

```powershell
npx vitest run agent/recorder/__tests__/ai-recording-session.test.ts agent/__tests__/recording-control.test.ts
```

Expected: PASS.

### Task 3: Enforce timeoutPerStep On Every Stagehand Call (H1)

`options.timeoutPerStep` exists but is never used; a hung LLM/browser call blocks the agent forever.

**Files:**
- Modify: `agent/recorder/ai-recording-session.ts` (helper + wrap call sites at former lines ~386, ~398, ~447, ~476: `page.act(...)`, `observe(...)`, extract verification calls, cleanup act)
- Test: `agent/recorder/__tests__/ai-recording-session.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
it('fails the NL step when a single act attempt exceeds timeoutPerStep', async () => {
  const session = new AIRecordingSession();
  vi.spyOn(session as any, 'getStagehandPage').mockResolvedValue({
    act: () => new Promise(() => {}),   // never resolves
  });
  const events: any[] = [];
  const boundaries = await captureRun(session, baseParams({
    options: { timeoutPerStep: 30 },
  }), events);                           // captureRun = existing harness driving one fill-step NL case
  expect(events.some((e) => e.event === 'step:failed')).toBe(true);
  expect(boundaries[0]).toBeDefined();   // step terminates instead of hanging
}, 10_000);
```

Adapt names to the file's existing harness; the essential assertions are: hung `act` + small `timeoutPerStep` ⇒ `step:failed` emitted and `start()` resolves (does not hang).

- [ ] **Step 2: Confirm failure**

```powershell
npx vitest run agent/recorder/__tests__/ai-recording-session.test.ts
```

Expected: the new test times out or fails because the hang is not bounded.

- [ ] **Step 3: Implement the wrappers**

Add to `ai-recording-session.ts`:

```ts
const DEFAULT_TIMEOUT_PER_STEP_MS = 120_000;

class StepCallTimeoutError extends Error {
  constructor(op: string) {
    super(`Stagehand ${op} exceeded timeoutPerStep`);
    this.name = 'StepCallTimeoutError';
  }
}

private async withStepTimeout<T>(op: string, promise: Promise<T>): Promise<T> {
  const ms = this.timeoutMs;
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new StepCallTimeoutError(op)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
    // 触发后放弃引用；底层 SDK 挂起由 STOP abort 兜底
    void promise.catch(() => {});
  }
}
```

Store `this.timeoutMs = params.options.timeoutPerStep && params.options.timeoutPerStep > 0 ? params.options.timeoutPerStep : DEFAULT_TIMEOUT_PER_STEP_MS;` at the top of `start()`.

Wrap every awaited Stagehand interaction inside `executeNlStep` (the `act()` attempts, the lazy `observe()`, each `extract()` verification, and the dirty-state cleanup `act()`):

```ts
const actResult = await this.withStepTimeout('act', page.act(instruction));
const observations = await this.withStepTimeout('observe', stagehand.observe(...));
const extracted = await this.withStepTimeout('extract', stagehand.extract(...));
```

Treat `StepCallTimeoutError` like any other attempt failure: it counts toward `maxRetriesPerStep`, emits the existing retry/failure events with message `Stagehand act exceeded timeoutPerStep`, and never escapes as an unhandled rejection (the abandoned promise gets a no-op catch).

- [ ] **Step 4: Run focused tests**

```powershell
npx vitest run agent/recorder/__tests__/ai-recording-session.test.ts
```

Expected: PASS including the new timeout test.

### Task 4: Route Takeover Through RECORDING_EVENT Envelope (C3)

The browser sends a bare `AI_RECORDER_TAKEOVER_COMPLETE` that no server subscriber handles. Wrapping it in the `RECORDING_EVENT` envelope makes `server/modules/recording/ws-handlers.ts:30` broadcast the inner event to all WS clients including the agent, whose router already handles the inner name (`agent/recording-control.ts:260`).

**Files:**
- Modify: `client/features/ai-driven-recorder/AiDrivenRecorderPage.tsx:123-142`
- Modify: `client/features/ai-driven-recorder/RecorderRuntimePanel.tsx` (Done button pending state)
- Test: `client/features/ai-driven-recorder/__tests__/AiDrivenRecorderPage.test.tsx` (+ panel test file if present)

- [ ] **Step 1: Write failing page test**

```tsx
it('sends takeover complete wrapped in RECORDING_EVENT envelope with projectId', async () => {
  const sent: string[] = [];
  const FakeWS = vi.fn().mockImplementation(() => {
    const listeners: Record<string, (() => void)[]> = {};
    return {
      onopen: null as any,
      onerror: null as any,
      close: vi.fn(),
      send: (msg: string) => sent.push(msg),
      addEventListener: (type: string, cb: () => void) => { (listeners[type] ||= []).push(cb); },
      removeEventListener: vi.fn(),
      get readyState() { return 1; },
      __fireOpen: () => (listeners['open'] || []).forEach((cb) => cb()),
    };
  });
  vi.stubGlobal('WebSocket', FakeWS);

  renderPage({ state: runningStateWithTakeover() });   // existing page-render helper
  fireEvent.click(screen.getByRole('button', { name: /done/i }));

  const ws = FakeWS.mock.results[0].value;
  await act(async () => { ws.__fireOpen(); });
  const payload = JSON.parse(sent[0]);
  expect(payload.event).toBe('RECORDING_EVENT');
  expect(payload.data.event).toBe('AI_RECORDER_TAKEOVER_COMPLETE');
  expect(payload.data.data).toMatchObject({ runId: 'run-1', nlStepIndex: 2, projectId: 'project-1' });
  expect(screen.getByRole('button', { name: /done/i })).toBeDisabled();  // pending until socket closes
});
```

Match the existing page-test scaffolding (providers, mock hook) used in that file today.

- [ ] **Step 2: Confirm failure**

```powershell
npx vitest run client/features/ai-driven-recorder
```

Expected: FAIL — bare event name, no projectId, button never disables.

- [ ] **Step 3: Implement**

Replace `handleTakeoverComplete` in `AiDrivenRecorderPage.tsx`:

```tsx
const [takeoverPending, setTakeoverPending] = useState(false);

const handleTakeoverComplete = useCallback((nlStepIndex: number) => {
  if (!state.runId || !currentProjectId || takeoverPending) return;
  setTakeoverPending(true);
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const ws = new WebSocket(`${protocol}//${window.location.host}`);
  const finish = () => { setTakeoverPending(false); try { ws.close(); } catch { /* noop */ } };
  ws.onopen = () => {
    // 必须用 RECORDING_EVENT 信封：ws-handlers 只订阅该信封并广播内部事件给 Agent
    ws.send(JSON.stringify({
      event: 'RECORDING_EVENT',
      data: {
        event: 'AI_RECORDER_TAKEOVER_COMPLETE',
        data: { runId: state.runId, nlStepIndex, projectId: currentProjectId },
      },
    }));
    finish();
  };
  ws.onerror = finish;
  setTimeout(finish, 5000); // 兜底：socket 无响应时恢复按钮
}, [state.runId, currentProjectId, takeoverPending]);
```

Pass `takeoverPending` into `RecorderRuntimePanel` and disable the Done button while pending (add `disabled={takeoverPending}` plus a subtle "Sending…" label swap). Keep the existing amber banner behavior otherwise unchanged.

- [ ] **Step 4: Run frontend focused tests**

```powershell
npx vitest run client/features/ai-driven-recorder
```

Expected: PASS.

### Task 5: Redact Secrets Before Live Persistence (H2)

Live consolidated steps carry plaintext `dataValue` and are persisted immediately server-side. Apply the same exact-match redaction the refiner uses, but at the bridge boundary.

**Files:**
- Modify: `agent/recorder/refiner.ts:110-121` (extract helper)
- Modify: `agent/recorder/recording-bridge.ts:29-58`
- Modify: `agent/recording-control.ts` (START handler, pass secrets into bridge callbacks)
- Test: `agent/recorder/__tests__/refiner.test.ts`, `agent/recorder/__tests__/recording-bridge.test.ts`

- [ ] **Step 1: Write failing tests**

In `refiner.test.ts`:

```ts
import { redactValue } from '../refiner';

describe('redactValue', () => {
  it('replaces exact secret matches only', () => {
    expect(redactValue('secret123', ['secret123'])).toBe('***');
    expect(redactValue('login-secret123-page', ['secret123'])).toBe('login-secret123-page');
    expect(redactValue('', ['x'])).toBe('');
  });
});
```

In `recording-bridge.test.ts`:

```ts
it('redacts secret dataValue from step, description, and element payload', () => {
  const emitted: any[] = [];
  bridgeConsolidatedStep(
    makeFillStep('password-input', 'supersecret'),        // action 'fill', value 'supersecret'
    'p1', 'c1', 's1',
    {
      secrets: ['supersecret'],
      emitStepRecorded: (d) => emitted.push(['step', d]),
      emitElementRecorded: (d) => emitted.push(['el', d]),
    },
  );
  const step = emitted.find(([t]) => t === 'step')![1];
  expect(step.stepInfo.dataValue).toBe('***');
  expect(step.stepInfo.step.data).toBe('***');
  expect(JSON.stringify(step)).not.toContain('supersecret');
});
```

Extend `BridgeCallbacks` usage accordingly; keep old callers working via optional field.

- [ ] **Step 2: Confirm failures**

```powershell
npx vitest run agent/recorder/__tests__/refiner.test.ts agent/recorder/__tests__/recording-bridge.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement**

In `refiner.ts`, refactor the exact-match core out of `redactSecrets`:

```ts
/** 精确匹配脱敏：值等于任一 secret 时替换为 ***（与 redactSecrets 同规则）。 */
export function redactValue(value: string, secrets: string[]): string {
  if (!value || secrets.length === 0) return value;
  return secrets.includes(value) ? '***' : value;
}

export function redactSecrets(steps: TestStep[], secrets: string[]): TestStep[] {
  if (secrets.length === 0) return steps;
  return steps.map((step) => (step.data ? { ...step, data: redactValue(step.data, secrets) } : step));
}
```

In `recording-bridge.ts`, add optional `secrets?: string[]` to `BridgeCallbacks` and compute the safe value once:

```ts
const dataValue = cleanStep.value || '';
const safeValue = redactValue(dataValue, callbacks.secrets ?? []);
```

Then use `safeValue` everywhere `dataValue` was used (line 44 goto target stays raw URL — `cleanStep.value` — intentionally untouched for `goto`; line 45 `data:` field, line 46 description builder input, line 75 `stepInfo.dataValue`). Import `redactValue` from `./refiner.ts`.

In `recording-control.ts` START handler, compute the same secret list the refiner uses and pass it through:

```ts
const secrets = (nlCase.testData ?? [])
  .filter((td) => /password|secret|token|key/i.test(td.key))
  .map((td) => td.value);
...
onConsolidatedStep: (step) => {
  bridgeConsolidatedStep(step, projectId, caseId, suiteId, {
    secrets,
    emitStepRecorded: ..., emitElementRecorded: ...,
  });
},
```

Consider extracting that filter into one shared helper used by both this and the refiner-options construction (~line 338) so the lists can never diverge:

```ts
// agent/recorder/refiner.ts
export function extractSecretValues(testData: NlTestCaseTestData[]): string[] {
  return (testData ?? [])
    .filter((td) => /password|secret|token|key/i.test(td.key))
    .map((td) => td.value);
}
```

and use it in both places.

- [ ] **Step 4: Run focused tests**

```powershell
npx vitest run agent/recorder/__tests__/refiner.test.ts agent/recorder/__tests__/recording-bridge.test.ts agent/__tests__/recording-control.test.ts
```

Expected: PASS.

### Task 6: Untrack agent/.env

`git ls-files` confirms `agent/.env` is tracked while holding a real `AGENT_SECRET`; `git check-ignore` shows no matching ignore rule covers it.

**Files:**
- Modify: `.gitignore`
- Untrack: `agent/.env`

- [ ] **Step 1: Add precise ignore rule**

Append to `.gitignore` (keep the generic `.env` entry untouched):

```gitignore
agent/.env
```

- [ ] **Step 2: Untrack without deleting the local file**

```powershell
git rm --cached agent/.env
git status --short -- agent/.env
```

Expected: `agent/.env` listed under staged deletions (`D ` prefix) while the local file remains on disk; subsequent edits show as untracked+ignored.

- [ ] **Step 3: Verify loader still works and record rotation note**

Confirm `agent/index.ts` config precedence reads the local file at runtime (it does — CLI arg > env > `agent-config.json` > default), so nothing breaks locally. Report to the user that the previously committed secret must be rotated manually since it remains in git history.

### Task 7: Full Verification

- [ ] **Step 1: Focused suites**

```powershell
npx vitest run agent/__tests__ agent/recorder/__tests__ server/modules/ai-driven-recorder/__tests__ client/features/ai-driven-recorder
```

Expected: all PASS.

- [ ] **Step 2: Full gates**

```powershell
npm run lint
npm test
npm run build
```

Expected: exit 0 for all three (existing non-failing warnings acceptable).
