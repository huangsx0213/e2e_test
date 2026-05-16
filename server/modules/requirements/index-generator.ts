import { requirementRepo } from './repository.ts';
import fs from 'fs';
import path from 'path';

interface IndexItem {
  id: string;
  title: string;
  level: number;
  parent: string | null;
  summary: string;
  tags: string[];
  priority: string;
  risk: string;
  type: string;
  testType: string[];
  childCount: number;
  children: string[];
}

function computeLevel(itemId: string, allIds: Map<string, string | null>, depth: number = 0): number {
  const parentId = allIds.get(itemId);
  if (!parentId) return 0;
  if (depth > 10) return depth;
  return computeLevel(parentId, allIds, depth + 1);
}

function extractTags(text: string): string[] {
  const tags: string[] = [];
  const lower = text.toLowerCase();
  if (lower.includes('login') || lower.includes('auth') || lower.includes('登录') || lower.includes('认证')) tags.push('auth');
  if (lower.includes('register') || lower.includes('注册')) tags.push('registration');
  if (lower.includes('payment') || lower.includes('支付')) tags.push('payment');
  if (lower.includes('profile') || lower.includes('个人')) tags.push('profile');
  if (lower.includes('dashboard') || lower.includes('仪表')) tags.push('dashboard');
  if (lower.includes('api') || lower.includes('接口')) tags.push('api');
  if (lower.includes('email') || lower.includes('邮件')) tags.push('email');
  if (lower.includes('search') || lower.includes('搜索')) tags.push('search');
  if (lower.includes('password') || lower.includes('密码')) tags.push('auth');
  if (lower.includes('user') || lower.includes('用户')) tags.push('user');
  if (lower.includes('role') || lower.includes('角色') || lower.includes('permission') || lower.includes('权限')) tags.push('auth');
  return [...new Set(tags)];
}

function inferTestTypes(req: { description: string; type: string }): string[] {
  const types: string[] = ['functional'];
  const text = req.description.toLowerCase();
  if (text.includes('performance') || text.includes('性能') || text.includes('concurrent') || text.includes('并发')) types.push('performance');
  if (text.includes('security') || text.includes('安全') || text.includes('permission') || text.includes('权限')) types.push('security');
  if (text.includes('ui') || text.includes('page') || text.includes('页面') || text.includes('display') || text.includes('显示')) types.push('ui');
  if (req.type !== 'functional') types.push(req.type);
  return [...new Set(types)];
}

function truncate(text: string, maxLen: number): string {
  return text.length <= maxLen ? text : text.slice(0, maxLen - 3) + '...';
}

export function buildRequirementIndex(projectId: string): IndexItem[] {
  const allReqs = requirementRepo.listByProject(projectId);
  if (allReqs.length === 0) return [];
  const parentMap = new Map(allReqs.map(r => [r.id, r.parentId || null]));
  const childMap = new Map<string, string[]>();
  for (const r of allReqs) {
    const parentId = r.parentId || '__root__';
    if (!childMap.has(parentId)) childMap.set(parentId, []);
    childMap.get(parentId)!.push(r.id);
  }
  return allReqs.map(r => ({
    id: r.id,
    title: r.title,
    level: computeLevel(r.id, parentMap),
    parent: r.parentId || null,
    summary: truncate(r.description, 200),
    tags: extractTags(r.title + ' ' + r.description),
    priority: r.priority,
    risk: r.riskLevel,
    type: r.type,
    testType: inferTestTypes(r),
    childCount: (childMap.get(r.id) || []).length,
    children: childMap.get(r.id) || [],
  }));
}

export function regenerateIndexFile(projectId: string): void {
  const index = buildRequirementIndex(projectId);
  const skillsDir = path.resolve(process.cwd(), 'shared/ai/skills/requirement-index/references');
  if (!fs.existsSync(skillsDir)) { fs.mkdirSync(skillsDir, { recursive: true }); }
  fs.writeFileSync(path.join(skillsDir, 'index.json'), JSON.stringify(index, null, 2));
  console.log(`[index] Regenerated requirement index for project ${projectId}: ${index.length} entries`);
}