import { describe, expect, it, vi, beforeEach } from 'vitest';

// Mock db client — factory creates the mock, we access it via vi.mocked after import
vi.mock('../../../shared/db/client.ts', () => ({
  db: {
    prepare: vi.fn(),
  },
}));

// Mock crypto: decrypt returns the input prefixed with 'decrypted:'
vi.mock('../../../shared/crypto.ts', () => ({
  decryptApiKey: vi.fn((key: string) => `decrypted:${key}`),
}));

import { db } from '../../../shared/db/client.ts';
import { AiDrivenRecorderRepository } from '../repository.ts';

const mockPrepare = vi.mocked(db.prepare) as unknown as ReturnType<typeof vi.fn>;

function makeStmt() {
  return {
    run: vi.fn(),
    get: vi.fn(),
    all: vi.fn(() => []),
  };
}

describe('AiDrivenRecorderRepository', () => {
  let repo: AiDrivenRecorderRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    repo = new AiDrivenRecorderRepository();
  });

  describe('createRun', () => {
    it('插入 run 记录并返回 id', () => {
      const stmt = makeStmt();
      mockPrepare.mockReturnValue(stmt);

      const id = repo.createRun({
        projectId: 'proj-1',
        nlCaseId: 'nl-1',
        providerConfigId: 'pc-1',
        options: { headless: true },
      });

      expect(id).toMatch(/^ai-rec-run-/);
      expect(stmt.run).toHaveBeenCalledWith(
        expect.any(String),
        'proj-1',
        'nl-1',
        'pc-1',
        'agent',
        JSON.stringify({ headless: true }),
      );
    });

    it('不传 options 时 options 列为 null', () => {
      const stmt = makeStmt();
      mockPrepare.mockReturnValue(stmt);

      repo.createRun({ projectId: 'proj-1', nlCaseId: 'nl-1' });

      expect(stmt.run).toHaveBeenCalledWith(
        expect.any(String),
        'proj-1',
        'nl-1',
        null,
        'agent',
        null,
      );
    });

    it('支持自定义 id', () => {
      const stmt = makeStmt();
      mockPrepare.mockReturnValue(stmt);

      const id = repo.createRun({ id: 'custom-id', projectId: 'proj-1', nlCaseId: 'nl-1' });

      expect(id).toBe('custom-id');
    });

    it('defaults execution_mode to agent and persists overrides', () => {
      const stmt = makeStmt();
      mockPrepare.mockReturnValue(stmt);

      repo.createRun({ projectId: 'proj-1', nlCaseId: 'nl-1' });
      expect(mockPrepare).toHaveBeenCalledWith(expect.stringContaining('execution_mode'));
      expect(stmt.run).toHaveBeenLastCalledWith(
        expect.any(String),
        'proj-1',
        'nl-1',
        null,
        'agent',
        null,
      );

      repo.createRun({ projectId: 'proj-1', nlCaseId: 'nl-2', executionMode: 'local' });
      expect(stmt.run).toHaveBeenLastCalledWith(
        expect.any(String),
        'proj-1',
        'nl-2',
        null,
        'local',
        null,
      );
    });
  });

  describe('getRun', () => {
    it('按 id 查询', () => {
      const stmt = makeStmt();
      stmt.get.mockReturnValue({ id: 'run-1', status: 'running' });
      mockPrepare.mockReturnValue(stmt);

      const row = repo.getRun('run-1');

      expect(row).toEqual({ id: 'run-1', status: 'running' });
      expect(stmt.get).toHaveBeenCalledWith('run-1');
    });

    it('不存在时返回 undefined', () => {
      const stmt = makeStmt();
      stmt.get.mockReturnValue(undefined);
      mockPrepare.mockReturnValue(stmt);

      const row = repo.getRun('nonexistent');

      expect(row).toBeUndefined();
    });
  });

  describe('getRunsByProject', () => {
    it('按 project_id 查询并按 started_at DESC 排序', () => {
      const stmt = makeStmt();
      stmt.all.mockReturnValue([{ id: 'run-1' }, { id: 'run-2' }]);
      mockPrepare.mockReturnValue(stmt);

      const rows = repo.getRunsByProject('proj-1');

      expect(rows).toHaveLength(2);
      expect(stmt.all).toHaveBeenCalledWith('proj-1');
    });
  });

  describe('updateRunStatus', () => {
    it('中间状态（running/refining/replaying）不设置 completed_at', () => {
      const stmt = makeStmt();
      mockPrepare.mockReturnValue(stmt);

      repo.updateRunStatus('run-1', 'refining');

      expect(stmt.run).toHaveBeenCalledWith('refining', 'run-1');
    });

    it('终态（completed/failed）设置 completed_at', () => {
      const stmt = makeStmt();
      mockPrepare.mockReturnValue(stmt);

      repo.updateRunStatus('run-1', 'completed');

      expect(stmt.run).toHaveBeenCalledWith('completed', 'run-1');
    });

    it('failed 状态带 error 信息', () => {
      const stmt = makeStmt();
      mockPrepare.mockReturnValue(stmt);

      repo.updateRunStatus('run-1', 'failed', 'something broke');

      expect(stmt.run).toHaveBeenCalledWith('failed', 'something broke', 'run-1');
    });
  });

  describe('updateRunProgress', () => {
    it('只更新提供的字段', () => {
      const stmt = makeStmt();
      mockPrepare.mockReturnValue(stmt);

      repo.updateRunProgress('run-1', { totalSteps: 5, completedSteps: 2 });

      expect(stmt.run).toHaveBeenCalledWith(5, 2, 'run-1');
    });

    it('空对象时不执行 SQL', () => {
      const stmt = makeStmt();
      mockPrepare.mockReturnValue(stmt);

      repo.updateRunProgress('run-1', {});

      expect(stmt.run).not.toHaveBeenCalled();
    });
  });

  describe('updateRunResult', () => {
    it('更新 suiteId、caseId、replayReport', () => {
      const stmt = makeStmt();
      mockPrepare.mockReturnValue(stmt);

      const replayReport = { verdict: 'pass', runs: 3 };
      repo.updateRunResult('run-1', {
        suiteId: 'suite-1',
        caseId: 'case-1',
        replayReport,
      });

      expect(stmt.run).toHaveBeenCalledWith(
        'suite-1',
        'case-1',
        JSON.stringify(replayReport),
        'run-1',
      );
    });

    it('只更新提供的字段', () => {
      const stmt = makeStmt();
      mockPrepare.mockReturnValue(stmt);

      repo.updateRunResult('run-1', { suiteId: 'suite-1' });

      expect(stmt.run).toHaveBeenCalledWith('suite-1', 'run-1');
    });
  });

  describe('insertStepLog', () => {
    it('插入步骤日志并返回 id', () => {
      const stmt = makeStmt();
      mockPrepare.mockReturnValue(stmt);

      const id = repo.insertStepLog({
        runId: 'run-1',
        nlStepIndex: 0,
        instruction: '点击登录按钮',
        expected: '跳转到首页',
        success: true,
        assertions: { type: 'url' },
        recordedStepCount: 3,
        retryCount: 0,
        durationMs: 1500,
        provenance: { source: 'stagehand' },
      });

      expect(id).toMatch(/^ai-rec-step-/);
      expect(stmt.run).toHaveBeenCalledWith(
        expect.any(String),
        'run-1',
        0,
        '点击登录按钮',
        '跳转到首页',
        1,
        JSON.stringify({ type: 'url' }),
        3,
        0,
        1500,
        null,
        JSON.stringify({ source: 'stagehand' }),
        null,   // log_details
      );
    });

    it('可选字段省略时使用默认值', () => {
      const stmt = makeStmt();
      mockPrepare.mockReturnValue(stmt);

      repo.insertStepLog({
        runId: 'run-1',
        nlStepIndex: 1,
        instruction: '输入用户名',
      });

      expect(stmt.run).toHaveBeenCalledWith(
        expect.any(String),
        'run-1',
        1,
        '输入用户名',
        null,    // expected
        0,       // success
        null,    // assertions
        0,       // recordedStepCount
        0,       // retryCount
        null,    // durationMs
        null,    // error
        null,    // provenance
        null,    // log_details
      );
    });

    it('logDetails 序列化进 log_details 列', () => {
      const stmt = makeStmt();
      mockPrepare.mockReturnValue(stmt);

      repo.insertStepLog({
        runId: 'run-1',
        nlStepIndex: 2,
        instruction: '点击',
        logDetails: { verificationWarning: 'w', logs: [{ t: 1, level: 'info', message: 'm' }] },
      });

      expect(stmt.run).toHaveBeenCalledWith(
        expect.any(String),
        'run-1',
        2,
        '点击',
        null,
        0,
        null,
        0,
        0,
        null,
        null,
        null,
        JSON.stringify({ verificationWarning: 'w', logs: [{ t: 1, level: 'info', message: 'm' }] }),
      );
    });
  });

  describe('getStepLogs', () => {
    it('按 run_id 查询并按 nl_step_index 排序', () => {
      const stmt = makeStmt();
      stmt.all.mockReturnValue([
        { id: 'step-0', nl_step_index: 0 },
        { id: 'step-1', nl_step_index: 1 },
      ]);
      mockPrepare.mockReturnValue(stmt);

      const logs = repo.getStepLogs('run-1');

      expect(logs).toHaveLength(2);
      expect(stmt.all).toHaveBeenCalledWith('run-1');
    });
  });

  describe('getProviderConfig', () => {
    it('按 id 查询 provider_config', () => {
      const stmt = makeStmt();
      stmt.get.mockReturnValue({ id: 'pc-1', name: 'openai' });
      mockPrepare.mockReturnValue(stmt);

      const row = repo.getProviderConfig('pc-1');

      expect(row).toEqual({ id: 'pc-1', name: 'openai' });
    });
  });

  describe('getDecryptedProviderConfig', () => {
    it('解密 API key 并转换为 camelCase', () => {
      const stmt = makeStmt();
      stmt.get.mockReturnValue({
        id: 'pc-1',
        name: 'openai-prod',
        type: 'openai-compatible',
        endpoint: 'https://api.openai.com',
        encrypted_api_key: 'enc-key-123',
        deployment: null,
        api_version: null,
        model: 'gpt-4',
        models: '["gpt-4", "gpt-4o"]',
        is_active: 1,
        monthly_token_limit: null,
        fallback_config_ids: null,
      });
      mockPrepare.mockReturnValue(stmt);

      const config = repo.getDecryptedProviderConfig('pc-1');

      expect(config).toEqual({
        id: 'pc-1',
        name: 'openai-prod',
        type: 'openai-compatible',
        endpoint: 'https://api.openai.com',
        apiKey: 'decrypted:enc-key-123',
        deployment: undefined,
        apiVersion: undefined,
        model: 'gpt-4',
        models: ['gpt-4', 'gpt-4o'],
      });
    });

    it('provider_config 不存在时返回 undefined', () => {
      const stmt = makeStmt();
      stmt.get.mockReturnValue(undefined);
      mockPrepare.mockReturnValue(stmt);

      const config = repo.getDecryptedProviderConfig('nonexistent');

      expect(config).toBeUndefined();
    });

    it('models 为 null 时 models 字段为 undefined', () => {
      const stmt = makeStmt();
      stmt.get.mockReturnValue({
        id: 'pc-1',
        name: 'azure',
        type: 'azure-openai',
        endpoint: 'https://azure.com',
        encrypted_api_key: 'enc-key',
        deployment: 'dep-1',
        api_version: '2024-02-15',
        model: 'gpt-4',
        models: null,
        is_active: 1,
        monthly_token_limit: null,
        fallback_config_ids: null,
      });
      mockPrepare.mockReturnValue(stmt);

      const config = repo.getDecryptedProviderConfig('pc-1');

      expect(config?.models).toBeUndefined();
      expect(config?.deployment).toBe('dep-1');
      expect(config?.apiVersion).toBe('2024-02-15');
    });
  });
});
