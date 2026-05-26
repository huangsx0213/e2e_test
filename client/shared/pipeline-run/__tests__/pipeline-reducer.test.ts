import { describe, expect, it } from 'vitest';
import { pipelineReducer, createInitialState } from '../pipeline-reducer';
import type { PipelineRunState } from '../types';

describe('pipelineReducer - Preparation node data flow', () => {
  function stateAfterPrepEvents(): PipelineRunState {
    let state = createInitialState();
    // Simulate RUN_STARTED
    state = pipelineReducer(state, {
      type: 'RUN_STARTED',
      runId: 'run-1',
      config: { requirementIds: ['req-1'], mode: 'auto' },
    });

    // Simulate SSE events that fire during preparation phase
    state = pipelineReducer(state, {
      type: 'SSE_EVENT',
      event: {
        type: 'pipeline:context',
        data: { flows: 2, indexEntries: 5 },
      },
    });

    state = pipelineReducer(state, {
      type: 'SSE_EVENT',
      event: {
        type: 'pipeline:budget',
        data: { estimated: 5000, limit: 10000, warning: false, message: 'Estimated 5000 tokens (limit 10000)' },
      },
    });

    state = pipelineReducer(state, {
      type: 'SSE_EVENT',
      event: {
        type: 'phase:start',
        data: { phase: 'preparation', message: 'Processing 5 requirements in 2 batch(es)' },
      },
    });

    return state;
  }

  it('stores initLogs in preparation node meta from SSE events', () => {
    const state = stateAfterPrepEvents();
    const prepNode = state.nodes.find(n => n.id === 'preparation');
    expect(prepNode).toBeDefined();
    expect(prepNode!.meta?.initLogs).toBeDefined();
    expect(prepNode!.meta!.initLogs).toHaveLength(3);
    expect(prepNode!.meta!.initLogs[0].type).toBe('pipeline:context');
    expect(prepNode!.meta!.initLogs[1].type).toBe('pipeline:budget');
    expect(prepNode!.meta!.initLogs[2].type).toBe('phase:start');
  });

  it('extracts requirementCount, totalBatches, etc. into preparation meta from SSE events', () => {
    const state = stateAfterPrepEvents();
    const prepNode = state.nodes.find(n => n.id === 'preparation');
    expect(prepNode!.meta?.requirementCount).toBe(5);
    expect(prepNode!.meta?.totalBatches).toBe(2);
    expect(prepNode!.meta?.estimatedTokens).toBe(5000);
    expect(prepNode!.meta?.flowCases).toBe(2);
  });

  it('preserves preparation meta after MERGE_AGENT_LOGS (preparation has no agentName, so skipped)', () => {
    const state = stateAfterPrepEvents();
    const mergedState = pipelineReducer(state, {
      type: 'MERGE_AGENT_LOGS',
      logs: [{ agent_name: 'test_analyst', output_data: { testConditions: [] }, status: 'COMPLETED' }],
    });
    const prepNode = mergedState.nodes.find(n => n.id === 'preparation');
    expect(prepNode!.meta?.requirementCount).toBe(5);
    expect(prepNode!.meta?.initLogs).toHaveLength(3);
  });

  it('stores agentLogs in state after MERGE_AGENT_LOGS (preparation log included)', () => {
    const state = stateAfterPrepEvents();
    const prepLog = {
      agent_name: 'preparation',
      output_data: {
        initLogs: [{ type: 'pipeline:context', data: { flows: 2, indexEntries: 5 }, timestamp: '2024-01-01' }],
        requirementCount: 5,
        totalBatches: 2,
      },
      status: 'COMPLETED',
    };
    const mergedState = pipelineReducer(state, {
      type: 'MERGE_AGENT_LOGS',
      logs: [prepLog, { agent_name: 'test_analyst', output_data: {}, status: 'COMPLETED' }],
    });
    expect(mergedState.agentLogs).toHaveLength(2);
    const foundPrepLog = mergedState.agentLogs.find((l: any) => l.agent_name === 'preparation');
    expect(foundPrepLog).toBeDefined();
    expect(foundPrepLog.output_data.requirementCount).toBe(5);
  });

  it('RESTORE_RUN resets agentLogs to empty array (data must be re-fetched)', () => {
    const state = stateAfterPrepEvents();
    const mergedState = pipelineReducer(state, {
      type: 'MERGE_AGENT_LOGS',
      logs: [{ agent_name: 'preparation', output_data: {}, status: 'COMPLETED' }],
    });
    expect(mergedState.agentLogs).toHaveLength(1);

    const restoredState = pipelineReducer(mergedState, {
      type: 'RESTORE_RUN',
      runId: 'run-1',
      phase: 'complete',
      status: 'COMPLETED',
    });

    // After restore, agentLogs should be empty - preparation node meta is also reset since nodes are re-created
    expect(restoredState.agentLogs).toHaveLength(0);
    const prepNode = restoredState.nodes.find(n => n.id === 'preparation');
    expect(prepNode!.meta?.initLogs).toBeUndefined();
    expect(prepNode!.meta?.requirementCount).toBeUndefined();
  });
});
