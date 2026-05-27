import { describe, expect, it, vi, beforeEach } from 'vitest';
import { TestGenExecutionScope } from '../test-gen-scope.ts';

describe('TestGenExecutionScope', () => {
  let emitEvent: ReturnType<typeof vi.fn>;
  let scope: TestGenExecutionScope;
  let mockPersister: { saveAgentLog: ReturnType<typeof vi.fn>; updateRunStatus: ReturnType<typeof vi.fn>; insertAuditLog: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    emitEvent = vi.fn();
    mockPersister = {
      saveAgentLog: vi.fn(),
      updateRunStatus: vi.fn(),
      insertAuditLog: vi.fn(),
    };
    scope = new TestGenExecutionScope('run-1', 'proj-1', 'auto', emitEvent, mockPersister);
  });

  it('constructor sets properties', () => {
    expect(scope.runId).toBe('run-1');
    expect(scope.projectId).toBe('proj-1');
    expect(scope.mode).toBe('auto');
  });

  it('currentBatch starts at 0', () => {
    expect(scope.currentBatch).toBe(0);
  });

  it('setBatch updates batch and emits event', () => {
    scope.setBatch(3, 10);
    expect(scope.currentBatch).toBe(3);
    expect(emitEvent).toHaveBeenCalledWith('batch:start', { batch: 3, total: 10, timestamp: expect.any(Number) });
  });

  it('recordAgentStart persists and emits', () => {
    scope.recordAgentStart('analyst', 1, [{ role: 'user', content: 'hi' }]);
    expect(mockPersister.saveAgentLog).toHaveBeenCalledOnce();
    expect(emitEvent).toHaveBeenCalledWith('agent:start', { agentName: 'analyst', batch: 1, timestamp: expect.any(Number) });
  });

  it('recordAgentComplete persists and emits with output info', () => {
    const outputData = { testConditions: [{ id: 'c1' }, { id: 'c2' }] };
    scope.recordAgentComplete('test_analyst', 1, {
      tokenUsage: { input: 10, output: 5, reasoning: 1 },
      latencyMs: 200,
      outputData,
    });
    expect(mockPersister.saveAgentLog).toHaveBeenCalledOnce();
    expect(emitEvent).toHaveBeenCalledWith('agent:complete', {
      agentName: 'test_analyst', batch: 1, outputCount: 2,
      outputSummary: '2 conditions',
      outputLabel: 'conditions',
      tokenUsage: 16,
      latencyMs: 200, timestamp: expect.any(Number),
    });
  });

  it('recordAgentStep emits step event', () => {
    scope.recordAgentStep('analyst', 1, 0, 'parse');
    expect(emitEvent).toHaveBeenCalledWith('agent:step', {
      agentName: 'analyst', stepIndex: 0, stepName: 'parse', timestamp: expect.any(Number),
    });
  });

  it('recordAgentThinking emits thinking event', () => {
    scope.recordAgentThinking('analyst', 'hmm...');
    expect(emitEvent).toHaveBeenCalledWith('agent:thinking', {
      agentName: 'analyst', text: 'hmm...', timestamp: expect.any(Number),
    });
  });

  it('recordCheckpointResolved inserts audit log and emits', () => {
    scope.recordCheckpointResolved(2, 'approved');
    expect(mockPersister.insertAuditLog).toHaveBeenCalledWith(
      'run-1', 'checkpoint_2', 'approved', 'system', null,
    );
    expect(emitEvent).toHaveBeenCalledWith('checkpoint:resolved', {
      checkpointNumber: 2, action: 'approved', timestamp: expect.any(Number),
    });
  });

  it('markComplete updates status and emits', () => {
    scope.recordAgentStart('analyst', 1);
    scope.recordAgentComplete('analyst', 1, {
      tokenUsage: { input: 10, output: 5, reasoning: 1 },
      latencyMs: 100,
    });

    scope.markComplete({ totalCases: 5, totalBatches: 1 });
    expect(mockPersister.updateRunStatus).toHaveBeenCalledWith('run-1', 'COMPLETED', 'complete', {
      prompt_tokens: 10, completion_tokens: 5, reasoning_tokens: 1, total_tokens: 16,
    });
    expect(emitEvent).toHaveBeenCalledWith('pipeline:complete', {
      summary: 'Generated 5 test cases across 1 batches',
      stats: { totalCases: 5, totalBatches: 1, totalTokens: 16, totalLatencyMs: 100 },
    });
  });

  it('markFailed updates status and emits error', () => {
    scope.markFailed('Something broke');
    expect(mockPersister.updateRunStatus).toHaveBeenCalledWith('run-1', 'FAILED', 'orchestrator');
    expect(emitEvent).toHaveBeenCalledWith('pipeline:error', {
      phase: 'orchestrator', message: 'Something broke', recoverable: false,
    });
  });
});
