import { describe, it, expect } from 'vitest';
import { refineDraftSuite, dedupeSteps, mapAssertions, parameterize, redactSecrets, expandSelectors, markProvenance } from '../refiner';
import type { TestStep, UIElement } from '../../../shared/contracts/index.ts';

function makeStep(overrides: Partial<TestStep> = {}): TestStep {
  return {
    id: 's1',
    action: 'click',
    target: 'Login button',
    data: '',
    description: 'Click on Login button',
    isVerified: true,
    metadata: { recorder: { locator: { kind: 'official', selector: 'internal:role=button[name="Login"]' } } },
    ...overrides,
  };
}

describe('Refiner pipeline', () => {
  it('refineDraftSuite runs full pipeline and returns refined suite', () => {
    const steps = [
      makeStep({ id: 's1', action: 'goto', target: 'https://app.com/login', data: 'https://app.com/login' }),
      makeStep({ id: 's2', action: 'fill', target: 'Username', data: 'admin' }),
      makeStep({ id: 's3', action: 'fill', target: 'Username', data: 'admin' }), // duplicate
      makeStep({ id: 's4', action: 'fill', target: 'Password', data: 'secret123' }),
      makeStep({ id: 's5', action: 'click', target: 'Login button' }),
    ];
    const result = refineDraftSuite(steps, {
      secrets: ['secret123'],
      parameters: { username: 'admin' },
    });
    expect(result.steps.length).toBe(4); // s3 deduped
    expect(result.steps.find(s => s.target === 'Password')?.data).toBe('***');
    expect(result.steps.find(s => s.target === 'Username')?.data).toBe('${username}');
    expect(result.provenance).toBeDefined();
    expect(result.provenance.source).toBe('ai-recorder');
  });
});

describe('dedupeSteps', () => {
  it('removes consecutive identical steps', () => {
    const steps = [
      makeStep({ id: 's1', action: 'click', target: 'btn' }),
      makeStep({ id: 's2', action: 'click', target: 'btn' }),
      makeStep({ id: 's3', action: 'fill', target: 'input', data: 'x' }),
    ];
    expect(dedupeSteps(steps).length).toBe(2);
  });

  it('keeps non-consecutive duplicates', () => {
    const steps = [
      makeStep({ id: 's1', action: 'click', target: 'btn' }),
      makeStep({ id: 's2', action: 'fill', target: 'input', data: 'x' }),
      makeStep({ id: 's3', action: 'click', target: 'btn' }),
    ];
    expect(dedupeSteps(steps).length).toBe(3);
  });

  it('compares action+target+data', () => {
    const steps = [
      makeStep({ id: 's1', action: 'fill', target: 'input', data: 'a' }),
      makeStep({ id: 's2', action: 'fill', target: 'input', data: 'b' }),
    ];
    expect(dedupeSteps(steps).length).toBe(2);
  });
});

describe('mapAssertions', () => {
  it('marks verify/assert steps as assertions', () => {
    const steps = [
      makeStep({ id: 's1', action: 'click', target: 'btn' }),
      makeStep({ id: 's2', action: 'assertVisible', target: 'Welcome' }),
      makeStep({ id: 's3', action: 'assertText', target: 'Title', data: 'Dashboard' }),
    ];
    const result = mapAssertions(steps);
    expect(result[0].isAssertion).toBeFalsy();
    expect(result[1].isAssertion).toBe(true);
    expect(result[2].isAssertion).toBe(true);
  });
});

describe('parameterize', () => {
  it('replaces parameter values with template syntax', () => {
    const steps = [makeStep({ action: 'fill', target: 'Username', data: 'admin' })];
    const result = parameterize(steps, { username: 'admin' });
    expect(result[0].data).toBe('${username}');
  });

  it('leaves non-parameter values unchanged', () => {
    const steps = [makeStep({ action: 'fill', target: 'Notes', data: 'hello' })];
    const result = parameterize(steps, { username: 'admin' });
    expect(result[0].data).toBe('hello');
  });
});

describe('redactSecrets', () => {
  it('replaces secret values with ***', () => {
    const steps = [makeStep({ action: 'fill', target: 'Password', data: 'mypassword' })];
    const result = redactSecrets(steps, ['mypassword']);
    expect(result[0].data).toBe('***');
  });

  it('handles empty secrets list', () => {
    const steps = [makeStep({ action: 'fill', target: 'Password', data: 'mypassword' })];
    const result = redactSecrets(steps, []);
    expect(result[0].data).toBe('mypassword');
  });
});

describe('expandSelectors', () => {
  it('adds fallback selectors from locatorCandidates', () => {
    const step = makeStep({
      metadata: {
        recorder: {
          locator: { kind: 'official', selector: 'internal:role=button[name="Login"]' },
          locatorCandidates: [
            { kind: 'css', selector: '#login-btn' },
            { kind: 'xpath', selector: '//button[@id="login-btn"]' },
          ],
        },
      },
    });
    const result = expandSelectors([step]);
    expect(result[0].metadata?.recorder?.allLocators).toBeDefined();
    expect(result[0].metadata?.recorder?.allLocators.length).toBe(3); // primary + 2 candidates
  });
});

describe('markProvenance', () => {
  it('marks each step with ai-recorder provenance', () => {
    const steps = [makeStep()];
    const result = markProvenance(steps, { source: 'ai-recorder', runId: 'run-1', ts: 1000 });
    expect(result[0].metadata?.provenance?.source).toBe('ai-recorder');
    expect(result[0].metadata?.provenance?.runId).toBe('run-1');
  });
});
