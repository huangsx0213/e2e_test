import { describe, expect, it } from 'vitest';
import {
  getProviderAuthLevel,
  canTriggerAiRecording,
  listTriggerableProviderTypes,
} from '../provider-matrix.ts';
import type { DecryptedProviderConfig } from '../../../../shared/recording/protocol.ts';

function makeConfig(type: DecryptedProviderConfig['type']): DecryptedProviderConfig {
  return {
    id: 'pc-1',
    name: 'test',
    type,
    apiKey: 'sk-test',
    model: 'gpt-4',
  };
}

describe('provider-matrix', () => {
  describe('getProviderAuthLevel', () => {
    it('azure-openai 为 certified', () => {
      const entry = getProviderAuthLevel('azure-openai');
      expect(entry.level).toBe('certified');
      expect(entry.canTrigger).toBe(true);
      expect(entry.label).toBe('已认证');
    });

    it('anthropic 为 experimental', () => {
      const entry = getProviderAuthLevel('anthropic');
      expect(entry.level).toBe('experimental');
      expect(entry.canTrigger).toBe(true);
      expect(entry.label).toBe('Beta');
    });

    it('google 为 experimental', () => {
      const entry = getProviderAuthLevel('google');
      expect(entry.level).toBe('experimental');
      expect(entry.canTrigger).toBe(true);
    });

    it('openai-compatible 为 unverified', () => {
      const entry = getProviderAuthLevel('openai-compatible');
      expect(entry.level).toBe('unverified');
      expect(entry.canTrigger).toBe(false);
      expect(entry.label).toBe('待验证');
    });
  });

  describe('canTriggerAiRecording', () => {
    it('azure-openai 允许触发', () => {
      expect(canTriggerAiRecording(makeConfig('azure-openai'))).toBe(true);
    });

    it('anthropic 允许触发（experimental）', () => {
      expect(canTriggerAiRecording(makeConfig('anthropic'))).toBe(true);
    });

    it('openai-compatible 不允许触发', () => {
      expect(canTriggerAiRecording(makeConfig('openai-compatible'))).toBe(false);
    });
  });

  describe('listTriggerableProviderTypes', () => {
    it('返回所有可触发的 provider 类型', () => {
      const types = listTriggerableProviderTypes();
      expect(types).toContain('azure-openai');
      expect(types).toContain('anthropic');
      expect(types).toContain('google');
      expect(types).not.toContain('openai-compatible');
    });
  });
});
