# AI Recorder Local-Server Execution Design

Date: 2026-08-23
Status: Approved design — pending written review
Owner: OpenCode

## 1. Problem

AI Recorder currently requires a separate Agent process connected over WebSocket. A user running QuantumQA locally (single machine, no agent) cannot use AI recording at all, even though the server process already ships every capability needed to execute a recording: `@browserbasehq/stagehand` and Playwright are installed, and the hardened `AIRecordingSession` (P0 abort/timeouts/refinedSteps) is pure TypeScript with no agent-only dependencies.

## 2. Goals

1. Support an explicit per-run execution mode: `agent` (today's behavior, unchanged) or `local` (server executes the recording in-process).
2. No automatic fallback between modes — the requested mode is authoritative; wrong-mode failures fail clearly.
3. Both paths produce byte-identical observable behavior: same SSE event shapes, same draft-suite persistence, same run lifecycle states.
4. Reuse the P0 hardening (abort signal, `timeoutPerStep`, refinedSteps persistence, takeover resolution) without duplication.
5. Protect the server from resource exhaustion with a bounded number of concurrent local sessions.
6. Zero frontend runtime changes beyond an execution-position selector and payload field.

## 3. Non-Goals

- Automatic fallback when no idle Agent exists.
- Remote/distributed browser execution.
- Recovery/reaper for runs orphaned by a server restart (pre-existing gap for both modes).
- Redaction of the manual-recording path.
- Changes to the NL-case lifecycle or suite schemas.

## 4. API Contract

`POST /api/ai-driven-recorder/:projectId/runs` gains:

```jsonc
{
  "executionMode": "agent" | "local"   // optional, default "agent"
}
```

Validation:

| Case | Behavior |
|---|---|
| `executionMode` absent | `'agent'` (backward compatible) |
| Invalid value | 400 ValidationError |
| `'agent'`, no idle agent | Existing 503 ServiceUnavailableError |
| `'local'`, concurrency limit reached | 409 ConflictError |

The start response shape (`{runId, suiteId, caseId, status}`) is unchanged. Run rows record the chosen mode so history can display it:

- Migration `011_add_recorder_execution_mode.ts` adds `execution_mode TEXT NOT NULL DEFAULT 'agent'` to `ai_driven_recording_runs`.
- `AiDrivenRecorderRunRow` gains `execution_mode`; `getRun`/`getRunsByProject` responses expose `executionMode`.

## 5. Frontend

`RecorderConfigPanel` adds an **Execution Position** select: `Agent` / `Local server`, persisted to localStorage alongside existing config keys and included in every start request. No other UI change: Runtime panel, takeover Done button, abort, and history work identically because all SSE/persistence shapes are unchanged. History rows may display the mode badge (low-cost addition if the row type carries it).

## 6. Local Runner Lifecycle

New module `server/modules/ai-driven-recorder/local-runner.ts` owned by the controller:

```text
startRun(mode='local')
  -> validate nlCase/provider/matrix (existing checks)
  -> acquire local-session slot (bounded, see §8)
  -> create draft suite + run row (mode='local')
  -> resolve decrypted providerConfig directly from repository (no WS round trip)
  -> register run in LocalRunRegistry {runId -> {abortController, takeoverResolvers[]}}
  -> spawn async execute():
        new AIRecordingSession().start({
          nlCase, providerConfig,
          options: {...userOptions, headless: userOptions.headless ?? true},
          signal: abortController.signal,
          onEvent: (event, data) => sseGateway.emit(runId, event, {...data})   // identical shapes to ws-relay bridge
          onConsolidatedStep: bridgeConsolidatedStep(...)                      // reuse agent bridge incl. secret redaction
          onTakeoverRequest: register resolver in registry; wait resolve/timeout(120s)
        })
  -> on success: finalizeRunCompletion(...)   // shared, see §9
  -> on SessionAbortedError: mark run failed 'Recording aborted by user' + run:error SSE
  -> on other error: mark run failed(message) + run:error SSE
  -> finally: release slot, unregister run
```

Defaults and notes:

- The run stays in status `'running'` for its whole life in both modes (V1 never sets `'refining'`/`'replaying'`; those states exist only in type definitions today). Lifecycle parity therefore holds trivially, and this feature adds no new transitions.
- `headless`: the config panel already sends an explicit value (default `false`, i.e. headful) and local mode honors it verbatim — headful is the intended single-machine experience and enables takeover. A server-side backstop (`userOptions.headless ?? true`) applies only to API callers that omit the option entirely.
- Progress events forwarded to SSE are injected with `{runId, caseId, suiteId}` exactly as the agent path does (`recording-control.ts` onEvent wrapper), keeping SSE payloads byte-identical.
- Live captured steps/elements persist through the **existing RecordingService route**: the runner invokes it directly in-process instead of round-tripping over WS —

```ts
// mirrors server/modules/recording/ws-handlers.ts:8
const recordingBridge = new RecordingService(defaultIngestService, wsService);
// inside onConsolidatedStep wiring:
recordingBridge.handleStepRecorded({ projectId, stepInfo, type: 'UI', caseId, suiteId });
recordingBridge.handleElementRecorded({ projectId, element, caseId, suiteId });
```

  (`bridgeConsolidatedStep` still performs redaction/shaping; only transport differs from the agent path). The `ai_driven_recording_step_logs` table is unused by production in both modes today and remains out of scope.

## 7. Takeover And Abort Routing (dual-path)

New shared registry module `server/modules/ai-driven-recorder/run-registry.ts`:

```ts
interface LocalRunHandle { abort(): void; resolveTakeover(result: boolean): void }
registerRun(runId, handle): void; unregisterRun(runId): void; getRunHandle(runId)
```

- `ws-relay` TAKEOVER_COMPLETE case: first call `getRunHandle(runId)?.resolveTakeover(true)` (local mode), then broadcast to agents as today (agent mode ignores it — its callback map has no such runId). One message serves both modes.
- `controller.deleteRun`: if a local handle exists, call `handle.abort()` instead of relying solely on the WS STOP broadcast (broadcast retained for agent mode; harmless otherwise). Deletion order stays: abort → SSE run:error → cleanup SSE → delete rows.
- Registry entries are always removed in the runner's `finally` and on delete.

## 8. Concurrency Protection

- Max concurrent local sessions: `AI_RECORDER_MAX_LOCAL_RUNS` env, default `1`.
- Exceeding the limit fails fast with 409 ConflictError ("Local recorder is busy"), *before* creating any draft suite or run row.
- Slot is acquired synchronously inside `startRun` and released in the runner's `finally`.

## 9. Shared Completion Persistence

Extract from `ws-relay.handleAiRecorderComplete` into `finalize-run.ts`:

```ts
finalizeRunCompletion(deps: {repository, sseGateway}, params: {
  runId,
  suiteId,      // preallocated IDs round-trip: agent echoes them in COMPLETE data;
  caseId,       // local runner knows them from startRun. Required for the
                // update-preallocated-suite branch (run.result_suite_id is NULL until completion).
  refinedSteps?,
  replayReport?,
}): {suiteId, caseId}
```

Behavior identical to today: refinedSteps -> update pre-allocated suite/case (or fallback create when IDs are empty), link `nlCase.generatedSuiteId`, `updateRunResult`, status completed, SSE `run:complete`. Both `ws-relay` (agent COMPLETE) and `local-runner` (session return) call this one function, eliminating the class of field-drift bugs P0 fixed. Error-path marking (`failed` + run:error) likewise shared. Failure/abort paths must re-check that the run row still exists before writing status or emitting `run:error`, so a run deleted mid-flight cannot resurrect SSE emitters or overwrite state (guards against the delete-vs-inflight race). `stepBoundaries` is not persisted today and stays unpersisted.

Note an accepted asymmetry: agent-mode 503 (no idle agent) fires after draft-suite/run creation and leaves those rows behind; local-mode 409 is checked first and has zero side effects.

## 10. Failure Handling

| Failure | Behavior |
|---|---|
| Invalid `executionMode` | 400 before any side effect |
| Local limit reached | 409 before draft-suite creation |
| Session throws | run failed(message), run:error SSE, slot+registry cleaned |
| Abort via delete | run failed('Recording aborted by user'); in-flight runner observes deleted rows and skips further writes/emits |
| Provider config missing | 404 (existing check, unchanged) |
| Browser launch failure on server | surfaced as run failure message (Stagehand init error text) |

## 11. Security

- Decrypted API key stays in-process memory only (already the server's own data; strictly less exposed than the WS round trip).
- No new logging of secrets; existing redaction applies because the local path reuses `bridgeConsolidatedStep`.
- Registry stores no PII beyond runId.

## 12. Testing Strategy

- `local-runner.test.ts`: event bridging shapes vs ws-relay contract (incl. runId/caseId/suiteId injection); RecordingService invoked directly for step/element records; headless passthrough; abort mid-session marks aborted; takeover resolve via registry; delete-vs-inflight guard; slot leak-free on success/failure.
- `finalize-run` extraction: existing ws-relay tests keep passing unchanged (pure refactor proof); new direct unit tests incl. suiteId/caseId round-trip branch and deleted-run guard.
- `run-registry` unit tests.
- Migration 011: column/default/row exposure.
- Controller: mode dispatch, 409 on limit (before side effects — assert no suite/run rows created), invalid mode 400, delete aborts local run, mode surfaced in run responses.
- Frontend: selector renders/persists, payload includes `executionMode`.

## 13. Acceptance Criteria

1. With no Agent connected, selecting Local server starts a recording, streams live steps (persisted via RecordingService), and lands refined steps in a draft suite linked back to the NlCase under the preallocated IDs.
2. With an Agent connected, Agent mode behaves exactly as today (regression-safe).
3. Wrong-mode requests fail explicitly (agent w/o idle -> 503; local busy -> 409 with zero side effects); no silent fallback ever occurs.
4. Delete during a local run stops the browser session (abort observed by session), cleans rows/registry/slot, and produces no post-delete SSE or status writes.
5. Takeover Done resolves a waiting local session when headful.
6. Concurrent local starts above the configured cap are rejected with 409 and leave zero side effects.
7. Both modes share one completion-persistence implementation with identical preallocated-suite behavior.
8. Run history/status expose `executionMode` for both modes.
