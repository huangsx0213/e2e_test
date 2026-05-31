import { describe, expect, it, vi, beforeEach } from 'vitest';

const mockDb = vi.hoisted(() => {
  const statement = { run: vi.fn() };
  return {
    prepare: vi.fn(() => statement),
    statement,
  };
});

vi.mock('../../../shared/db/client.ts', () => ({ db: mockDb }));
vi.mock('../../../shared/utils/index.ts', () => ({
  randomId: vi.fn(() => 'audit_mock'),
}));

import { TestGenPersister } from '../test-gen-persister.ts';
import type { AgentRunSnapshot } from '../test-gen-run-state.ts';

describe('TestGenPersister', () => {
  let persister: TestGenPersister;
  let snapshot: AgentRunSnapshot;

  beforeEach(() => {
    vi.clearAllMocks();
    persister = new TestGenPersister();
    snapshot = {
      logId: 'log-1', agentName: 'analyst', batch: 1,
      inputPrompt: null, outputData: { conditions: [] },
      tokenUsage: { input: 10, output: 5, reasoning: 1 },
      latencyMs: 100, rawTrace: [], status: 'COMPLETED',
    };
  });

  it('saveAgentLog prepares INSERT with ON CONFLICT', () => {
    persister.saveAgentLog(snapshot, 'run-1');
    expect(mockDb.prepare).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO test_gen_agent_logs'));
    expect(mockDb.statement.run).toHaveBeenCalledWith(
      'log-1', 'run-1', 1, 'analyst',
      null,
      JSON.stringify({ conditions: [] }),
      JSON.stringify({ input: 10, output: 5, reasoning: 1 }),
      100, null, 'COMPLETED',
      null, null, null,
    );
  });

  it('saveAgentLog serializes rawTrace when non-empty', () => {
    snapshot.rawTrace = [{ timestamp: 1, step: 0, name: 'start' }];
    persister.saveAgentLog(snapshot, 'run-1');
    const args = mockDb.statement.run.mock.calls[0];
    expect(args[8]).toBe(JSON.stringify(snapshot.rawTrace));
  });

  it('updateRunStatus with usage includes token_usage', () => {
    persister.updateRunStatus('run-1', 'COMPLETED', 'complete', { prompt_tokens: 10 });
    expect(mockDb.prepare).toHaveBeenCalledWith(expect.stringContaining('token_usage'));
    expect(mockDb.statement.run).toHaveBeenCalledWith(
      'COMPLETED', 'complete', JSON.stringify({ prompt_tokens: 10 }), 'run-1',
    );
  });

  it('updateRunStatus without usage omits token_usage', () => {
    persister.updateRunStatus('run-1', 'FAILED', 'orchestrator');
    expect(mockDb.prepare).toHaveBeenCalledWith(expect.not.stringContaining('token_usage'));
    expect(mockDb.statement.run).toHaveBeenCalledWith('FAILED', 'orchestrator', 'run-1');
  });

  it('insertAuditLog inserts audit record', () => {
    persister.insertAuditLog('run-1', 'chk-1', 'approve', 'user-1', { note: 'ok' });
    expect(mockDb.prepare).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO test_gen_audit_log'));
    expect(mockDb.statement.run).toHaveBeenCalledWith(
      'audit_mock', 'run-1', 'chk-1', 'approve', 'user-1',
      JSON.stringify({ note: 'ok' }),
    );
  });
});
