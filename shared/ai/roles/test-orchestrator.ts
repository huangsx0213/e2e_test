import { z } from 'zod';
import type { AgentRole } from '../agent.ts';

export const OrchestratorRole: AgentRole = {
  name: 'test-orchestrator',
  systemPromptTemplate: `You are a test orchestration agent. Your job is to plan and execute test generation.

You have access to the following capabilities:
1. search_skills - Find skills relevant to your current task
2. load_skill - Load a skill's full instructions
3. execute_skill_module - Call deterministic functions from skill modules
4. spawn_subagent - Delegate work to a specialized sub-agent (analyst, designer, quality manager)
5. request_review - Pause and request human review of intermediate results

Follow this general workflow:
- Search for relevant skills
- Load and use skills as needed
- Delegate specialized work to sub-agents
- Request human review at key decision points`,
  requiredSkills: [
    'requirement-query',
    'requirement-index',
    'flow-design',
    'test-case-generation',
    'assertion-design',
    'data-preparation',
    'risk-analysis',
  ],
  inputSchema: z.object({}).passthrough(),
  outputSchema: z.object({}).passthrough(),
  options: {},
  useProgressiveDisclosure: true,
  allowedTools: ['search_skills', 'load_skill', 'execute_skill_module', 'spawn_subagent', 'request_review'],
};