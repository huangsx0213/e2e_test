import { describe, expect, it, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'events';
import {
  createAiRecorderSseGateway,
  registerAiRecorderWsRelay,
  AI_RECORDER_SSE_CLEANUP_EVENTS,
} from '../ws-relay.ts';
import {
  AI_RECORDER_COMPLETE_EVENT,
  AI_RECORDER_PROVIDER_CONFIG_REQUEST_EVENT,
  AI_RECORDER_PROVIDER_CONFIG_RESPONSE_EVENT,
} from '../../../../shared/recording/protocol.ts';

// === Mocks ===

vi.mock('../../../shared/services/websocketService.ts', () => ({
  wsService: { broadcast: vi.fn() },
}));

vi.mock('../../../shared/services/eventBus.ts', () => {
  const { EventEmitter } = require('events');
  const bus = new EventEmitter();
  return { globalEventBus: bus };
});

vi.mock('../../suites/repository.ts', () => ({
  saveSuite: vi.fn(),
}));

vi.mock('../nl-cases/repository.ts', () => ({
  nlCaseRepo: { get: vi.fn(), save: vi.fn() },
}));

vi.mock('../../../shared/utils/index.ts', () => ({
  randomId: (prefix: string) => `${prefix}-mock-id`,
  asId: (id: string, _prefix?: string) => id,
  asText: (v?: string, d?: string) => v ?? d ?? '',
  asOptionalText: (v?: string) => v ?? '',
  asNumber: (v?: number, d?: number) => v ?? d ?? 0,
  asArray: <T>(v?: T[]): T[] => Array.isArray(v) ? v : [],
}));

import { globalEventBus } from '../../../shared/services/eventBus.ts';
import { saveDraftSuite } from '../draft-suite-saver.ts';
import { saveSuite } from '../../suites/repository.ts';

// draft-suite-saver re-exports saveSuite from suites/repository
vi.mock('../draft-suite-saver.ts', () => ({
  saveDraftSuite: vi.fn(() => ({ suiteId: 'suite-saved', caseId: 'case-saved' })),
}));

// === Helpers ===

function makeMockRepo() {
  return {
    createRun: vi.fn(() => 'run-mock-id'),
    getRun: vi.fn(() => ({
      id: 'run-1',
      project_id: 'proj-1',
      nl_case_id: 'nl-1',
      status: 'running',
      started_at: new Date().toISOString(),
      result_suite_id: null,
      result_case_id: null,
    })),
    getRunsByProject: vi.fn(() => []),
    updateRunStatus: vi.fn(),
    updateRunResult: vi.fn(),
    updateRunProgress: vi.fn(),
    getDecryptedProviderConfig: vi.fn(),
    insertStepLog: vi.fn(),
    getStepLogs: vi.fn(() => []),
    getProviderConfig: vi.fn(),
  };
}

function captureSseEvents(sseGateway: ReturnType<typeof createAiRecorderSseGateway>, runId: string) {
  const events: Array<{ event: string; data: any }> = [];
  sseGateway.getEmitter(runId).on('sse', (event: string, data: any) => {
    events.push({ event, data });
  });
  return events;
}

describe('ws-relay', () => {
  let sseGateway: ReturnType<typeof createAiRecorderSseGateway>;
  let repository: ReturnType<typeof makeMockRepo>;
  let sendToAgent: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    sseGateway = createAiRecorderSseGateway();
    repository = makeMockRepo();
    sendToAgent = vi.fn();
    // 重新注册 relay（每个测试独立）
    registerAiRecorderWsRelay({ sseGateway, repository: repository as any, sendToAgent });
  });

  describe('createAiRecorderSseGateway', () => {
    it('cleanup 事件为 run:complete / run:error', () => {
      expect(AI_RECORDER_SSE_CLEANUP_EVENTS).toEqual(['run:complete', 'run:error']);
    });
  });

  describe('SSE 进度事件路由', () => {
    it('step:start 事件转发到 SSEGateway', () => {
      const events = captureSseEvents(sseGateway, 'run-1');
      globalEventBus.emit('RECORDING_EVENT', {
        event: 'step:start',
        data: { runId: 'run-1', stepIndex: 0, instruction: '点击登录' },
      }, {} as any);

      expect(events).toHaveLength(1);
      expect(events[0]).toEqual({
        event: 'step:start',
        data: { runId: 'run-1', stepIndex: 0, instruction: '点击登录' },
      });
    });

    it('step:complete 事件转发到 SSEGateway', () => {
      const events = captureSseEvents(sseGateway, 'run-1');
      globalEventBus.emit('RECORDING_EVENT', {
        event: 'step:complete',
        data: { runId: 'run-1', stepIndex: 0 },
      }, {} as any);

      expect(events).toHaveLength(1);
      expect(events[0].event).toBe('step:complete');
    });

    it('step:failed 事件转发到 SSEGateway', () => {
      const events = captureSseEvents(sseGateway, 'run-1');
      globalEventBus.emit('RECORDING_EVENT', {
        event: 'step:failed',
        data: { runId: 'run-1', stepIndex: 1, reason: 'timeout' },
      }, {} as any);

      expect(events).toHaveLength(1);
      expect(events[0].event).toBe('step:failed');
    });

    it('step:takeover 事件转发到 SSEGateway', () => {
      const events = captureSseEvents(sseGateway, 'run-1');
      globalEventBus.emit('RECORDING_EVENT', {
        event: 'step:takeover',
        data: { runId: 'run-1', stepIndex: 2, instruction: '手动完成', error: 'act failed' },
      }, {} as any);

      expect(events).toHaveLength(1);
      expect(events[0].event).toBe('step:takeover');
    });

    it('recorder:fallback 事件转发到 SSEGateway', () => {
      const events = captureSseEvents(sseGateway, 'run-1');
      globalEventBus.emit('RECORDING_EVENT', {
        event: 'recorder:fallback',
        data: { runId: 'run-1', reason: 'stagehand init failed' },
      }, {} as any);

      expect(events).toHaveLength(1);
      expect(events[0].event).toBe('recorder:fallback');
    });

    it('无 runId 的事件不转发', () => {
      const events = captureSseEvents(sseGateway, 'run-1');
      globalEventBus.emit('RECORDING_EVENT', {
        event: 'step:start',
        data: { stepIndex: 0 },
      }, {} as any);

      expect(events).toHaveLength(0);
    });
  });

  describe('step-recorded / element-recorded 不重复处理', () => {
    it('step-recorded 事件不转发到 SSEGateway（由 ws-handlers.ts 处理）', () => {
      const events = captureSseEvents(sseGateway, 'run-1');
      globalEventBus.emit('RECORDING_EVENT', {
        event: 'step-recorded',
        data: { runId: 'run-1', projectId: 'proj-1' },
      }, {} as any);

      expect(events).toHaveLength(0);
    });

    it('element-recorded 事件不转发到 SSEGateway', () => {
      const events = captureSseEvents(sseGateway, 'run-1');
      globalEventBus.emit('RECORDING_EVENT', {
        event: 'element-recorded',
        data: { runId: 'run-1', projectId: 'proj-1' },
      }, {} as any);

      expect(events).toHaveLength(0);
    });
  });

  describe('AI_RECORDER_COMPLETE 事件', () => {
    it('成功路径：更新 DB + SSE 广播 run:complete', () => {
      const events = captureSseEvents(sseGateway, 'run-1');
      const replayReport = { verdict: 'pass', runs: 3 };

      globalEventBus.emit('RECORDING_EVENT', {
        event: AI_RECORDER_COMPLETE_EVENT,
        data: {
          runId: 'run-1',
          result: { refinedSteps: [{ id: 's1' }], replayReport },
          suiteId: 'suite-pre-allocated',
          caseId: 'case-pre-allocated',
        },
      }, {} as any);

      // 已有预分配 suiteId，不再调用 saveDraftSuite，改为调用 saveSuite 更新 refined steps
      expect(saveDraftSuite).not.toHaveBeenCalled();
      expect(saveSuite).toHaveBeenCalledWith(expect.objectContaining({
        id: 'suite-pre-allocated',
        projectId: 'proj-1',
        cases: [expect.objectContaining({
          id: 'case-pre-allocated',
          steps: [{ id: 's1' }],
        })],
      }));

      // 更新 DB
      expect(repository.updateRunResult).toHaveBeenCalledWith('run-1', {
        suiteId: 'suite-pre-allocated',
        caseId: 'case-pre-allocated',
        replayReport,
      });
      expect(repository.updateRunStatus).toHaveBeenCalledWith('run-1', 'completed');

      // SSE 广播
      const completeEvent = events.find((e) => e.event === 'run:complete');
      expect(completeEvent).toBeDefined();
      expect(completeEvent!.data).toEqual({
        runId: 'run-1',
        suiteId: 'suite-pre-allocated',
        caseId: 'case-pre-allocated',
        replayReport,
        durationMs: expect.any(Number),
      });
    });

    it('无预分配 suiteId 时调用 saveDraftSuite', () => {
      // run 没有 result_suite_id
      repository.getRun.mockReturnValueOnce({
        id: 'run-1',
        project_id: 'proj-1',
        nl_case_id: 'nl-1',
        status: 'running',
        started_at: new Date().toISOString(),
        result_suite_id: null,
        result_case_id: null,
      });

      globalEventBus.emit('RECORDING_EVENT', {
        event: AI_RECORDER_COMPLETE_EVENT,
        data: {
          runId: 'run-1',
          result: { refinedSteps: [{ id: 's1' }] },
        },
      }, {} as any);

      expect(saveDraftSuite).toHaveBeenCalledWith('proj-1', 'nl-1', {
        steps: [{ id: 's1' }],
      });
    });

    it('错误路径：更新 DB 为 failed + SSE 广播 run:error', () => {
      const events = captureSseEvents(sseGateway, 'run-1');

      globalEventBus.emit('RECORDING_EVENT', {
        event: AI_RECORDER_COMPLETE_EVENT,
        data: {
          runId: 'run-1',
          error: 'stagehand init failed',
        },
      }, {} as any);

      expect(repository.updateRunStatus).toHaveBeenCalledWith('run-1', 'failed', 'stagehand init failed');
      expect(repository.updateRunResult).not.toHaveBeenCalled();

      const errorEvent = events.find((e) => e.event === 'run:error');
      expect(errorEvent).toBeDefined();
      expect(errorEvent!.data).toEqual({ runId: 'run-1', error: 'stagehand init failed' });
    });

    it('未知 runId 时只打日志，不更新 DB', () => {
      repository.getRun.mockReturnValueOnce(undefined);
      const events = captureSseEvents(sseGateway, 'unknown-run');

      globalEventBus.emit('RECORDING_EVENT', {
        event: AI_RECORDER_COMPLETE_EVENT,
        data: { runId: 'unknown-run', result: {} },
      }, {} as any);

      expect(repository.updateRunStatus).not.toHaveBeenCalled();
      expect(repository.updateRunResult).not.toHaveBeenCalled();
      expect(events).toHaveLength(0);
    });
  });

  describe('AI_RECORDER_PROVIDER_CONFIG_REQUEST 事件', () => {
    it('查询 DB 解密 config + 通过 WS 回传 RESPONSE', () => {
      const mockConfig = {
        id: 'pc-1',
        name: 'openai',
        type: 'openai-compatible',
        apiKey: 'sk-test',
        model: 'gpt-4',
      };
      repository.getDecryptedProviderConfig.mockReturnValueOnce(mockConfig);

      globalEventBus.emit('RECORDING_EVENT', {
        event: AI_RECORDER_PROVIDER_CONFIG_REQUEST_EVENT,
        data: { runId: 'run-1', providerConfigId: 'pc-1' },
      }, {} as any);

      expect(repository.getDecryptedProviderConfig).toHaveBeenCalledWith('pc-1');
      expect(sendToAgent).toHaveBeenCalledWith(
        AI_RECORDER_PROVIDER_CONFIG_RESPONSE_EVENT,
        { runId: 'run-1', providerConfigId: 'pc-1', providerConfig: mockConfig },
      );
    });

    it('providerConfig 不存在时回传 error', () => {
      repository.getDecryptedProviderConfig.mockReturnValueOnce(undefined);

      globalEventBus.emit('RECORDING_EVENT', {
        event: AI_RECORDER_PROVIDER_CONFIG_REQUEST_EVENT,
        data: { runId: 'run-1', providerConfigId: 'nonexistent' },
      }, {} as any);

      expect(sendToAgent).toHaveBeenCalledWith(
        AI_RECORDER_PROVIDER_CONFIG_RESPONSE_EVENT,
        { runId: 'run-1', providerConfigId: 'nonexistent', error: 'Provider config not found' },
      );
    });

    it('缺少 runId 时不处理', () => {
      globalEventBus.emit('RECORDING_EVENT', {
        event: AI_RECORDER_PROVIDER_CONFIG_REQUEST_EVENT,
        data: { providerConfigId: 'pc-1' },
      }, {} as any);

      expect(repository.getDecryptedProviderConfig).not.toHaveBeenCalled();
      expect(sendToAgent).not.toHaveBeenCalled();
    });

    it('缺少 providerConfigId 时不处理', () => {
      globalEventBus.emit('RECORDING_EVENT', {
        event: AI_RECORDER_PROVIDER_CONFIG_REQUEST_EVENT,
        data: { runId: 'run-1' },
      }, {} as any);

      expect(repository.getDecryptedProviderConfig).not.toHaveBeenCalled();
      expect(sendToAgent).not.toHaveBeenCalled();
    });
  });

  describe('未识别的事件', () => {
    it('未识别事件不转发到 SSE', () => {
      const events = captureSseEvents(sseGateway, 'run-1');
      globalEventBus.emit('RECORDING_EVENT', {
        event: 'unknown-event',
        data: { runId: 'run-1' },
      }, {} as any);

      expect(events).toHaveLength(0);
    });
  });
});
