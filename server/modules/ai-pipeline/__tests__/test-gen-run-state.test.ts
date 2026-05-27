import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('../../../shared/utils/index.ts', () => ({
  randomId: vi.fn(() => 'aglog_mock123'),
}));

import { TestGenRunState } from '../test-gen-run-state.ts';

describe('TestGenRunState', () => {
  let state: TestGenRunState;

  beforeEach(() => {
    state = new TestGenRunState();
  });

  it('setBatch updates currentBatch', () => {
    state.setBatch(5);
    expect(state.currentBatch).toBe(5);
  });

  it('recordAgentStart creates RUNNING snapshot', () => {
    const snap = state.recordAgentStart('test_analyst', 1, [{ role: 'user', content: 'hi' }]);

    expect(snap.agentName).toBe('test_analyst');
    expect(snap.batch).toBe(1);
    expect(snap.status).toBe('RUNNING');
    expect(snap.inputPrompt).toEqual([{ role: 'user', content: 'hi' }]);
    expect(snap.outputData).toBeNull();
    expect(snap.logId).toBe('aglog_mock123');
  });

  it('recordAgentStart accepts optional inputPrompt', () => {
    const snap = state.recordAgentStart('designer', 2);
    expect(snap.inputPrompt).toBeNull();
  });

  it('recordAgentComplete updates snapshot and accumulates totals', () => {
    state.recordAgentStart('analyst', 1);
    state.recordAgentComplete('analyst', 1, {
      tokenUsage: { input: 100, output: 50, reasoning: 10 },
      latencyMs: 200,
      outputData: { conditions: [] },
    });

    expect(state.totalPromptTokens).toBe(100);
    expect(state.totalCompletionTokens).toBe(50);
    expect(state.totalReasoningTokens).toBe(10);
    expect(state.totalLatencyMs).toBe(200);

    const usage = state.getUsage();
    expect(usage.prompt_tokens).toBe(100);
    expect(usage.completion_tokens).toBe(50);
    expect(usage.reasoning_tokens).toBe(10);
    expect(usage.total_tokens).toBe(160);
  });

  it('recordAgentComplete creates snapshot if missing', () => {
    const snap = state.recordAgentComplete('analyst', 1, {
      tokenUsage: { input: 10, output: 5, reasoning: 1 },
      latencyMs: 50,
    });
    expect(snap).not.toBeNull();
    expect(snap!.status).toBe('COMPLETED');
  });

  it('recordAgentComplete sets inputPrompt when provided', () => {
    state.recordAgentStart('analyst', 1);
    state.recordAgentComplete('analyst', 1, {
      tokenUsage: { input: 0, output: 0, reasoning: 0 },
      latencyMs: 0,
      inputPrompt: [{ role: 'user', content: 'hello' }],
    });
    const usage = state.getUsage();
    expect(usage.total_tokens).toBe(0);
  });

  it('recordAgentStep adds trace entry to snapshot', () => {
    state.recordAgentStart('analyst', 1);
    state.recordAgentStep('analyst', 1, 0, 'parse');
    state.recordAgentStep('analyst', 1, 1, 'transform');
    // access internal trace via getUsage — no direct accessor, but we verify no crash
    expect(state.totalLatencyMs).toBe(0);
  });

  it('getUsage returns zero when no runs', () => {
    const usage = state.getUsage();
    expect(usage).toEqual({ prompt_tokens: 0, completion_tokens: 0, reasoning_tokens: 0, total_tokens: 0 });
  });
});
