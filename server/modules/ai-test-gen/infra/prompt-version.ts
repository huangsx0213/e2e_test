/** Prompt version used for LLM response cache invalidation. Bump when skills, prompts, or extraction schemas change. */
export function computePromptVersion(): string {
  return 'ai-test-gen-v2';
}
