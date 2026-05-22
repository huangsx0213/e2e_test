import crypto from 'node:crypto';
import { Router } from 'express';
import { randomId } from '../../shared/utils/index.ts';
import { withErrorHandling } from '../../shared/http/async-handler.ts';
import { db } from '../../shared/db/client.ts';
import { createNlPipeline } from '../../../shared/ai/pipeline.ts';
import { createAIProvider } from '../../../shared/ai/provider.ts';
import {
  TestAnalystRole,
  TestDesignerRole,
  QualityManagerRole,
} from '../../../shared/ai/roles/index.ts';
import { requirementRepo } from '../requirements/repository.ts';
import { buildRequirementIndex } from '../requirements/index-generator.ts';
import { nlCaseRepo } from '../nl-cases/repository.ts';
import { buildBusinessFlowBlueprints } from './business-flow-blueprint.ts';
import { businessFlowRepo } from '../business-flows/repository.ts';

const router = Router();

const MAX_CONCURRENT = 3;
let activeRuns = 0;
const runQueue: Array<{ resolve: () => void; reject: (err: Error) => void }> = [];

function acquireSlot(): Promise<void> {
  if (activeRuns < MAX_CONCURRENT) {
    activeRuns++;
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    runQueue.push({ resolve, reject });
  });
}

function releaseSlot(): void {
  activeRuns--;
  const next = runQueue.shift();
  if (next) {
    activeRuns++;
    next.resolve();
  }
}

function decryptApiKey(encrypted: string): string {
  if (!encrypted) return '';
  if (encrypted.startsWith('sk-') || encrypted.startsWith('nv-')) return encrypted;
  try {
    const algorithm = 'aes-256-gcm';
    const key = crypto.scryptSync(process.env.ENCRYPTION_KEY || 'dev-key-change-in-production-32b', 'salt', 32);
    const parts = encrypted.split(':');
    if (parts.length !== 3) return encrypted;
    const iv = Buffer.from(parts[0], 'hex');
    const tag = Buffer.from(parts[1], 'hex');
    const enc = Buffer.from(parts[2], 'hex');
    const decipher = crypto.createDecipheriv(algorithm, key, iv);
    decipher.setAuthTag(tag);
    return (decipher.update(enc) as Buffer).toString('utf-8') + decipher.final('utf-8');
  } catch {
    throw new Error('Failed to decrypt API key. Check ENCRYPTION_KEY environment variable.');
  }
}

router.post('/:projectId/start', (req, res) => {
  const { requirementIds, providerConfigName, mode } = req.body;
  const { projectId } = req.params;
  const runId = randomId('run');

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  function sendEvent(event: string, data: unknown) {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  }

  const heartbeat = setInterval(() => {
    sendEvent('heartbeat', { ts: Date.now() });
  }, 15_000);

  let aborted = false;
  req.on('close', () => {
    aborted = true;
    clearInterval(heartbeat);
    releaseSlot();
    db.prepare("UPDATE pipeline_runs SET status = 'PAUSED', updated_at = datetime('now') WHERE id = ?").run(runId);
  });

  db.prepare(`
    INSERT INTO pipeline_runs (id, project_id, status, phase, current_batch, total_batches, mode, created_by)
    VALUES (?, ?, 'RUNNING', 'init', 0, 0, ?, ?)
  `).run(runId, projectId, mode || 'draft', 'anonymous');

  (async () => {
    try {
      await acquireSlot();
      if (aborted) return;

      // Build index and group by epic
      const index = buildRequirementIndex(projectId);
      const epics = index.filter(i => i.level === 0);
      const totalBatches = epics.length;

      db.prepare('UPDATE pipeline_runs SET total_batches = ?, current_batch = 1 WHERE id = ?').run(totalBatches, runId);

      // Load provider config
      let providerConfigRow: any;
      if (providerConfigName) {
        providerConfigRow = db.prepare('SELECT * FROM provider_configs WHERE name = ? LIMIT 1').get(providerConfigName);
      } else {
        providerConfigRow = db.prepare('SELECT * FROM provider_configs WHERE is_active = 1 LIMIT 1').get();
      }
      if (!providerConfigRow) {
        throw new Error('No active AI provider configuration found. Go to Settings → AI Provider to configure one.');
      }

      const provider = createAIProvider({
        type: providerConfigRow.type,
        endpoint: providerConfigRow.endpoint,
        apiKey: decryptApiKey(providerConfigRow.encrypted_api_key),
        deployment: providerConfigRow.deployment,
        apiVersion: providerConfigRow.api_version,
        model: providerConfigRow.model,
      });

      const pipeline = await createNlPipeline(provider, {
        testAnalyst: TestAnalystRole,
        testDesigner: TestDesignerRole,
        qualityManager: QualityManagerRole,
      });

      // Load project context
      const requirements = requirementRepo.listByProject(projectId);
      const businessFlows = buildBusinessFlowBlueprints({
        flows: businessFlowRepo.listByProject(projectId),
        requirements,
      });

      sendEvent('phase:start', { phase: 'preparation', message: `Building index for ${totalBatches} epics` });
      sendEvent('pipeline:context', { flows: businessFlows.length, indexEntries: index.length });

      const allResults: any[] = [];

      for (let i = 0; i < totalBatches; i++) {
        if (aborted) break;
        const epic = epics[i];
        sendEvent('batch:start', { batch: i + 1, total: totalBatches, epic: epic.title });

        const batchRequirementIds = new Set([epic.id, ...epic.children]);
        const batchRequirements = requirements.filter(r => batchRequirementIds.has(r.id));

        db.prepare('UPDATE pipeline_runs SET current_batch = ? WHERE id = ?').run(i + 1, runId);

        const config = { configurable: { thread_id: `${runId}-batch-${i}` } };

        try {
          const result = await pipeline.invoke(
            {
              projectId,
              requirementIds,
              currentBatch: batchRequirements,
              batchContext: { currentBatch: i, totalBatches, processedCount: i },
              projectContext: { name: epic.title, pages: [], endpoints: [] },
              phase: 'analysis',
              errors: [],
            },
            config
          );

          if (result.finalTestCases?.length) {
            allResults.push(result);
          }
          sendEvent('batch:complete', { batch: i + 1, total: totalBatches, testCases: result.finalTestCases?.length || 0 });
        } catch (err: any) {
          sendEvent('pipeline:error', {
            phase: 'batch',
            batch: i + 1,
            message: err.message,
            recoverable: true,
          });
          // Continue to next batch on error
        }
      }

      if (!aborted) {
        // Merge and save results
        const allCases = allResults.flatMap(r => r.finalTestCases || []);
        for (const tc of allCases) {
          nlCaseRepo.save({ ...tc, projectId });
        }

        db.prepare(`
          UPDATE pipeline_runs SET status = 'COMPLETED', phase = 'complete', updated_at = datetime('now')
          WHERE id = ?
        `).run(runId);

        sendEvent('pipeline:complete', {
          summary: `Generated ${allCases.length} test cases across ${totalBatches} batches`,
          stats: { totalCases: allCases.length, totalBatches },
        });
      }
    } catch (err: any) {
      db.prepare("UPDATE pipeline_runs SET status = 'FAILED', updated_at = datetime('now') WHERE id = ?").run(runId);
      sendEvent('pipeline:error', {
        phase: 'orchestrator',
        message: err.message,
        recoverable: false,
      });
    } finally {
      releaseSlot();
      clearInterval(heartbeat);
      res.end();
    }
  })();
});

router.post('/:runId/continue', withErrorHandling((req, res) => {
  const { action } = req.body;
  const { runId } = req.params;
  const row = db.prepare('SELECT status, phase FROM pipeline_runs WHERE id = ?').get(runId) as any;
  if (!row) { res.status(404).json({ error: 'Pipeline run not found' }); return; }

  let newPhase: string;
  if (action === 'retry') {
    newPhase = 'analysis';
  } else if (action === 'approve') {
    if (row.phase === 'review-conditions') newPhase = 'design';
    else if (row.phase === 'review-draft') newPhase = 'quality';
    else newPhase = 'complete';
  } else if (action === 'edit') {
    newPhase = row.phase === 'review-conditions' ? 'design' : (row.phase === 'review-draft' ? 'quality' : 'complete');
  } else {
    res.status(400).json({ error: 'Unknown action' }); return;
  }

  db.prepare("UPDATE pipeline_runs SET phase = ?, updated_at = datetime('now') WHERE id = ?").run(newPhase, runId);
  res.json({ success: true, action, phase: newPhase });
}));

router.get('/:runId/status', withErrorHandling((req, res) => {
  const row = db.prepare('SELECT status, phase, current_batch, total_batches, token_usage, created_by FROM pipeline_runs WHERE id = ?').get(req.params.runId) as any;
  if (!row) { res.status(404).json({ error: 'Pipeline run not found' }); return; }
  res.json(row);
}));

router.get('/:runId/state', withErrorHandling((req, res) => {
  const row = db.prepare('SELECT * FROM pipeline_runs WHERE id = ?').get(req.params.runId) as any;
  if (!row) { res.status(404).json({ error: 'Pipeline run not found' }); return; }
  res.json(row);
}));

router.post('/:runId/abort', withErrorHandling((req, res) => {
  db.prepare("UPDATE pipeline_runs SET status = 'FAILED', updated_at = datetime('now') WHERE id = ?").run(req.params.runId);
  res.json({ success: true });
}));

export const aiPipelineModule = { basePath: '/api/pipeline', router };