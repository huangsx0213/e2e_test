# AI Pipeline & NL Test Cases — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build fully functional AI Pipeline configuration/execution UI with interactive flow visualization and NL Test Cases listing/detail page, with backend support for true human-in-the-loop (interactive mode).

**Architecture:** Three-panel Pipeline page (Config | Flow Canvas | Node Detail) with SSE-driven real-time updates. NL Cases page with filterable table + inline detail panel. Backend uses LangGraph streaming + interrupt detection + Promise-based resume queue for interactive mode.

**Tech Stack:** React 19, TypeScript, Tailwind CSS, React Query, mermaid (flow diagrams), Lucide React (icons), Express, better-sqlite3, LangGraph v1.3

---

## File Structure Summary

| Action | File | Purpose |
|--------|------|---------|
| CREATE | `server/migrations/020_pipeline_agent_logs.ts` | Migration for agent_logs + new pipeline_run columns |
| MODIFY | `server/modules/ai-pipeline/index.ts` | Add interactive mode, streaming, resume, logs, runs list |
| MODIFY | `server/modules/nl-cases/index.ts` | Add listByProject endpoint |
| MODIFY | `server/modules/nl-cases/repository.ts` | Add listByProject method |
| MODIFY | `client/shared/services/api.ts` | Add pipeline + nlCases API clients |
| MODIFY | `client/shared/hooks/queryKeys.ts` | Add pipeline + nlCases query keys |
| MODIFY | `client/shared/hooks/useQueryHooks.ts` | Add pipeline + nlCases hooks |
| CREATE | `client/shared/hooks/usePipelineSSE.ts` | SSE subscription hook |
| CREATE | `client/features/nl-pipeline/AiPipelinePage.tsx` | Full Pipeline page (replace stub) |
| CREATE | `client/features/nl-pipeline/PipelineConfigPanel.tsx` | Left config panel |
| CREATE | `client/features/nl-pipeline/PipelineFlowCanvas.tsx` | Center mermaid flowchart |
| CREATE | `client/features/nl-pipeline/PipelineNodeDetail.tsx` | Right detail panel |
| CREATE | `client/features/nl-pipeline/PipelineRunHistory.tsx` | Run history list view |
| CREATE | `client/features/nl-cases/NlCasesPage.tsx` | Full NL Cases page (replace stub) |

---

## Task 1: Database Migration — Agent Logs + Pipeline Run Columns

**Files:**
- Create: `server/migrations/020_pipeline_agent_logs.ts`
- Modify: `server/migrations/index.ts`

- [ ] **Step 1: Create the migration file**

Write `server/migrations/020_pipeline_agent_logs.ts`:

```typescript
import { db } from '../shared/db/client.ts';

export const migration020 = {
  id: '020_pipeline_agent_logs',
  up: () => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS pipeline_agent_logs (
        id           TEXT PRIMARY KEY,
        run_id       TEXT NOT NULL REFERENCES pipeline_runs(id) ON DELETE CASCADE,
        batch        INTEGER NOT NULL,
        agent_name   TEXT NOT NULL,
        phase        TEXT NOT NULL,
        input_prompt TEXT,
        output_data  TEXT,
        token_usage  TEXT,
        latency_ms   INTEGER,
        raw_trace    TEXT,
        status       TEXT NOT NULL DEFAULT 'RUNNING',
        created_at   TEXT NOT NULL DEFAULT (datetime('now'))
      );

      ALTER TABLE pipeline_runs ADD COLUMN config TEXT;

      ALTER TABLE pipeline_runs ADD COLUMN checkpoint_data TEXT;
    `);
  },
};
```

- [ ] **Step 2: Register the migration in index.ts**

Read `server/migrations/index.ts` to see the current import and array pattern, then add:

At top of file, after the last import:
```typescript
import { migration020 } from './020_pipeline_agent_logs.ts';
```

In the `migrations` array, append:
```typescript
  migration020,
```

- [ ] **Step 3: Verify migration compiles and runs**

```powershell
npx tsx server/migrate.ts
```
Expected: No errors, migration 020 appears in `schema_migrations` table.

- [ ] **Step 4: Commit**

```bash
git add server/migrations/020_pipeline_agent_logs.ts server/migrations/index.ts
git commit -m "feat: add pipeline_agent_logs table and pipeline_runs config/checkpoint columns"
```

---

## Task 2: Backend — NL Cases listByProject Support

**Files:**
- Modify: `server/modules/nl-cases/repository.ts`
- Modify: `server/modules/nl-cases/index.ts`

- [ ] **Step 1: Add listByProject to repository**

In `server/modules/nl-cases/repository.ts`, add method to the `NlCaseRepository` class after the `list()` method (around line 33):

```typescript
  listByProject(projectId: string): NlTestCase[] {
    const rows = db.prepare(
      'SELECT id FROM natural_language_test_cases WHERE project_id = ? ORDER BY rowid'
    ).all(projectId) as Array<{ id: string }>;
    return rows.map(r => this.get(r.id)).filter(Boolean) as NlTestCase[];
  }
```

- [ ] **Step 2: Add GET /by-project/:projectId route**

In `server/modules/nl-cases/index.ts`, add a custom route before the module is created. First import `Router` and `withErrorHandling`:

Modify the file to be:
```typescript
import { Router } from 'express';
import { createCrudModule } from '../../shared/http/crud.ts';
import { withErrorHandling } from '../../shared/http/async-handler.ts';
import { nlCaseRepo } from './repository.ts';
import { normalizeNlCase } from './mapper.ts';
import { nlCasePayloadSchema, nlCasePatchSchema } from './schema.ts';

const customRouter = Router();

customRouter.get('/by-project/:projectId', withErrorHandling((req, res) => {
  const cases = nlCaseRepo.listByProject(req.params.projectId);
  res.json(cases);
}));

export const nlCasesModule = {
  basePath: '/api/nl-cases',
  router: customRouter,
};
```

Wait—check if `createCrudModule` returns a `{ basePath, router }` object. If so, we need to merge the routes.

Read `server/shared/http/crud.ts` quickly to verify the return type.

Let me check:
```typescript
// ... after reading crud.ts ...
```

If `createCrudModule` returns `{ basePath: string, router: Router }`, then modify as:

```typescript
import { Router } from 'express';
import { createCrudModule } from '../../shared/http/crud.ts';
import { withErrorHandling } from '../../shared/http/async-handler.ts';
import { nlCaseRepo } from './repository.ts';
import { normalizeNlCase } from './mapper.ts';
import { nlCasePayloadSchema, nlCasePatchSchema } from './schema.ts';

const crudModule = createCrudModule({
  basePath: '/api/nl-cases',
  repository: nlCaseRepo,
  normalize: normalizeNlCase,
  createSchema: nlCasePayloadSchema,
  patchSchema: nlCasePatchSchema,
});

crudModule.router.get('/by-project/:projectId', withErrorHandling((req, res) => {
  const cases = nlCaseRepo.listByProject(req.params.projectId);
  res.json(cases);
}));

export const nlCasesModule = crudModule;
```

- [ ] **Step 3: Verify with a quick test**

```powershell
npx tsx -e "import './server/modules/nl-cases/repository.ts'; console.log('repository compiles')"
```

- [ ] **Step 4: Commit**

```bash
git add server/modules/nl-cases/repository.ts server/modules/nl-cases/index.ts
git commit -m "feat: add listByProject to nl-cases repository and /by-project/:projectId endpoint"
```

---

## Task 3: Backend — Pipeline Runs List Endpoint

**Files:**
- Modify: `server/modules/ai-pipeline/index.ts`

- [ ] **Step 1: Add GET /runs/:projectId endpoint**

In `server/modules/ai-pipeline/index.ts`, add a new route BEFORE the `POST /:projectId/start` route (routes are matched in order):

```typescript
router.get('/runs/:projectId', withErrorHandling((req, res) => {
  const rows = db.prepare(
    'SELECT id, project_id, status, phase, current_batch, total_batches, mode, config, created_by, token_usage, created_at, updated_at FROM pipeline_runs WHERE project_id = ? ORDER BY created_at DESC LIMIT 50'
  ).all(req.params.projectId) as any[];
  res.json(rows.map(r => ({
    ...r,
    token_usage: r.token_usage ? JSON.parse(r.token_usage) : {},
    config: r.config ? JSON.parse(r.config) : null,
  })));
}));
```

- [ ] **Step 2: Verify the endpoint compiles**

```powershell
npx tsc --noEmit 2>&1 | Select-String "ai-pipeline"
```
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add server/modules/ai-pipeline/index.ts
git commit -m "feat: add GET /api/pipeline/runs/:projectId endpoint for pipeline run list"
```

---

## Task 4: Backend — Agent Logs Recording

**Files:**
- Modify: `server/modules/ai-pipeline/index.ts`

- [ ] **Step 1: Add agent log insertion helper function**

In `server/modules/ai-pipeline/index.ts`, after the `releaseSlot()` function, add:

```typescript
function insertAgentLog(params: {
  id: string;
  runId: string;
  batch: number;
  agentName: string;
  phase: string;
  inputPrompt?: any;
  outputData?: any;
  tokenUsage?: any;
  latencyMs?: number;
  rawTrace?: any[];
  status?: string;
}) {
  db.prepare(`
    INSERT INTO pipeline_agent_logs (id, run_id, batch, agent_name, phase, input_prompt, output_data, token_usage, latency_ms, raw_trace, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      output_data = excluded.output_data,
      token_usage = excluded.token_usage,
      latency_ms = excluded.latency_ms,
      raw_trace = excluded.raw_trace,
      status = excluded.status
  `).run(
    params.id,
    params.runId,
    params.batch,
    params.agentName,
    params.phase,
    params.inputPrompt ? JSON.stringify(params.inputPrompt) : null,
    params.outputData ? JSON.stringify(params.outputData) : null,
    params.tokenUsage ? JSON.stringify(params.tokenUsage) : null,
    params.latencyMs ?? null,
    params.rawTrace ? JSON.stringify(params.rawTrace) : null,
    params.status ?? 'RUNNING',
  );
}
```

- [ ] **Step 2: Add GET /:runId/logs endpoint**

After the GET /:runId/state route, add:

```typescript
router.get('/:runId/logs', withErrorHandling((req, res) => {
  const { runId } = req.params;
  const { agent } = req.query;
  let rows;
  if (agent) {
    rows = db.prepare(
      'SELECT * FROM pipeline_agent_logs WHERE run_id = ? AND agent_name = ? ORDER BY created_at'
    ).all(runId, agent as string);
  } else {
    rows = db.prepare(
      'SELECT * FROM pipeline_agent_logs WHERE run_id = ? ORDER BY created_at'
    ).all(runId);
  }
  res.json((rows as any[]).map(r => ({
    ...r,
    input_prompt: r.input_prompt ? JSON.parse(r.input_prompt) : null,
    output_data: r.output_data ? JSON.parse(r.output_data) : null,
    token_usage: r.token_usage ? JSON.parse(r.token_usage) : null,
    raw_trace: r.raw_trace ? JSON.parse(r.raw_trace) : [],
  })));
}));
```

- [ ] **Step 3: Add GET /:runId/checkpoint endpoint**

After the logs endpoint, add:

```typescript
router.get('/:runId/checkpoint', withErrorHandling((req, res) => {
  const row = db.prepare(
    'SELECT status, phase, checkpoint_data FROM pipeline_runs WHERE id = ?'
  ).get(req.params.runId) as any;
  if (!row) { res.status(404).json({ error: 'Pipeline run not found' }); return; }
  res.json({
    status: row.status,
    phase: row.phase,
    checkpoint_data: row.checkpoint_data ? JSON.parse(row.checkpoint_data) : null,
  });
}));
```

- [ ] **Step 4: Commit**

```bash
git add server/modules/ai-pipeline/index.ts
git commit -m "feat: add agent log recording, GET /:runId/logs and /:runId/checkpoint endpoints"
```

---

## Task 5: Backend — Interactive Mode (Streaming + Resume Queue)

This is the largest backend change. We need to rewrite the pipeline execution to support two modes:
- **Auto**: uses `pipeline.invoke()` (current behavior), ignores interrupts
- **Interactive**: uses `pipeline.stream()` with interrupt detection, pauses and waits for resume

**Files:**
- Modify: `server/modules/ai-pipeline/index.ts`

- [ ] **Step 1: Add resume queue and resume endpoint**

After the `runQueue` and `acquireSlot/releaseSlot` code, add the resume queue:

```typescript
const resumeWaiters = new Map<string, {
  resolve: (value: any) => void;
  reject: (err: Error) => void;
}>();
```

Replace the existing `POST /:runId/continue` route with a new `POST /:runId/resume`:

```typescript
router.post('/:runId/resume', withErrorHandling((req, res) => {
  const { action, feedback, editedData } = req.body;
  const { runId } = req.params;

  const row = db.prepare('SELECT * FROM pipeline_runs WHERE id = ?').get(runId) as any;
  if (!row) { res.status(404).json({ error: 'Pipeline run not found' }); return; }

  if (row.status !== 'WAITING_REVIEW') {
    res.status(400).json({ error: 'Pipeline is not waiting for review' }); return;
  }

  // Store audit log
  const logId = randomId('audit');
  db.prepare(`
    INSERT INTO pipeline_audit_log (id, run_id, checkpoint_id, action, user_id, snapshot)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(logId, runId, row.phase, action, 'anonymous', editedData ? JSON.stringify(editedData) : null);

  // Update run status
  db.prepare("UPDATE pipeline_runs SET status = 'RUNNING', updated_at = datetime('now') WHERE id = ?").run(runId);

  // Resolve the waiting promise
  const waiter = resumeWaiters.get(runId);
  if (waiter) {
    resumeWaiters.delete(runId);
    waiter.resolve({ action, feedback, editedData });
  }

  res.json({ success: true, action });
}));
```

- [ ] **Step 2: Modify the start endpoint for interactive mode**

The existing `POST /:projectId/start` handles Auto mode. We need to add Interactive mode support.

After the existing `const pipeline = await createNlPipeline(...)` line, the batch loop needs to change. Replace the existing batch loop (lines 144-183) with:

```typescript
      for (let i = 0; i < totalBatches; i++) {
        if (aborted) break;
        const epic = epics[i];
        sendEvent('batch:start', { batch: i + 1, total: totalBatches, epic: epic.title });

        const batchRequirementIds = new Set([epic.id, ...epic.children]);
        const batchRequirements = requirements.filter(r => batchRequirementIds.has(r.id));

        db.prepare('UPDATE pipeline_runs SET current_batch = ? WHERE id = ?').run(i + 1, runId);

        const config = { configurable: { thread_id: `${runId}-batch-${i}` } };

        const inputState = {
          projectId,
          requirementIds,
          currentBatch: batchRequirements,
          batchContext: { currentBatch: i, totalBatches, processedCount: i },
          projectContext: { name: epic.title, pages: [], endpoints: [] },
          phase: 'analysis',
          errors: [],
        };

        if (mode === 'interactive') {
          try {
            const result = await runBatchInteractive(pipeline, inputState, config, runId, i, sendEvent, resumeWaiters, aborted);
            if (result?.finalTestCases?.length) {
              allResults.push(result);
            }
            sendEvent('batch:complete', { batch: i + 1, total: totalBatches, testCases: result?.finalTestCases?.length || 0 });
          } catch (err: any) {
            sendEvent('pipeline:error', { phase: 'batch', batch: i + 1, message: err.message, recoverable: true });
          }
        } else {
          try {
            const result = await pipeline.invoke(inputState, config);
            if (result.finalTestCases?.length) {
              allResults.push(result);
            }
            sendEvent('batch:complete', { batch: i + 1, total: totalBatches, testCases: result.finalTestCases?.length || 0 });
          } catch (err: any) {
            sendEvent('pipeline:error', { phase: 'batch', batch: i + 1, message: err.message, recoverable: true });
          }
        }
      }
```

- [ ] **Step 3: Add the runBatchInteractive helper function**

Before the start route handler, add this function:

```typescript
async function runBatchInteractive(
  pipeline: Awaited<ReturnType<typeof createNlPipeline>>,
  inputState: any,
  config: any,
  runId: string,
  batchIndex: number,
  sendEvent: (event: string, data: unknown) => void,
  resumeWaiters: Map<string, { resolve: (value: any) => void; reject: (err: Error) => void }>,
  aborted: () => boolean,
): Promise<any | null> {
  // Phase tracking maps for SSE events
  const phaseMap: Record<string, string> = {
    'agent_test_analyst': 'analysis',
    'checkpoint_1': 'review-conditions',
    'agent_test_designer': 'design',
    'checkpoint_2': 'review-draft',
    'agent_quality_manager': 'quality',
    'checkpoint_3': 'final-review',
  };

  const nodeLogIds: Record<string, string> = {};
  let currentInput = inputState;

  while (true) {
    if (aborted()) return null;

    const stream = await pipeline.stream(currentInput, {
      ...config,
      streamMode: 'values',
    });

    let lastState: any = null;
    let hitInterrupt = false;
    let interruptPayload: any = null;

    for await (const chunk of stream) {
      if (aborted()) return null;

      lastState = chunk;

      // Detect the current node from phase changes
      const currentPhase = chunk.phase;
      if (currentPhase) {
        for (const [nodeName, phase] of Object.entries(phaseMap)) {
          if (phase === currentPhase) {
            if (nodeName.startsWith('agent_') && !nodeLogIds[nodeName]) {
              nodeLogIds[nodeName] = randomId('aglog');
              insertAgentLog({
                id: nodeLogIds[nodeName],
                runId,
                batch: batchIndex,
                agentName: nodeName.replace('agent_', ''),
                phase: currentPhase,
                status: 'RUNNING',
              });
              const agentLabel = nodeName.replace('agent_', '').replace(/_/g, ' ');
              sendEvent('agent:start', { agentName: nodeName.replace('agent_', ''), phase: currentPhase, batch: batchIndex, timestamp: Date.now() });
            }
            break;
          }
        }
      }
    }

    // Check for interrupts
    const interruptValue = (lastState as any)?.__interrupt__;
    if (interruptValue && interruptValue.length > 0) {
      hitInterrupt = true;
      interruptPayload = interruptValue[0].value;

      const checkpointNumber = lastState.phase === 'review-conditions' ? 1
        : lastState.phase === 'review-draft' ? 2 : 3;

      // Save checkpoint data
      db.prepare("UPDATE pipeline_runs SET checkpoint_data = ?, status = 'WAITING_REVIEW', phase = ?, updated_at = datetime('now') WHERE id = ?")
        .run(JSON.stringify(interruptPayload), lastState.phase, runId);

      sendEvent('checkpoint:waiting', {
        checkpointId: `${runId}-cp-${batchIndex}-${checkpointNumber}`,
        checkpointNumber,
        type: lastState.phase,
        summary: checkpointNumber === 1 ? `${interruptPayload.conditions?.length || 0} Test Conditions`
          : checkpointNumber === 2 ? `${interruptPayload.cases?.length || 0} Draft Cases`
          : 'Final Review',
        payload: interruptPayload,
      });

      // Wait for resume
      const resumeResult = await new Promise<any>((resolve, reject) => {
        resumeWaiters.set(runId, { resolve, reject });
        // Timeout after 30 minutes
        setTimeout(() => {
          if (resumeWaiters.has(runId)) {
            resumeWaiters.delete(runId);
            reject(new Error('Review timeout after 30 minutes'));
          }
        }, 30 * 60 * 1000);
      });

      sendEvent('checkpoint:resolved', {
        checkpointId: `${runId}-cp-${batchIndex}-${checkpointNumber}`,
        action: resumeResult.action,
        timestamp: Date.now(),
      });

      // Build resume command
      if (resumeResult.action === 'retry') {
        // For retry, re-run the same input
        currentInput = inputState;
        // Update the last agent log to FAILED before retry
        const lastAgentName = lastState.phase === 'review-conditions' ? 'test_analyst'
          : lastState.phase === 'review-draft' ? 'test_designer' : 'quality_manager';
        if (nodeLogIds[`agent_${lastAgentName}`]) {
          db.prepare("UPDATE pipeline_agent_logs SET status = 'FAILED' WHERE id = ?").run(nodeLogIds[`agent_${lastAgentName}`]);
          delete nodeLogIds[`agent_${lastAgentName}`];
        }
      } else if (resumeResult.action === 'edit') {
        // Use edited data as resume value
        currentInput = { ...lastState, [resumeResult.editedData?.field || '']: resumeResult.editedData?.value };
      } else {
        // approve — pass through as-is
        currentInput = lastState;
      }

      // Continue without the interrupt field
      delete (currentInput as any).__interrupt__;
      continue; // Loop back to stream again from current state
    }

    // No interrupt — stream complete, update agent logs
    if (lastState) {
      const finalPhase = lastState.phase;
      for (const [nodeName, logId] of Object.entries(nodeLogIds)) {
        db.prepare("UPDATE pipeline_agent_logs SET status = 'COMPLETED', updated_at = datetime('now') WHERE id = ?").run(logId);
        const agentName = nodeName.replace('agent_', '');
        const outputSummary = agentName === 'test_analyst'
          ? `${lastState.testConditions?.length || 0} conditions`
          : agentName === 'test_designer'
          ? `${lastState.draftTestCases?.length || 0} draft cases`
          : `${lastState.finalTestCases?.length || 0} final cases`;
        sendEvent('agent:complete', { agentName, phase: phaseMap[nodeName] || '', outputSummary, timestamp: Date.now(), batch: batchIndex });
      }
      return lastState;
    }

    return null;
  }
}
```

- [ ] **Step 4: Update the config field on start**

In the start endpoint, after creating the pipeline_runs row, add the config save:

```typescript
  db.prepare(`
    INSERT INTO pipeline_runs (id, project_id, status, phase, current_batch, total_batches, mode, created_by, config)
    VALUES (?, ?, 'RUNNING', 'init', 0, 0, ?, ?, ?)
  `).run(runId, projectId, mode || 'auto', 'anonymous',
    JSON.stringify({ requirementIds, flowIds: [], mode, providerConfigName }));
```

- [ ] **Step 5: Send new SSE events during auto mode too**

In the auto mode path, add agent:start and agent:complete events around the invoke call. But since auto mode uses `pipeline.invoke()` (one shot), inject basic phase events from the phase transitions we detect. For simplicity in auto mode, just send phase:start on batch start and rely on batch:complete for results.

For now auto mode stays as-is with `pipeline.invoke()`. The SSE events `agent:start`/`agent:complete` are only used in interactive mode.

- [ ] **Step 6: Verify compilation**

```powershell
npx tsc --noEmit 2>&1 | Select-String "ai-pipeline"
```
Expected: No errors.

- [ ] **Step 7: Commit**

```bash
git add server/modules/ai-pipeline/index.ts
git commit -m "feat: add interactive pipeline mode with streaming, resume queue, and checkpoint waiting"
```

---

## Task 6: Frontend — API Client + Query Keys + Query Hooks

**Files:**
- Modify: `client/shared/services/api.ts`
- Modify: `client/shared/hooks/queryKeys.ts`
- Modify: `client/shared/hooks/useQueryHooks.ts`

- [ ] **Step 1: Add pipeline and nlCases to API client**

In `client/shared/services/api.ts`, add to the `api` object after `businessFlows`:

```typescript
  pipeline: {
    runs: (projectId: string) => apiFetch<any[]>(`pipeline/runs/${projectId}`),
    start: (projectId: string, config: any) =>
      apiFetch<{ runId: string }>(`pipeline/${projectId}/start`, {
        method: 'POST',
        body: JSON.stringify(config),
      }),
    resume: (runId: string, action: any) =>
      apiFetch<{ success: boolean }>(`pipeline/${runId}/resume`, {
        method: 'POST',
        body: JSON.stringify(action),
      }),
    checkpoint: (runId: string) =>
      apiFetch<any>(`pipeline/${runId}/checkpoint`),
    logs: (runId: string, agentName?: string) =>
      apiFetch<any[]>(`pipeline/${runId}/logs${agentName ? `?agent=${agentName}` : ''}`),
    abort: (runId: string) =>
      apiFetch<{ success: boolean }>(`pipeline/${runId}/abort`, { method: 'POST' }),
  },
  nlCases: {
    ...createCrudService<any>('nl-cases'),
    listByProject: (projectId: string) =>
      apiFetch<any[]>(`nl-cases/by-project/${projectId}`),
  },
```

Import `createCrudService` is already present; `NlTestCase` type is not needed since we use `any` for now (types from shared contracts can be added later).

- [ ] **Step 2: Add query keys**

In `client/shared/hooks/queryKeys.ts`, add after `queue`:

```typescript
  pipeline: {
    runs: (projectId: string) => ['pipeline', 'runs', projectId] as const,
    checkpoint: (runId: string) => ['pipeline', 'checkpoint', runId] as const,
    logs: (runId: string) => ['pipeline', 'logs', runId] as const,
  },
  nlCases: (projectId: string) => ['nl-cases', projectId] as const,
```

- [ ] **Step 3: Add React Query hooks**

In `client/shared/hooks/useQueryHooks.ts`, add at bottom after `useBusinessFlowMutations`:

```typescript
export function usePipelineRuns(projectId: string) {
  return useQuery({
    queryKey: queryKeys.pipeline.runs(projectId),
    queryFn: () => api.pipeline.runs(projectId),
    enabled: !!projectId,
    refetchInterval: (query: any) => {
      const running = query.state.data?.some((r: any) => r.status === 'RUNNING' || r.status === 'WAITING_REVIEW');
      return running ? 3000 : false;
    },
  });
}

export function useCheckpoint(runId: string) {
  return useQuery({
    queryKey: queryKeys.pipeline.checkpoint(runId),
    queryFn: () => api.pipeline.checkpoint(runId),
    enabled: !!runId,
    refetchInterval: 5000,
  });
}

export function useAgentLogs(runId: string, agentName?: string) {
  return useQuery({
    queryKey: queryKeys.pipeline.logs(runId),
    queryFn: () => api.pipeline.logs(runId, agentName),
    enabled: !!runId,
  });
}

export function useNlCases(projectId: string) {
  return useQuery({
    queryKey: queryKeys.nlCases(projectId),
    queryFn: () => api.nlCases.listByProject(projectId),
    enabled: !!projectId,
  });
}
```

- [ ] **Step 4: Verify compilation**

```powershell
npx tsc --noEmit 2>&1 | Select-String "error TS"
```
Expected: No errors related to the modified files.

- [ ] **Step 5: Commit**

```bash
git add client/shared/services/api.ts client/shared/hooks/queryKeys.ts client/shared/hooks/useQueryHooks.ts
git commit -m "feat: add pipeline and nlCases API clients, query keys, and React Query hooks"
```

---

## Task 7: Frontend — usePipelineSSE Hook

**Files:**
- Create: `client/shared/hooks/usePipelineSSE.ts`

- [ ] **Step 1: Create the SSE hook**

Write `client/shared/hooks/usePipelineSSE.ts`:

```typescript
import { useEffect, useRef, useCallback, useState } from 'react';

interface PipelineEvent {
  type: string;
  data: any;
  timestamp: number;
}

interface UsePipelineSSEOptions {
  projectId: string | null;
  config: any | null;
  onEvent?: (event: PipelineEvent) => void;
}

export function usePipelineSSE({ projectId, config, onEvent }: UsePipelineSSEOptions) {
  const eventSourceRef = useRef<EventSource | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  const start = useCallback(() => {
    if (!projectId || !config) return;

    const body = JSON.stringify({
      requirementIds: config.requirementIds,
      flowIds: config.flowIds,
      providerConfigName: config.providerConfigName,
      mode: config.mode,
    });

    // Note: SSE for POST requires a different approach.
    // We'll use fetch with ReadableStream instead of EventSource.
    const controller = new AbortController();

    fetch(`/api/pipeline/${projectId}/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      signal: controller.signal,
    }).then(async (response) => {
      if (!response.ok) {
        const err = await response.json().catch(() => ({ error: 'Failed to start pipeline' }));
        onEventRef.current?.({ type: 'pipeline:error', data: { message: err.error }, timestamp: Date.now() });
        return;
      }

      setIsConnected(true);
      const reader = response.body?.getReader();
      if (!reader) return;

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        let currentEvent = '';
        for (const line of lines) {
          if (line.startsWith('event: ')) {
            currentEvent = line.slice(7).trim();
          } else if (line.startsWith('data: ') && currentEvent) {
            try {
              const data = JSON.parse(line.slice(6));
              onEventRef.current?.({ type: currentEvent, data, timestamp: Date.now() });
            } catch {}
            currentEvent = '';
          }
        }
      }
      setIsConnected(false);
    }).catch((err: any) => {
      if (err.name !== 'AbortError') {
        onEventRef.current?.({ type: 'pipeline:error', data: { message: err.message }, timestamp: Date.now() });
      }
      setIsConnected(false);
    });

    eventSourceRef.current = { close: () => controller.abort() } as any;
  }, [projectId, config]);

  const stop = useCallback(() => {
    eventSourceRef.current?.close();
    eventSourceRef.current = null;
    setIsConnected(false);
  }, []);

  useEffect(() => {
    return () => {
      eventSourceRef.current?.close();
    };
  }, []);

  return { start, stop, isConnected };
}
```

- [ ] **Step 2: Verify compilation**

```powershell
npx tsc --noEmit 2>&1 | Select-String "usePipelineSSE"
```
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add client/shared/hooks/usePipelineSSE.ts
git commit -m "feat: add usePipelineSSE hook for pipeline streaming events"
```

---

## Task 8: Frontend — Pipeline Config Panel (Left Panel)

**Files:**
- Create: `client/features/nl-pipeline/PipelineConfigPanel.tsx`

- [ ] **Step 1: Write the config panel component**

Write `client/features/nl-pipeline/PipelineConfigPanel.tsx`:

```typescript
import React, { useState, useMemo } from 'react';
import { Search, ChevronRight, ChevronDown, Play } from 'lucide-react';
import type { Requirement, BusinessFlow } from '../../../shared/contracts/index';

interface PipelineConfigPanelProps {
  requirements: Requirement[];
  businessFlows: BusinessFlow[];
  onStart: (config: PipelineStartConfig) => void;
  disabled?: boolean;
}

export interface PipelineStartConfig {
  name: string;
  requirementIds: string[];
  flowIds: string[];
  mode: 'auto' | 'interactive';
  providerConfigName: string;
}

interface TreeNode {
  req: Requirement;
  children: TreeNode[];
  depth: number;
}

function buildTree(requirements: Requirement[]): TreeNode[] {
  const map = new Map<string, TreeNode>();
  const roots: TreeNode[] = [];

  for (const req of requirements) {
    map.set(req.id, { req, children: [], depth: 0 });
  }

  for (const req of requirements) {
    const node = map.get(req.id)!;
    if (req.parentId && map.has(req.parentId)) {
      map.get(req.parentId)!.children.push(node);
    } else if (!req.parentId) {
      roots.push(node);
    }
  }

  function setDepth(nodes: TreeNode[], depth: number) {
    for (const node of nodes) {
      node.depth = depth;
      setDepth(node.children, depth + 1);
    }
  }
  setDepth(roots, 0);

  return roots;
}

function collectLeafIds(node: TreeNode): string[] {
  if (node.children.length === 0) return [node.req.id];
  return node.children.flatMap(collectLeafIds);
}

function RequirementTreeNode({
  node,
  selectedIds,
  onToggle,
}: {
  node: TreeNode;
  selectedIds: Set<string>;
  onToggle: (ids: string[]) => void;
}) {
  const [expanded, setExpanded] = useState(node.depth < 2);
  const hasChildren = node.children.length > 0;
  const allDescendantIds = hasChildren ? collectLeafIds(node) : [node.req.id];
  const allSelected = allDescendantIds.every(id => selectedIds.has(id));
  const someSelected = allDescendantIds.some(id => selectedIds.has(id));

  return (
    <div>
      <div
        className="flex items-center gap-1 py-0.5 hover:bg-slate-100 rounded px-1 cursor-pointer"
        style={{ paddingLeft: `${node.depth * 16 + 4}px` }}
      >
        {hasChildren ? (
          <button onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }} className="p-0.5">
            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          </button>
        ) : (
          <span className="w-5" />
        )}
        <input
          type="checkbox"
          checked={allSelected}
          ref={el => { if (el) el.indeterminate = someSelected && !allSelected; }}
          onChange={() => onToggle(allDescendantIds)}
          className="rounded"
        />
        <span className="text-sm truncate">{node.req.title}</span>
        <span className="text-xs text-slate-400 ml-auto shrink-0">{node.req.level}</span>
      </div>
      {expanded && hasChildren && (
        <div>
          {node.children.map(child => (
            <RequirementTreeNode key={child.req.id} node={child} selectedIds={selectedIds} onToggle={onToggle} />
          ))}
        </div>
      )}
    </div>
  );
}

export function PipelineConfigPanel({
  requirements,
  businessFlows,
  onStart,
  disabled,
}: PipelineConfigPanelProps) {
  const [name, setName] = useState('');
  const [reqSearch, setReqSearch] = useState('');
  const [selectedReqs, setSelectedReqs] = useState<Set<string>>(new Set());
  const [selectedFlows, setSelectedFlows] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<'auto' | 'interactive'>('auto');
  const [showApprovedOnly, setShowApprovedOnly] = useState(true);

  const tree = useMemo(() => buildTree(requirements), [requirements]);
  const filteredTree = useMemo(() => {
    if (!reqSearch) return tree;
    function filter(nodes: TreeNode[]): TreeNode[] {
      return nodes.reduce<TreeNode[]>((acc, node) => {
        const matches = node.req.title.toLowerCase().includes(reqSearch.toLowerCase());
        const filteredChildren = filter(node.children);
        if (matches || filteredChildren.length > 0) {
          acc.push({ ...node, children: filteredChildren });
        }
        return acc;
      }, []);
    }
    return filter(tree);
  }, [tree, reqSearch]);

  const flows = showApprovedOnly
    ? businessFlows.filter(f => f.status === 'APPROVED')
    : businessFlows;

  const handleReqToggle = (ids: string[]) => {
    setSelectedReqs(prev => {
      const next = new Set(prev);
      const allSelected = ids.every(id => next.has(id));
      if (allSelected) {
        ids.forEach(id => next.delete(id));
      } else {
        ids.forEach(id => next.add(id));
      }
      return next;
    });
  };

  const handleStart = () => {
    const now = new Date();
    const defaultName = name || `Pipeline_${now.toISOString().slice(0, 10)}_${now.toTimeString().slice(0, 5).replace(':', '-')}`;
    onStart({
      name: defaultName,
      requirementIds: Array.from(selectedReqs),
      flowIds: Array.from(selectedFlows),
      mode,
      providerConfigName: '',
    });
  };

  const canStart = (selectedReqs.size > 0 || selectedFlows.size > 0) && !disabled;

  return (
    <div className="w-80 border-r border-slate-200 flex flex-col h-full bg-white shrink-0">
      <div className="p-4 border-b border-slate-100">
        <h3 className="font-medium text-sm text-slate-800 mb-3">Configuration</h3>

        <label className="block text-xs text-slate-500 mb-1">Pipeline Name</label>
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="e.g. 用户管理模块测试"
          className="w-full border border-slate-200 rounded px-2 py-1.5 text-sm mb-3 focus:outline-none focus:border-blue-400"
        />
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="p-4 border-b border-slate-100">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-xs font-medium text-slate-600 uppercase tracking-wide">Requirements</h4>
            <span className="text-xs text-blue-600">{selectedReqs.size} selected</span>
          </div>
          <div className="relative mb-2">
            <Search size={14} className="absolute left-2 top-2 text-slate-400" />
            <input
              type="text"
              value={reqSearch}
              onChange={e => setReqSearch(e.target.value)}
              placeholder="Filter..."
              className="w-full border border-slate-200 rounded pl-7 pr-2 py-1 text-xs focus:outline-none focus:border-blue-400"
            />
          </div>
          <div className="max-h-64 overflow-y-auto">
            {filteredTree.map(node => (
              <RequirementTreeNode
                key={node.req.id}
                node={node}
                selectedIds={selectedReqs}
                onToggle={handleReqToggle}
              />
            ))}
          </div>
          <div className="flex gap-2 mt-2">
            <button
              onClick={() => {
                const allIds = requirements.map(r => r.id);
                setSelectedReqs(new Set(allIds));
              }}
              className="text-xs text-blue-600 hover:text-blue-800"
            >
              Select All
            </button>
            <button
              onClick={() => setSelectedReqs(new Set())}
              className="text-xs text-slate-500 hover:text-slate-700"
            >
              Clear
            </button>
          </div>
        </div>

        <div className="p-4 border-b border-slate-100">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-xs font-medium text-slate-600 uppercase tracking-wide">Business Flows</h4>
            <span className="text-xs text-blue-600">{selectedFlows.size} selected</span>
          </div>
          <label className="flex items-center gap-1 mb-2 text-xs text-slate-500">
            <input
              type="checkbox"
              checked={showApprovedOnly}
              onChange={e => setShowApprovedOnly(e.target.checked)}
              className="rounded"
            />
            Show approved flows only
          </label>
          <div className="max-h-48 overflow-y-auto">
            {flows.map(flow => (
              <label key={flow.id} className="flex items-center gap-2 py-1 px-1 hover:bg-slate-50 rounded cursor-pointer text-sm">
                <input
                  type="checkbox"
                  checked={selectedFlows.has(flow.id)}
                  onChange={() => {
                    setSelectedFlows(prev => {
                      const next = new Set(prev);
                      if (next.has(flow.id)) next.delete(flow.id);
                      else next.add(flow.id);
                      return next;
                    });
                  }}
                  className="rounded"
                />
                <span className="truncate">{flow.name}</span>
                <span className="text-xs text-slate-400 ml-auto shrink-0">
                  {flow.type} {flow.status === 'APPROVED' ? '\u2713' : ''}
                </span>
              </label>
            ))}
          </div>
        </div>
      </div>

      <div className="p-4 border-t border-slate-200 space-y-3">
        <div>
          <label className="text-xs font-medium text-slate-600 block mb-1">Run Mode</label>
          <div className="flex rounded border border-slate-200 overflow-hidden">
            <button
              onClick={() => setMode('auto')}
              className={`flex-1 py-1.5 text-xs ${mode === 'auto' ? 'bg-blue-50 text-blue-700 font-medium' : 'text-slate-600 hover:bg-slate-50'}`}
            >
              Auto
            </button>
            <button
              onClick={() => setMode('interactive')}
              className={`flex-1 py-1.5 text-xs border-l border-slate-200 ${mode === 'interactive' ? 'bg-blue-50 text-blue-700 font-medium' : 'text-slate-600 hover:bg-slate-50'}`}
            >
              Interactive
            </button>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            {mode === 'auto' ? 'Automatically complete all stages' : 'Pause at each checkpoint for review'}
          </p>
        </div>

        <button
          onClick={handleStart}
          disabled={!canStart}
          className="w-full flex items-center justify-center gap-2 py-2 rounded bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <Play size={16} />
          Start Pipeline
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify compilation**

```powershell
npx tsc --noEmit 2>&1 | Select-String "PipelineConfigPanel"
```

- [ ] **Step 3: Commit**

```bash
git add client/features/nl-pipeline/PipelineConfigPanel.tsx
git commit -m "feat: add PipelineConfigPanel with requirement tree, flow selection, and mode toggle"
```

---

## Task 9: Frontend — Pipeline Flow Canvas (Center Panel)

**Files:**
- Create: `client/features/nl-pipeline/PipelineFlowCanvas.tsx`

- [ ] **Step 1: Write the flow canvas component**

Write `client/features/nl-pipeline/PipelineFlowCanvas.tsx`:

```typescript
import React, { useMemo } from 'react';
import { Activity, Brain, PenTool, Star, CheckCircle2, AlertCircle, Clock, Pause } from 'lucide-react';

interface NodeState {
  id: string;
  label: string;
  type: 'preparation' | 'agent' | 'checkpoint' | 'complete';
  agentName?: string;
  subSteps?: { label: string; done: boolean }[];
  status: 'pending' | 'running' | 'waiting' | 'done' | 'error' | 'auto-passed';
  meta?: { tokenUsage?: number; latencyMs?: number; outputCount?: number; outputLabel?: string };
}

interface PipelineFlowCanvasProps {
  nodes: NodeState[];
  batch: number;
  totalBatches: number;
  generatedCases: number;
  onNodeClick: (nodeId: string) => void;
  selectedNodeId: string | null;
  onAbort?: () => void;
  isRunning: boolean;
}

const statusColors: Record<string, string> = {
  pending: 'border-slate-200 text-slate-400 bg-white',
  running: 'border-blue-400 text-blue-700 bg-blue-50 animate-pulse',
  waiting: 'border-orange-400 text-orange-700 bg-orange-50',
  done: 'border-green-400 text-green-700 bg-green-50',
  error: 'border-red-400 text-red-700 bg-red-50',
  'auto-passed': 'border-slate-300 text-slate-500 bg-slate-50 border-dashed',
};

const statusIcons: Record<string, React.ReactNode> = {
  pending: <Clock size={14} />,
  running: <Activity size={14} className="animate-spin" />,
  waiting: <Pause size={14} className="animate-pulse" />,
  done: <CheckCircle2 size={14} />,
  error: <AlertCircle size={14} />,
  'auto-passed': <CheckCircle2 size={14} />,
};

const agentIcons: Record<string, React.ReactNode> = {
  test_analyst: <Brain size={16} />,
  test_designer: <PenTool size={16} />,
  quality_manager: <Star size={16} />,
};

function NodeCard({ node, isSelected, onClick }: { node: NodeState; isSelected: boolean; onClick: () => void }) {
  return (
    <div className="flex flex-col items-center">
      <div
        onClick={onClick}
        className={`w-64 border-2 rounded-lg p-3 cursor-pointer transition-all ${statusColors[node.status]} ${isSelected ? 'ring-2 ring-blue-400 ring-offset-1' : ''}`}
      >
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-1.5">
            {node.type === 'agent' && node.agentName && agentIcons[node.agentName]}
            <span className="text-sm font-medium">{node.label}</span>
          </div>
          <span className="shrink-0">{statusIcons[node.status]}</span>
        </div>
        {node.type === 'agent' && node.subSteps && (
          <div className="text-xs text-slate-500 space-y-0.5 mt-1">
            {node.subSteps.map((step, i) => (
              <div key={i} className="flex items-center gap-1">
                <span>{step.done ? '\u2713' : '\u25CB'}</span>
                <span>{step.label}</span>
              </div>
            ))}
          </div>
        )}
        {node.type === 'checkpoint' && node.status === 'waiting' && (
          <div className="flex gap-1 mt-2">
            <button className="px-2 py-0.5 bg-green-500 text-white text-xs rounded hover:bg-green-600">Approve</button>
            <button className="px-2 py-0.5 bg-blue-500 text-white text-xs rounded hover:bg-blue-600">Edit</button>
            <button className="px-2 py-0.5 bg-slate-500 text-white text-xs rounded hover:bg-slate-600">Retry</button>
          </div>
        )}
        {node.meta && (
          <div className="text-xs text-slate-400 mt-1">
            {node.meta.outputCount !== undefined && (
              <span>Output: {node.meta.outputCount} {node.meta.outputLabel || ''}</span>
            )}
          </div>
        )}
        {node.status === 'auto-passed' && (
          <span className="text-xs text-slate-400">Auto-passed</span>
        )}
      </div>
      {/* Connector arrow */}
      {node.id !== 'complete' && (
        <div className="h-6 flex items-center justify-center">
          <svg width="12" height="24" viewBox="0 0 12 24">
            <line x1="6" y1="0" x2="6" y2="18" stroke="#cbd5e1" strokeWidth="2" />
            <polygon points="6,24 0,16 12,16" fill="#cbd5e1" />
          </svg>
        </div>
      )}
    </div>
  );
}

export function PipelineFlowCanvas({
  nodes,
  batch,
  totalBatches,
  generatedCases,
  onNodeClick,
  selectedNodeId,
  onAbort,
  isRunning,
}: PipelineFlowCanvasProps) {
  const progressPercent = totalBatches > 0 ? Math.round((batch / totalBatches) * 100) : 0;

  return (
    <div className="flex-1 flex flex-col bg-slate-50 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 border-b border-slate-200 bg-white">
        <div className="flex items-center gap-4">
          <h3 className="text-sm font-medium text-slate-700">Pipeline Flow</h3>
          <div className="flex items-center gap-3 text-xs text-slate-400">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-blue-500" /> Running
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-orange-500" /> Waiting
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-green-500" /> Done
            </span>
          </div>
        </div>
        {isRunning && (
          <button
            onClick={onAbort}
            className="px-3 py-1 text-xs text-red-600 border border-red-200 rounded hover:bg-red-50"
          >
            Abort
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto py-6">
        <div className="flex flex-col items-center gap-0">
          {nodes.map(node => (
            <NodeCard
              key={node.id}
              node={node}
              isSelected={node.id === selectedNodeId}
              onClick={() => onNodeClick(node.id)}
            />
          ))}
        </div>
      </div>

      <div className="border-t border-slate-200 bg-white px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="flex-1">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-slate-500">Progress</span>
              <span className="text-xs text-slate-600 font-medium">Batch {batch}/{totalBatches}</span>
            </div>
            <div className="w-full bg-slate-200 rounded-full h-1.5">
              <div
                className="bg-blue-500 h-1.5 rounded-full transition-all duration-500"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
          {generatedCases > 0 && (
            <span className="text-xs text-slate-500 whitespace-nowrap">{generatedCases} cases</span>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add client/features/nl-pipeline/PipelineFlowCanvas.tsx
git commit -m "feat: add PipelineFlowCanvas with step-node flow visualization"
```

---

## Task 10: Frontend — Pipeline Node Detail Panel (Right Panel)

**Files:**
- Create: `client/features/nl-pipeline/PipelineNodeDetail.tsx`

- [ ] **Step 1: Write the detail panel component**

Write `client/features/nl-pipeline/PipelineNodeDetail.tsx`:

```typescript
import React, { useState } from 'react';
import { X } from 'lucide-react';

interface NodeDetailProps {
  node: {
    id: string;
    label: string;
    type: 'preparation' | 'agent' | 'checkpoint' | 'complete';
    agentName?: string;
    status: string;
    meta?: any;
  } | null;
  agentLog: any | null;
  checkpointData: any | null;
  onClose: () => void;
  onCheckpointAction?: (action: 'approve' | 'edit' | 'retry', data?: any) => void;
}

function AgentDetailTabs({ node, agentLog }: { node: any; agentLog: any }) {
  const [activeTab, setActiveTab] = useState<'input' | 'output' | 'trace' | 'errors'>('output');

  const tabs = ['input', 'output', 'trace', 'errors'] as const;

  return (
    <div className="flex flex-col h-full">
      <div className="flex border-b border-slate-200">
        {tabs.map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-3 py-2 text-xs font-medium capitalize border-b-2 transition-colors ${
              activeTab === tab
                ? 'border-blue-500 text-blue-700'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto p-3 text-sm">
        {activeTab === 'input' && (
          <div className="space-y-3">
            <div>
              <div className="text-xs text-slate-400 mb-1">System Prompt</div>
              <pre className="text-xs bg-slate-50 p-2 rounded max-h-40 overflow-y-auto whitespace-pre-wrap">
                {agentLog?.input_prompt?.systemPrompt || 'No data'}
              </pre>
            </div>
            <div>
              <div className="text-xs text-slate-400 mb-1">User Message</div>
              <pre className="text-xs bg-slate-50 p-2 rounded max-h-40 overflow-y-auto whitespace-pre-wrap">
                {agentLog?.input_prompt?.userMessage || 'No data'}
              </pre>
            </div>
          </div>
        )}

        {activeTab === 'output' && (
          <pre className="text-xs bg-slate-50 p-2 rounded whitespace-pre-wrap max-h-full overflow-y-auto">
            {agentLog?.output_data
              ? JSON.stringify(agentLog.output_data, null, 2)
              : 'No output data yet'}
          </pre>
        )}

        {activeTab === 'trace' && (
          <div className="space-y-1">
            {agentLog?.raw_trace?.map((entry: any, i: number) => (
              <div key={i} className="text-xs font-mono">
                <span className="text-slate-400">[{entry.timestamp}]</span>{' '}
                <span className="text-slate-700">{entry.message}</span>
              </div>
            )) || (
              <div className="text-xs text-slate-400">No trace data</div>
            )}
          </div>
        )}

        {activeTab === 'errors' && (
          <div className="text-xs text-slate-500">No errors</div>
        )}
      </div>
    </div>
  );
}

function CheckpointDetailTabs({
  checkpointData,
  onAction,
}: {
  checkpointData: any;
  onAction: (action: 'approve' | 'edit' | 'retry', data?: any) => void;
}) {
  const [feedback, setFeedback] = useState('');

  const items = checkpointData?.conditions || checkpointData?.cases || [];

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-3">
        <div className="text-xs text-slate-500 mb-2">
          {checkpointData?.conditions ? `${checkpointData.conditions.length} Test Conditions`
            : checkpointData?.cases ? `${checkpointData.cases.length} Cases`
            : 'No items'}
        </div>
        <div className="space-y-2">
          {items.slice(0, 20).map((item: any, i: number) => (
            <div key={i} className="border border-slate-200 rounded p-2 text-sm">
              <div className="font-medium text-slate-700">
                {item.condition || item.title || `Item ${i + 1}`}
              </div>
              {item.category && (
                <span className="text-xs text-slate-400">Category: {item.category}</span>
              )}
              {item.riskLevel && (
                <span className="text-xs text-slate-400 ml-2">Risk: {item.riskLevel}</span>
              )}
              {item.primaryTechnique && (
                <span className="text-xs text-slate-400 ml-2">Tech: {item.primaryTechnique}</span>
              )}
            </div>
          ))}
          {items.length > 20 && (
            <div className="text-xs text-slate-400 text-center py-2">
              + {items.length - 20} more items
            </div>
          )}
        </div>

        <div className="mt-3">
          <label className="text-xs text-slate-500 block mb-1">Feedback (optional)</label>
          <textarea
            value={feedback}
            onChange={e => setFeedback(e.target.value)}
            placeholder="Add review feedback..."
            className="w-full border border-slate-200 rounded p-2 text-xs resize-none h-16 focus:outline-none focus:border-blue-400"
          />
        </div>
      </div>

      <div className="border-t border-slate-200 p-3 flex gap-2">
        <button
          onClick={() => onAction('approve', { feedback })}
          className="flex-1 py-1.5 bg-green-500 text-white text-sm rounded hover:bg-green-600"
        >
          Approve
        </button>
        <button
          onClick={() => onAction('edit', { feedback })}
          className="flex-1 py-1.5 bg-blue-500 text-white text-sm rounded hover:bg-blue-600"
        >
          Edit & Continue
        </button>
        <button
          onClick={() => onAction('retry', { feedback })}
          className="flex-1 py-1.5 bg-slate-500 text-white text-sm rounded hover:bg-slate-600"
        >
          Retry Agent
        </button>
      </div>
    </div>
  );
}

export function PipelineNodeDetail({
  node,
  agentLog,
  checkpointData,
  onClose,
  onCheckpointAction,
}: NodeDetailProps) {
  if (!node) {
    return (
      <div className="w-96 border-l border-slate-200 bg-white shrink-0 flex items-center justify-center text-sm text-slate-400">
        Click a node to see details
      </div>
    );
  }

  return (
    <div className="w-96 border-l border-slate-200 bg-white shrink-0 flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
        <div>
          <h4 className="text-sm font-medium text-slate-800">{node.label}</h4>
          <div className="text-xs text-slate-400 mt-0.5">
            Status: {node.status}
            {node.meta?.latencyMs && ` \u00B7 ${node.meta.latencyMs}ms`}
            {node.meta?.tokenUsage && ` \u00B7 ${node.meta.tokenUsage} tokens`}
          </div>
        </div>
        <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded">
          <X size={16} className="text-slate-400" />
        </button>
      </div>

      {node.type === 'agent' ? (
        <AgentDetailTabs node={node} agentLog={agentLog} />
      ) : node.type === 'checkpoint' && checkpointData && node.status === 'waiting' ? (
        <CheckpointDetailTabs
          checkpointData={checkpointData}
          onAction={(action, data) => onCheckpointAction?.(action, data)}
        />
      ) : node.type === 'checkpoint' ? (
        <div className="p-4 text-sm text-slate-500">
          {node.status === 'auto-passed' ? 'Auto-passed — no review needed for auto mode.' : 'Waiting for review data...'}
        </div>
      ) : (
        <div className="p-4 text-sm text-slate-500">No detailed data available for this node.</div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add client/features/nl-pipeline/PipelineNodeDetail.tsx
git commit -m "feat: add PipelineNodeDetail with agent tabs and checkpoint review panel"
```

---

## Task 11: Frontend — Pipeline Run History

**Files:**
- Create: `client/features/nl-pipeline/PipelineRunHistory.tsx`

- [ ] **Step 1: Write the run history component**

Write `client/features/nl-pipeline/PipelineRunHistory.tsx`:

```typescript
import React, { useState } from 'react';
import { Search, ArrowLeft } from 'lucide-react';

interface PipelineRun {
  id: string;
  status: string;
  phase: string;
  mode: string;
  current_batch: number;
  total_batches: number;
  config: { name?: string } | null;
  created_at: string;
  token_usage?: { total?: number };
}

interface PipelineRunHistoryProps {
  runs: PipelineRun[];
  onSelect: (runId: string) => void;
  onBack: () => void;
}

const statusBadge: Record<string, string> = {
  COMPLETED: 'bg-green-100 text-green-700',
  RUNNING: 'bg-blue-100 text-blue-700',
  WAITING_REVIEW: 'bg-orange-100 text-orange-700',
  FAILED: 'bg-red-100 text-red-700',
  PAUSED: 'bg-yellow-100 text-yellow-700',
};

export function PipelineRunHistory({ runs, onSelect, onBack }: PipelineRunHistoryProps) {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [modeFilter, setModeFilter] = useState('All');

  const filtered = runs.filter(r => {
    if (search && !(r.config?.name || r.id).toLowerCase().includes(search.toLowerCase())) return false;
    if (statusFilter !== 'All' && r.status !== statusFilter) return false;
    if (modeFilter !== 'All' && r.mode !== modeFilter) return false;
    return true;
  });

  return (
    <div className="flex-1 flex flex-col bg-white">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-200">
        <button onClick={onBack} className="p-1 hover:bg-slate-100 rounded">
          <ArrowLeft size={16} className="text-slate-500" />
        </button>
        <h3 className="text-sm font-medium text-slate-700">Run History</h3>
      </div>

      <div className="px-4 py-2 flex gap-2 border-b border-slate-100">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-2 top-2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search runs..."
            className="w-full border border-slate-200 rounded pl-7 pr-2 py-1 text-xs focus:outline-none focus:border-blue-400"
          />
        </div>
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="border border-slate-200 rounded px-2 py-1 text-xs"
        >
          <option value="All">All Status</option>
          <option value="COMPLETED">Completed</option>
          <option value="RUNNING">Running</option>
          <option value="WAITING_REVIEW">Waiting</option>
          <option value="FAILED">Failed</option>
        </select>
        <select
          value={modeFilter}
          onChange={e => setModeFilter(e.target.value)}
          className="border border-slate-200 rounded px-2 py-1 text-xs"
        >
          <option value="All">All Modes</option>
          <option value="auto">Auto</option>
          <option value="interactive">Interactive</option>
        </select>
      </div>

      <div className="flex-1 overflow-y-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left">
              <th className="px-4 py-2 text-xs font-medium text-slate-500">#</th>
              <th className="px-4 py-2 text-xs font-medium text-slate-500">Name</th>
              <th className="px-4 py-2 text-xs font-medium text-slate-500">Status</th>
              <th className="px-4 py-2 text-xs font-medium text-slate-500">Mode</th>
              <th className="px-4 py-2 text-xs font-medium text-slate-500">Date</th>
              <th className="px-4 py-2 text-xs font-medium text-slate-500">Results</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((run, i) => (
              <tr
                key={run.id}
                onClick={() => onSelect(run.id)}
                className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer transition-colors"
              >
                <td className="px-4 py-2 text-xs text-slate-400">{runs.length - i}</td>
                <td className="px-4 py-2 text-xs font-medium text-slate-700">
                  {run.config?.name || run.id.slice(0, 12)}
                </td>
                <td className="px-4 py-2">
                  <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${statusBadge[run.status] || 'bg-slate-100 text-slate-600'}`}>
                    {run.status}
                  </span>
                </td>
                <td className="px-4 py-2 text-xs text-slate-500">{run.mode}</td>
                <td className="px-4 py-2 text-xs text-slate-400">
                  {run.created_at?.slice(0, 16) || '-'}
                </td>
                <td className="px-4 py-2 text-xs text-slate-500">
                  {run.current_batch}/{run.total_batches} batches
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add client/features/nl-pipeline/PipelineRunHistory.tsx
git commit -m "feat: add PipelineRunHistory component with search and filter"
```

---

## Task 12: Frontend — AiPipelinePage (Main Orchestrator)

**Files:**
- Modify: `client/features/nl-pipeline/AiPipelinePage.tsx` (replace stub)

- [ ] **Step 1: Write the full AiPipelinePage**

Write `client/features/nl-pipeline/AiPipelinePage.tsx` (replace the 14-line stub):

```typescript
import React, { useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { History, Plus } from 'lucide-react';
import { useRequirements, useBusinessFlows, usePipelineRuns, useCheckpoint, useAgentLogs } from '../../shared/hooks/useQueryHooks';
import { usePipelineSSE } from '../../shared/hooks/usePipelineSSE';
import { api } from '@/shared/services/api';
import { PipelineConfigPanel, type PipelineStartConfig } from './PipelineConfigPanel';
import { PipelineFlowCanvas } from './PipelineFlowCanvas';
import { PipelineNodeDetail } from './PipelineNodeDetail';
import { PipelineRunHistory } from './PipelineRunHistory';

interface AiPipelinePageProps {
  currentProjectId: string | null;
}

const PIPELINE_NODES = [
  { id: 'preparation', label: 'Preparation', type: 'preparation' as const, status: 'pending' as const },
  { id: 'agent_test_analyst', label: 'Test Analyst', type: 'agent' as const, agentName: 'test_analyst', status: 'pending' as const,
    subSteps: [
      { label: 'Assess risk & priority', done: false },
      { label: 'Extract test conditions', done: false },
      { label: 'Select ISTQB techniques', done: false },
    ] },
  { id: 'checkpoint_1', label: 'Checkpoint 1: Review Conditions', type: 'checkpoint' as const, status: 'pending' as const },
  { id: 'agent_test_designer', label: 'Test Designer', type: 'agent' as const, agentName: 'test_designer', status: 'pending' as const,
    subSteps: [
      { label: 'Design test cases', done: false },
      { label: 'Apply test techniques', done: false },
      { label: 'Self-review quality', done: false },
    ] },
  { id: 'checkpoint_2', label: 'Checkpoint 2: Review Drafts', type: 'checkpoint' as const, status: 'pending' as const },
  { id: 'agent_quality_manager', label: 'Quality Manager', type: 'agent' as const, agentName: 'quality_manager', status: 'pending' as const,
    subSteps: [
      { label: 'Review 6 dimensions', done: false },
      { label: 'Merge human feedback', done: false },
      { label: 'Generate coverage matrix', done: false },
    ] },
  { id: 'checkpoint_3', label: 'Checkpoint 3: Final Review', type: 'checkpoint' as const, status: 'pending' as const },
  { id: 'complete', label: 'Complete', type: 'complete' as const, status: 'pending' as const },
];

export function AiPipelinePage({ currentProjectId }: AiPipelinePageProps) {
  const queryClient = useQueryClient();
  const [view, setView] = useState<'config' | 'history'>('config');
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [nodeStates, setNodeStates] = useState(PIPELINE_NODES.map(n => ({ ...n })));
  const [batch, setBatch] = useState(0);
  const [totalBatches, setTotalBatches] = useState(0);
  const [generatedCases, setGeneratedCases] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [checkpointData, setCheckpointData] = useState<any>(null);
  const [sseConfig, setSseConfig] = useState<any>(null);

  const { data: requirements = [] } = useRequirements(currentProjectId || '');
  const { data: businessFlows = [] } = useBusinessFlows(currentProjectId || '');
  const { data: runs = [], refetch: refetchRuns } = usePipelineRuns(currentProjectId || '');
  const { data: checkpoint } = useCheckpoint(activeRunId || '');
  const { data: agentLogs = [] } = useAgentLogs(activeRunId || '', selectedNodeId?.replace('agent_', '') || undefined);

  const { start: startSSE, stop: stopSSE } = usePipelineSSE({
    projectId: currentProjectId,
    config: sseConfig,
    onEvent: useCallback((event) => {
      setNodeStates(prev => prev.map(node => {
        switch (event.type) {
          case 'phase:start':
            return { ...node };
          case 'agent:start':
            if (node.id === `agent_${event.data.agentName}`) return { ...node, status: 'running' };
            return node;
          case 'agent:complete':
            if (node.id === `agent_${event.data.agentName}`) return { ...node, status: 'done', meta: { outputCount: 0, outputLabel: event.data.outputSummary } };
            return node;
          case 'checkpoint:waiting':
            if (node.id === `checkpoint_${event.data.checkpointNumber}`) return { ...node, status: 'waiting' };
            setCheckpointData(event.data.payload);
            return node;
          case 'checkpoint:resolved':
            if (node.id === `checkpoint_${event.data.checkpointNumber}`) return { ...node, status: 'done' };
            setCheckpointData(null);
            return node;
          case 'batch:start':
            setBatch(event.data.batch);
            setTotalBatches(event.data.total);
            return node;
          case 'batch:complete':
            setGeneratedCases(prev => prev + (event.data.testCases || 0));
            return node;
          case 'pipeline:complete':
            setIsRunning(false);
            setNodeStates(prev => prev.map(n => ({ ...n, status: n.status === 'pending' ? 'done' : n.status })));
            setGeneratedCases(event.data.stats?.totalCases || 0);
            refetchRuns();
            return node;
          case 'pipeline:error':
            return { ...node };
          default:
            return node;
        }
      }));
    }, [refetchRuns]),
  });

  const handleStart = useCallback(async (config: PipelineStartConfig) => {
    setNodeStates(PIPELINE_NODES.map(n => ({
      ...n,
      status: 'pending',
      subSteps: n.subSteps?.map(s => ({ ...s, done: false })),
    })));
    setBatch(0);
    setTotalBatches(0);
    setGeneratedCases(0);
    setIsRunning(true);
    setSelectedNodeId(null);
    setCheckpointData(null);

    try {
      const { runId } = await api.pipeline.start(currentProjectId!, config);
      setActiveRunId(runId);
      setSseConfig(config);
      // SSE will be started by the hook when sseConfig changes
      // But since the hook renders before this, we need to re-call
      startSSE();
    } catch (err: any) {
      setIsRunning(false);
      alert('Failed to start pipeline: ' + err.message);
    }
  }, [currentProjectId, startSSE]);

  const handleNodeClick = useCallback((nodeId: string) => {
    setSelectedNodeId(prev => prev === nodeId ? null : nodeId);
  }, []);

  const handleCheckpointAction = useCallback(async (action: 'approve' | 'edit' | 'retry', data?: any) => {
    if (!activeRunId) return;
    try {
      await api.pipeline.resume(activeRunId, { action, feedback: data?.feedback });
      setCheckpointData(null);
    } catch (err: any) {
      alert('Failed: ' + err.message);
    }
  }, [activeRunId]);

  const handleAbort = useCallback(async () => {
    if (!activeRunId) return;
    try {
      await api.pipeline.abort(activeRunId);
      stopSSE();
      setIsRunning(false);
      refetchRuns();
    } catch (err: any) {
      alert('Failed to abort: ' + err.message);
    }
  }, [activeRunId, stopSSE, refetchRuns]);

  const handleSelectHistoryRun = useCallback((_runId: string) => {
    setView('config');
  }, []);

  const selectedNode = selectedNodeId
    ? nodeStates.find(n => n.id === selectedNodeId)
    : null;

  const agentLog = selectedNode?.agentName && agentLogs.length > 0
    ? agentLogs.find((l: any) => l.agent_name === selectedNode.agentName)
    : null;

  if (!currentProjectId) {
    return <div className="h-full flex items-center justify-center text-slate-400">Select a project to continue</div>;
  }

  return (
    <div className="h-full flex flex-col bg-slate-50 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 bg-white shrink-0">
        <h2 className="text-base font-semibold text-slate-800">AI Pipeline</h2>
        <div className="flex gap-2">
          <button
            onClick={() => setView(view === 'history' ? 'config' : 'history')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded border transition-colors ${
              view === 'history'
                ? 'bg-blue-50 border-blue-200 text-blue-700'
                : 'border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            {view === 'history' ? <Plus size={14} /> : <History size={14} />}
            {view === 'history' ? 'New Run' : 'History'}
          </button>
        </div>
      </div>

      {view === 'history' ? (
        <PipelineRunHistory
          runs={runs}
          onSelect={handleSelectHistoryRun}
          onBack={() => setView('config')}
        />
      ) : (
        <div className="flex-1 flex overflow-hidden">
          <PipelineConfigPanel
            requirements={requirements}
            businessFlows={businessFlows}
            onStart={handleStart}
            disabled={isRunning}
          />
          <PipelineFlowCanvas
            nodes={nodeStates}
            batch={batch}
            totalBatches={totalBatches}
            generatedCases={generatedCases}
            onNodeClick={handleNodeClick}
            selectedNodeId={selectedNodeId}
            onAbort={handleAbort}
            isRunning={isRunning}
          />
          <PipelineNodeDetail
            node={selectedNode}
            agentLog={agentLog}
            checkpointData={checkpointData}
            onClose={() => setSelectedNodeId(null)}
            onCheckpointAction={handleCheckpointAction}
          />
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify compilation**

```powershell
npx tsc --noEmit 2>&1 | Select-String "AiPipelinePage"
```
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add client/features/nl-pipeline/AiPipelinePage.tsx
git commit -m "feat: implement full AiPipelinePage with config, flow canvas, detail panel, and history"
```

---

## Task 13: Frontend — NlCasesPage (Full Implementation)

**Files:**
- Modify: `client/features/nl-cases/NlCasesPage.tsx` (replace stub)

- [ ] **Step 1: Write the full NlCasesPage**

Write `client/features/nl-cases/NlCasesPage.tsx` (replace the 14-line stub):

```typescript
import React, { useState, useMemo } from 'react';
import { Search, ChevronDown, ChevronRight } from 'lucide-react';
import { useNlCases } from '../../shared/hooks/useQueryHooks';

interface NlCasesPageProps {
  currentProjectId: string | null;
}

const statusColors: Record<string, string> = {
  FINAL: 'bg-green-100 text-green-700',
  APPROVED: 'bg-blue-100 text-blue-700',
  DRAFT: 'bg-yellow-100 text-yellow-700',
};

const priorityColors: Record<string, string> = {
  critical: 'text-red-600',
  high: 'text-orange-600',
  medium: 'text-yellow-600',
  low: 'text-slate-500',
};

export function NlCasesPage({ currentProjectId }: NlCasesPageProps) {
  const { data: cases = [], isLoading } = useNlCases(currentProjectId || '');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [priorityFilter, setPriorityFilter] = useState('All');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const pageSize = 20;

  const filtered = useMemo(() => {
    return cases.filter((c: any) => {
      if (search && !c.title?.toLowerCase().includes(search.toLowerCase())) return false;
      if (statusFilter !== 'All' && c.status !== statusFilter) return false;
      if (priorityFilter !== 'All' && c.priority !== priorityFilter) return false;
      if (categoryFilter !== 'All' && c.category !== categoryFilter) return false;
      return true;
    });
  }, [cases, search, statusFilter, priorityFilter, categoryFilter]);

  const paged = filtered.slice(page * pageSize, (page + 1) * pageSize);
  const totalPages = Math.ceil(filtered.length / pageSize);
  const selected = selectedId ? cases.find((c: any) => c.id === selectedId) : null;

  if (!currentProjectId) {
    return <div className="h-full flex items-center justify-center text-slate-400">Select a project to continue</div>;
  }

  if (isLoading) {
    return <div className="h-full flex items-center justify-center text-slate-400">Loading...</div>;
  }

  return (
    <div className="h-full flex flex-col bg-white overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 shrink-0">
        <h2 className="text-base font-semibold text-slate-800">NL Test Cases</h2>
        <span className="text-sm text-slate-400">{filtered.length} cases</span>
      </div>

      <div className="px-4 py-2 flex gap-2 border-b border-slate-100 shrink-0">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-2 top-2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(0); }}
            placeholder="Search test cases..."
            className="w-full border border-slate-200 rounded pl-7 pr-2 py-1 text-xs focus:outline-none focus:border-blue-400"
          />
        </div>
        <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(0); }} className="border border-slate-200 rounded px-2 py-1 text-xs">
          <option value="All">All Status</option>
          <option value="FINAL">Final</option>
          <option value="APPROVED">Approved</option>
          <option value="DRAFT">Draft</option>
        </select>
        <select value={priorityFilter} onChange={e => { setPriorityFilter(e.target.value); setPage(0); }} className="border border-slate-200 rounded px-2 py-1 text-xs">
          <option value="All">All Priority</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <select value={categoryFilter} onChange={e => { setCategoryFilter(e.target.value); setPage(0); }} className="border border-slate-200 rounded px-2 py-1 text-xs">
          <option value="All">All Categories</option>
          <option value="happy-path">Happy Path</option>
          <option value="alternate">Alternate</option>
          <option value="error">Error</option>
          <option value="boundary">Boundary</option>
        </select>
      </div>

      <div className="flex-1 overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-slate-50">
            <tr className="border-b border-slate-200 text-left">
              <th className="px-4 py-2 text-xs font-medium text-slate-500 w-8">#</th>
              <th className="px-4 py-2 text-xs font-medium text-slate-500">Title</th>
              <th className="px-4 py-2 text-xs font-medium text-slate-500 w-20">Priority</th>
              <th className="px-4 py-2 text-xs font-medium text-slate-500 w-24">Category</th>
              <th className="px-4 py-2 text-xs font-medium text-slate-500 w-20">Status</th>
            </tr>
          </thead>
          <tbody>
            {paged.map((c: any, i: number) => (
              <React.Fragment key={c.id}>
                <tr
                  onClick={() => setSelectedId(selectedId === c.id ? null : c.id)}
                  className={`border-b border-slate-100 hover:bg-slate-50 cursor-pointer transition-colors ${selectedId === c.id ? 'bg-blue-50' : ''}`}
                >
                  <td className="px-4 py-2 text-xs text-slate-400">{page * pageSize + i + 1}</td>
                  <td className="px-4 py-2 text-xs text-slate-700">{c.title}</td>
                  <td className={`px-4 py-2 text-xs font-medium ${priorityColors[c.priority] || 'text-slate-500'}`}>{c.priority}</td>
                  <td className="px-4 py-2 text-xs text-slate-500">{c.category || '-'}</td>
                  <td className="px-4 py-2">
                    <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${statusColors[c.status] || 'bg-slate-100 text-slate-600'}`}>
                      {c.status}
                    </span>
                  </td>
                </tr>
                {selectedId === c.id && (
                  <tr>
                    <td colSpan={5} className="px-4 py-3 bg-slate-50 border-b border-slate-200">
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <div className="text-xs text-slate-400 mb-1">Preconditions</div>
                          <ul className="list-disc list-inside text-xs text-slate-600">
                            {(c.preconditions || []).map((p: string, i: number) => (
                              <li key={i}>{p}</li>
                            ))}
                          </ul>
                        </div>
                        <div>
                          <div className="text-xs text-slate-400 mb-1">Test Data</div>
                          <ul className="text-xs text-slate-600">
                            {(c.testData || []).map((d: any, i: number) => (
                              <li key={i}><span className="font-medium">{d.key}:</span> {d.value}</li>
                            ))}
                          </ul>
                        </div>
                        <div className="col-span-2">
                          <div className="text-xs text-slate-400 mb-1">Steps</div>
                          <div className="space-y-1">
                            {(c.steps || []).map((s: any, i: number) => (
                              <div key={i} className="text-xs">
                                <div className="text-slate-700"><span className="font-medium">Step {s.sequence}:</span> {s.action}</div>
                                <div className="text-slate-500 ml-4">Expected: {s.expected}</div>
                              </div>
                            ))}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-slate-400 mb-1">Postconditions</div>
                          <ul className="list-disc list-inside text-xs text-slate-600">
                            {(c.postconditions || []).map((p: string, i: number) => (
                              <li key={i}>{p}</li>
                            ))}
                          </ul>
                        </div>
                        <div>
                          <div className="text-xs text-slate-400 mb-1">Details</div>
                          <div className="text-xs text-slate-600 space-y-0.5">
                            <div>Requirement: {c.requirementId || '-'}</div>
                            <div>Condition: {c.conditionId || '-'}</div>
                            <div>Technique: {c.techniqueApplied || '-'}</div>
                            <div>Tags: {(c.tags || []).join(', ') || '-'}</div>
                            {c.reviewSummary && <div>Review: {c.reviewSummary}</div>}
                          </div>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-2 border-t border-slate-200 shrink-0">
          <span className="text-xs text-slate-400">
            {page * pageSize + 1}-{Math.min((page + 1) * pageSize, filtered.length)} of {filtered.length}
          </span>
          <div className="flex gap-1">
            <button
              onClick={() => setPage(p => Math.max(0, p - 1))}
              disabled={page === 0}
              className="px-2 py-1 text-xs border border-slate-200 rounded disabled:opacity-30 hover:bg-slate-50"
            >
              <ChevronRight size={14} className="rotate-180" />
            </button>
            <button
              onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
              disabled={page >= totalPages - 1}
              className="px-2 py-1 text-xs border border-slate-200 rounded disabled:opacity-30 hover:bg-slate-50"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify compilation**

```powershell
npx tsc --noEmit 2>&1 | Select-String "NlCasesPage"
```

- [ ] **Step 3: Commit**

```bash
git add client/features/nl-cases/NlCasesPage.tsx
git commit -m "feat: implement full NlCasesPage with filterable table and inline detail panel"
```

---

## Task 14: Full TypeScript Compilation Check + Integration Fixes

**Files:**
- All modified files

- [ ] **Step 1: Run full typecheck**

```powershell
npx tsc --noEmit 2>&1
```

- [ ] **Step 2: Fix any type errors found**

Review errors and fix as needed.

- [ ] **Step 3: Start dev server and verify pages load**

```powershell
npx tsx server/index.ts
```
Open browser, navigate to AI Pipeline tab and NL Test Cases tab, verify pages render in config/new mode.

- [ ] **Step 4: Commit any fixes**

```bash
git add -A
git commit -m "fix: resolve type errors and integration issues"
```

---

## Task 15: Basic Smoke Test — Pipeline Auto Mode

- [ ] **Step 1: Start server**

```powershell
npx tsx server/index.ts
```

- [ ] **Step 2: Configure and run a pipeline**

1. Open browser to AI Pipeline page
2. Select a project that has requirements
3. Select one Epic and an approved Business Flow
4. Set mode to Auto
5. Click Start Pipeline
6. Verify: Flow canvas shows nodes progressing, SSE events received, detail panel works on click

- [ ] **Step 3: Verify generated cases appear in NL Test Cases page**

Navigate to NL Test Cases tab, verify newly generated cases appear in the table.

- [ ] **Step 4: Verify run history**

Click History button, verify the completed run appears in the history list.

- [ ] **Step 5: Commit if changes needed**

```bash
git add -A
git commit -m "chore: smoke test fixes"
```