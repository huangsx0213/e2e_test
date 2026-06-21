import { describe, expect, it } from 'vitest';
import { ANALYST_SKILLS } from '../graph/skills/skills.ts';

describe('istqb_guide skill', () => {
  it('loads specific guides when techniques are provided as human-readable names', async () => {
    const skill = ANALYST_SKILLS.find((entry) => entry.name === 'istqb_guide');
    expect(skill).toBeDefined();

    const result = await skill!.func({
      techniques: ['Decision Table Testing', 'State Transition Testing'],
    });

    const text = String(result);
    expect(text).toContain('Decision Table');
    expect(text).toContain('State Transition');
  });

  it('loads use-case guidance when techniques are passed in snake_case form', async () => {
    const skill = ANALYST_SKILLS.find((entry) => entry.name === 'istqb_guide');
    expect(skill).toBeDefined();

    const result = await skill!.func({
      techniques: ['use_case_testing'],
    });

    expect(String(result)).toContain('Use Case');
  });
});
