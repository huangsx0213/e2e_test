import type { SkillRegistry, SkillMetadata } from './skill-registry.ts';
import type { JsonSchema } from './tool.ts';

export function createSearchSkillsTool(registry: SkillRegistry) {
  return {
    name: 'search_skills',
    description: 'Search available skills by name, description, or tags. Returns metadata (name, description, tags) for matching skills.',
    parameters: {
      type: 'object' as const,
      properties: {
        query: { type: 'string' as const, description: 'Search query' },
      },
      required: ['query'],
    } satisfies JsonSchema,
    execute: async (args: { query: string }): Promise<SkillMetadata[]> => {
      return registry.search(args.query);
    },
  };
}

export function createLoadSkillTool(registry: SkillRegistry) {
  return {
    name: 'load_skill',
    description: 'Load the full SKILL.md content for a skill by name. Injects instructions into the agent context.',
    parameters: {
      type: 'object' as const,
      properties: {
        name: { type: 'string' as const, description: 'Skill name to load' },
      },
      required: ['name'],
    } satisfies JsonSchema,
    execute: async (args: { name: string }): Promise<string> => {
      return registry.loadContent(args.name);
    },
  };
}

export function createExecuteSkillModuleTool(registry: SkillRegistry, deps?: { db?: any; toolRegistry?: any }) {
  return {
    name: 'execute_skill_module',
    description: 'Execute a function from a skill executable module (index.ts). Calls the exported function with provided arguments.',
    parameters: {
      type: 'object' as const,
      properties: {
        skillName: { type: 'string' as const, description: 'Name of the skill whose module to call' },
        functionName: { type: 'string' as const, description: 'Name of the exported function to call' },
        args: { type: 'array' as const, description: 'Array of arguments to pass to the function', items: { type: 'string' as const } },
      },
      required: ['skillName', 'functionName', 'args'],
    } satisfies JsonSchema,
    execute: async (args: { skillName: string; functionName: string; args: unknown[] }): Promise<unknown> => {
      const module = await registry.loadModule(args.skillName);
      if (module.createService && deps) {
        const service = module.createService(deps);
        return await service[args.functionName](...args.args);
      }
      if (typeof module[args.functionName] !== 'function') {
        throw new Error(`Function ${args.functionName} not found in skill ${args.skillName}`);
      }
      return await module[args.functionName](...(args.args ?? []));
    },
  };
}

export function createRequestReviewTool() {
  return {
    name: 'request_review',
    description: 'Request human review of intermediate results. Pauses execution until user provides feedback.',
    parameters: {
      type: 'object' as const,
      properties: {
        phase: { type: 'string' as const, description: 'Label for the review phase (e.g. "requirements", "test-design")' },
        data: { type: 'object' as const, description: 'Data to present for review' },
      },
      required: ['phase', 'data'],
    } satisfies JsonSchema,
    execute: async (_args: { phase: string; data: unknown }): Promise<never> => {
      throw new Error('request_review must be handled by the ReAct loop, not direct execution');
    },
  };
}