/**
 * Provider 认证矩阵
 *
 * 基于 docs/05-AIDrivenRecordingEngine.md §6 的认证等级定义。
 * 决定某个 provider 类型是否允许触发 AI 驱动录制。
 *
 * 认证等级：
 *   - certified: 已认证，UI 正常显示入口
 *   - experimental: 实验性，UI 显示入口但标注 "Beta"
 *   - unverified: 待验证，UI 不显示入口
 */

import type { DecryptedProviderConfig } from '../../../shared/recording/protocol.ts';

export type ProviderAuthLevel = 'certified' | 'experimental' | 'unverified';

interface ProviderMatrixEntry {
  level: ProviderAuthLevel;
  /** 是否允许触发 AI 录制（certified + experimental 允许，unverified 不允许） */
  canTrigger: boolean;
  /** UI 显示标签 */
  label: string;
}

const PROVIDER_MATRIX: Record<DecryptedProviderConfig['type'], ProviderMatrixEntry> = {
  'azure-openai': { level: 'certified', canTrigger: true, label: '已认证' },
  'openai-compatible': { level: 'unverified', canTrigger: false, label: '待验证' },
  anthropic: { level: 'experimental', canTrigger: true, label: 'Beta' },
  google: { level: 'experimental', canTrigger: true, label: 'Beta' },
};

/**
 * 查询某个 provider 类型的认证等级。
 * 未知类型默认为 unverified。
 */
export function getProviderAuthLevel(type: DecryptedProviderConfig['type']): ProviderMatrixEntry {
  return PROVIDER_MATRIX[type] ?? { level: 'unverified', canTrigger: false, label: '待验证' };
}

/**
 * 判断某个 providerConfig 是否可以触发 AI 驱动录制。
 * 用于 canStartAiRecord 前端检查和 Server 端校验。
 */
export function canTriggerAiRecording(providerConfig: DecryptedProviderConfig): boolean {
  return getProviderAuthLevel(providerConfig.type).canTrigger;
}

/**
 * 列出所有可触发 AI 录制的 provider 类型（用于 UI 下拉过滤）。
 */
export function listTriggerableProviderTypes(): DecryptedProviderConfig['type'][] {
  return (Object.keys(PROVIDER_MATRIX) as DecryptedProviderConfig['type'][])
    .filter((type) => PROVIDER_MATRIX[type].canTrigger);
}
