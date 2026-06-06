import type { SkillDefinition } from './nodes/types';

/**
 * === Skill 驱动质量的核心配置文件 ===
 *
 * 要调整测试用例质量，只需修改此文件中的 Skill 列表：
 * - 新增 Skill → 给 Agent 更多信息获取能力
 * - 删除 Skill → 减少上下文，降低 token 消耗
 * - 修改 Skill description → 影响 LLM 调用时机
 * - 修改 Skill execute → 改变返回数据质量
 *
 * Agent 节点代码完全不需要改动。
 */

// ============================================================
// Test Analyst Skills
// ============================================================
export const ANALYST_SKILLS: SkillDefinition[] = [
  {
    name: 'requirement_query',
    description: 'Query detailed requirement information including full description, acceptance criteria, and related requirements. Use when you need more context about a specific requirement beyond what is provided in the input.',
    parameters: {
      type: 'object',
      properties: {
        requirementId: { type: 'string', description: 'The requirement ID to query' },
      },
      required: ['requirementId'],
    },
    execute: async (args) => {
      // 占位：实际实现会查询 requirement 数据库
      const { requirementId } = args;
      return { id: requirementId, detail: 'Detailed requirement information would be loaded here' };
    },
  },
];

// ============================================================
// Test Designer Skills
// ============================================================
export const DESIGNER_SKILLS: SkillDefinition[] = [
  {
    name: 'db_schema_query',
    description: 'Query database table schema to get field names, types, constraints, and relationships. Use this to generate accurate test data and understand data boundaries.',
    parameters: {
      type: 'object',
      properties: {
        tableName: { type: 'string', description: 'The database table name to query' },
      },
      required: ['tableName'],
    },
    execute: async (args) => {
      const { tableName } = args;
      return { table: tableName, columns: [], message: 'Schema query placeholder - implement with actual DB connection' };
    },
  },
  {
    name: 'api_spec_query',
    description: 'Query API endpoint specifications including request/response schemas, HTTP methods, and validation rules. Use this to design accurate API test cases.',
    parameters: {
      type: 'object',
      properties: {
        endpoint: { type: 'string', description: 'The API endpoint path to query' },
      },
      required: ['endpoint'],
    },
    execute: async (args) => {
      const { endpoint } = args;
      return { endpoint, method: 'GET', spec: 'API spec placeholder - implement with actual API docs' };
    },
  },
];

// ============================================================
// Quality Manager Skills
// ============================================================
export const QUALITY_SKILLS: SkillDefinition[] = [
  {
    name: 'coverage_check',
    description: 'Check actual test coverage against requirements. Returns coverage gaps, untested scenarios, and risk areas that need more test cases.',
    parameters: {
      type: 'object',
      properties: {
        requirementId: { type: 'string', description: 'Optional: specific requirement ID to check' },
      },
      required: [],
    },
    execute: async (args) => {
      return { covered: [], uncovered: [], message: 'Coverage check placeholder - implement with actual coverage analysis' };
    },
  },
];