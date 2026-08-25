/**
 * AI Recorder 起始 URL 解析（共享）
 *
 * 三端复用：Agent 会话、服务端前置校验、前端配置面板警告。
 * 规则与历史行为一致：preconditions 行内 https?:// URL，或 testData 中
 * key 包含 "url" 且值为完整 http(s):// 的条目。
 */
import type { NlTestCase } from '../contracts/index.ts';

/** 完整 http(s) URL（无空白、无中英文标点粘连） */
const ABSOLUTE_URL_RE = /^https?:\/\/[^\s，。；：！？、]+$/i;

/** 从文本行中提取 URL 并剥离尾部英文标点 */
function extractFromLine(line: string): string | null {
  const match = String(line).match(/https?:\/\/[^\s，。；：！？、]+/i);
  if (!match) return null;
  // 去掉 URL 尾部可能粘连的英文标点
  const url = match[0].replace(/[.,;:!?)\]]+$/, '');
  return ABSOLUTE_URL_RE.test(url) ? url : null;
}

/**
 * 从 NL 用例解析起始 URL；找不到返回 null（不抛错）。
 */
export function findCaseStartUrl(
  nlCase: Pick<NlTestCase, 'preconditions' | 'testData'>,
): string | null {
  for (const cond of nlCase.preconditions ?? []) {
    const url = extractFromLine(cond);
    if (url) return url;
  }
  for (const td of nlCase.testData ?? []) {
    if (/url/i.test(td.key) && ABSOLUTE_URL_RE.test(td.value.trim())) {
      return td.value.trim();
    }
  }
  return null;
}

/**
 * 规范化用户显式输入的起始 URL：
 * - 去除首尾空白；
 * - 缺少协议时自动补 https://；
 * - 结果必须是合法的绝对 http(s) URL，否则抛出可读错误。
 */
export function normalizeExplicitStartUrl(input: string): string {
  const value = String(input ?? '').trim();
  const candidate = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  if (!ABSOLUTE_URL_RE.test(candidate)) {
    throw new Error(
      `Invalid start URL: "${input}". Expected an absolute URL like https://app.example.com/login`,
    );
  }
  return candidate;
}
