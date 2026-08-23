// @vitest-environment node
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { TestGenRepository } from '../repository.ts';

describe('TestGenRepository agent log retry attempts', () => {
  let database: Database.Database;
  let repository: TestGenRepository;

  beforeEach(() => {
    database = new Database(':memory:');
    database.exec(`
      CREATE TABLE test_gen_agent_logs (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL,
        batch INTEGER NOT NULL,
        agent_name TEXT NOT NULL,
        phase TEXT NOT NULL,
        input_prompt TEXT,
        output_data TEXT,
        token_usage TEXT,
        latency_ms INTEGER,
        raw_trace TEXT,
        status TEXT NOT NULL,
        error_message TEXT,
        error_raw_response TEXT,
        tool_history TEXT,
        thinking_text TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);
    repository = new TestGenRepository(database);
  });

  afterEach(() => {
    database.close();
  });

  it('clears a failed attempt before RUNNING and completes with only current output', () => {
    const toolHistory = [{ name: 'query', input: {}, output: {}, latencyMs: 1 }];
    repository.saveAgentLog({
      logId: 'log-1',
      batch: 1,
      agentName: 'test_analyst',
      status: 'FAILED',
      outputData: { stalePartial: true },
      errorMessage: 'old failure',
      errorRawResponse: 'old raw response',
      rawTrace: [{ step: 1 }],
      toolHistory,
    }, 'run-1');
    database.prepare(`
      UPDATE test_gen_agent_logs SET thinking_text = 'old thinking' WHERE id = 'log-1'
    `).run();

    repository.saveAgentLog({
      logId: 'log-1',
      batch: 1,
      agentName: 'test_analyst',
      status: 'RUNNING',
      rawTrace: [],
      toolHistory,
    }, 'run-1');

    expect(database.prepare(`
      SELECT status, output_data, token_usage, latency_ms, raw_trace,
             error_message, error_raw_response, tool_history, thinking_text
      FROM test_gen_agent_logs WHERE id = 'log-1'
    `).get()).toEqual({
      status: 'RUNNING',
      output_data: null,
      token_usage: null,
      latency_ms: null,
      raw_trace: null,
      error_message: null,
      error_raw_response: null,
      tool_history: JSON.stringify(toolHistory),
      thinking_text: null,
    });

    repository.saveAgentLog({
      logId: 'log-1',
      batch: 1,
      agentName: 'test_analyst',
      status: 'COMPLETED',
      outputData: { testConditions: [{ id: 'current' }] },
      tokenUsage: { input: 2, output: 3, reasoning: 1 },
      latencyMs: 20,
      toolHistory,
    }, 'run-1');

    expect(repository.getAgentLogs('run-1')[0]).toMatchObject({
      status: 'COMPLETED',
      output_data: { testConditions: [{ id: 'current' }] },
      error_message: null,
      error_raw_response: null,
      tool_history: toolHistory,
    });
  });

  it('clears completed output before RUNNING and does not retain it on failure', () => {
    const firstAttemptTools = [{ name: 'first', input: {}, output: {}, latencyMs: 1 }];
    const durableTools = [
      ...firstAttemptTools,
      { name: 'retry', input: {}, output: {}, latencyMs: 2 },
    ];
    repository.saveAgentLog({
      logId: 'log-2',
      batch: 1,
      agentName: 'test_designer',
      status: 'COMPLETED',
      outputData: { draftTestCases: [{ id: 'stale-success' }] },
      toolHistory: firstAttemptTools,
    }, 'run-1');

    repository.saveAgentLog({
      logId: 'log-2',
      batch: 1,
      agentName: 'test_designer',
      status: 'RUNNING',
      rawTrace: [],
      toolHistory: firstAttemptTools,
    }, 'run-1');
    expect(repository.getAgentLogs('run-1')[0]).toMatchObject({
      status: 'RUNNING',
      output_data: null,
      error_message: null,
      error_raw_response: null,
      tool_history: firstAttemptTools,
    });

    repository.saveAgentLog({
      logId: 'log-2',
      batch: 1,
      agentName: 'test_designer',
      status: 'FAILED',
      errorMessage: 'current failure',
      errorRawResponse: 'current raw response',
      toolHistory: durableTools,
    }, 'run-1');

    expect(repository.getAgentLogs('run-1')[0]).toMatchObject({
      status: 'FAILED',
      output_data: null,
      error_message: 'current failure',
      error_raw_response: 'current raw response',
      tool_history: durableTools,
    });
  });
});
