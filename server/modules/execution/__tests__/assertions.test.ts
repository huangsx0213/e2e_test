import { describe, expect, it } from 'vitest';
import {
  evaluateAssertions,
  hasFailedAssertions,
  buildApiAssertionContext,
  type AssertionResult,
} from '../assertions.ts';
import type { StepAssertion } from '../../../../shared/contracts/index.ts';

function ast(overrides: Partial<StepAssertion> = {}): StepAssertion {
  return { id: 'a1', source: 'API_STATUS', operator: 'EQUALS', expectedValue: '200', ...overrides };
}

function apiCtx(body = '{}', headers = {}, status = 200, durationMs = 50) {
  return buildApiAssertionContext(body, headers, status, durationMs);
}

// ─── API_STATUS ───

describe('API_STATUS', () => {
  it('passes when status matches', () => {
    const results = evaluateAssertions(apiCtx('{}', {}, 200), [ast()]);
    expect(results[0].passed).toBe(true);
  });

  it('fails when status does not match', () => {
    const results = evaluateAssertions(apiCtx('{}', {}, 404), [ast()]);
    expect(results[0].passed).toBe(false);
    expect(results[0].message).toContain('404');
  });
});

// ─── API_HEADER ───

describe('API_HEADER', () => {
  it('passes when header value matches', () => {
    const results = evaluateAssertions(
      apiCtx('{}', { 'content-type': 'application/json' }),
      [ast({ source: 'API_HEADER', expression: 'content-type', expectedValue: 'application/json' })],
    );
    expect(results[0].passed).toBe(true);
  });

  it('is case-insensitive for header name', () => {
    const results = evaluateAssertions(
      apiCtx('{}', { 'Content-Type': 'application/json' }),
      [ast({ source: 'API_HEADER', expression: 'CONTENT-TYPE', expectedValue: 'application/json' })],
    );
    expect(results[0].passed).toBe(true);
  });

  it('fails when header not found', () => {
    const results = evaluateAssertions(apiCtx('{}'), [ast({ source: 'API_HEADER', expression: 'x-missing' })]);
    expect(results[0].passed).toBe(false);
  });
});

// ─── API_BODY_JSON ───

describe('API_BODY_JSON', () => {
  it('passes when JSONPath matches', () => {
    const results = evaluateAssertions(
      apiCtx(JSON.stringify({ user: { name: 'Alice' } })),
      [ast({ source: 'API_BODY_JSON', expression: '$.user.name', expectedValue: 'Alice' })],
    );
    expect(results[0].passed).toBe(true);
  });

  it('fails when JSONPath yields different value', () => {
    const results = evaluateAssertions(
      apiCtx(JSON.stringify({ user: { name: 'Bob' } })),
      [ast({ source: 'API_BODY_JSON', expression: '$.user.name', expectedValue: 'Alice' })],
    );
    expect(results[0].passed).toBe(false);
  });

  it('handles nested array access', () => {
    const results = evaluateAssertions(
      apiCtx(JSON.stringify({ items: [{ id: 1 }, { id: 2 }] })),
      [ast({ source: 'API_BODY_JSON', expression: '$.items[0].id', expectedValue: '1' })],
    );
    expect(results[0].passed).toBe(true);
  });
});

// ─── API_BODY_XML ───

describe('API_BODY_XML', () => {
  it('passes when XML path matches', () => {
    const results = evaluateAssertions(
      apiCtx('<root><name>Alice</name></root>'),
      [ast({ source: 'API_BODY_XML', expression: '$.root.name', expectedValue: 'Alice' })],
    );
    expect(results[0].passed).toBe(true);
  });

  it('parses XML body', () => {
    const results = evaluateAssertions(
      apiCtx('<root><name>Alice</name></root>'),
      [ast({ source: 'API_BODY_XML', expression: '$.root.name', expectedValue: 'Alice' })],
    );
    expect(results[0].passed).toBe(true);
  });
});

// ─── API_DURATION ───

describe('API_DURATION', () => {
  it('passes LESS_THAN_DURATION', () => {
    const results = evaluateAssertions(
      apiCtx('{}', {}, 200, 100),
      [ast({ source: 'API_DURATION', operator: 'LESS_THAN_DURATION', expectedValue: '500' })],
    );
    expect(results[0].passed).toBe(true);
  });

  it('fails LESS_THAN_DURATION when too slow', () => {
    const results = evaluateAssertions(
      apiCtx('{}', {}, 200, 600),
      [ast({ source: 'API_DURATION', operator: 'LESS_THAN_DURATION', expectedValue: '500' })],
    );
    expect(results[0].passed).toBe(false);
  });
});

// ─── OPERATORS ───

describe('operators', () => {
  it('EQUALS', () => {
    expect(evaluateAssertions(apiCtx(), [ast({ operator: 'EQUALS', expectedValue: '200' })])[0].passed).toBe(true);
    expect(evaluateAssertions(apiCtx('{}', {}, 404), [ast({ operator: 'EQUALS', expectedValue: '200' })])[0].passed).toBe(false);
  });

  it('NOT_EQUALS', () => {
    expect(evaluateAssertions(apiCtx('{}', {}, 404), [ast({ operator: 'NOT_EQUALS', expectedValue: '200' })])[0].passed).toBe(true);
  });

  it('CONTAINS', () => {
    const r = evaluateAssertions(
      apiCtx(JSON.stringify({ msg: 'Hello World' })),
      [ast({ source: 'API_BODY_JSON', expression: '$.msg', operator: 'CONTAINS', expectedValue: 'World' })],
    );
    expect(r[0].passed).toBe(true);
  });

  it('NOT_CONTAINS', () => {
    const r = evaluateAssertions(
      apiCtx(JSON.stringify({ msg: 'Hello World' })),
      [ast({ source: 'API_BODY_JSON', expression: '$.msg', operator: 'NOT_CONTAINS', expectedValue: 'Foo' })],
    );
    expect(r[0].passed).toBe(true);
  });

  it('EXISTS', () => {
    const r = evaluateAssertions(
      apiCtx(JSON.stringify({ key: 'val' })),
      [ast({ source: 'API_BODY_JSON', expression: '$.key', operator: 'EXISTS' })],
    );
    expect(r[0].passed).toBe(true);
  });

  it('NOT_EXISTS passes when value is not found', () => {
    const r = evaluateAssertions(
      apiCtx('{}', {}),
      [ast({ source: 'API_HEADER', expression: 'x-missing', operator: 'NOT_EXISTS' })],
    );
    expect(r[0].passed).toBe(true);
  });

  it('NOT_EXISTS fails when value exists', () => {
    const r = evaluateAssertions(
      apiCtx('{}', { 'x-present': 'val' }),
      [ast({ source: 'API_HEADER', expression: 'x-present', operator: 'NOT_EXISTS' })],
    );
    expect(r[0].passed).toBe(false);
  });

  it('MATCHES_REGEX', () => {
    const r = evaluateAssertions(
      apiCtx('{}', {}, 200),
      [ast({ operator: 'MATCHES_REGEX', expectedValue: '^2\\d{2}$' })],
    );
    expect(r[0].passed).toBe(true);
  });

  it('GREATER_THAN', () => {
    const r = evaluateAssertions(apiCtx('{}', {}, 200), [ast({ operator: 'GREATER_THAN', expectedValue: '100' })]);
    expect(r[0].passed).toBe(true);
  });

  it('LESS_THAN', () => {
    const r = evaluateAssertions(apiCtx('{}', {}, 200), [ast({ operator: 'LESS_THAN', expectedValue: '300' })]);
    expect(r[0].passed).toBe(true);
  });
});

// ─── IS_TYPE ───

describe('IS_TYPE', () => {
  it('detects string', () => {
    const r = evaluateAssertions(
      apiCtx(JSON.stringify({ v: 'hello' })),
      [ast({ source: 'API_BODY_JSON', expression: '$.v', operator: 'IS_TYPE', expectedValue: 'string' })],
    );
    expect(r[0].passed).toBe(true);
  });

  it('detects number', () => {
    const r = evaluateAssertions(
      apiCtx(JSON.stringify({ v: 42 })),
      [ast({ source: 'API_BODY_JSON', expression: '$.v', operator: 'IS_TYPE', expectedValue: 'number' })],
    );
    expect(r[0].passed).toBe(true);
  });

  it('detects array', () => {
    const r = evaluateAssertions(
      apiCtx(JSON.stringify({ v: [1, 2, 3] })),
      [ast({ source: 'API_BODY_JSON', expression: '$.v', operator: 'IS_TYPE', expectedValue: 'array' })],
    );
    expect(r[0].passed).toBe(true);
  });

  it('detects null', () => {
    const r = evaluateAssertions(
      apiCtx(JSON.stringify({ v: null })),
      [ast({ source: 'API_BODY_JSON', expression: '$.v', operator: 'IS_TYPE', expectedValue: 'null' })],
    );
    expect(r[0].passed).toBe(true);
  });
});

// ─── HAS_LENGTH ───

describe('HAS_LENGTH', () => {
  it('checks string length', () => {
    const r = evaluateAssertions(
      apiCtx(JSON.stringify({ v: 'hello' })),
      [ast({ source: 'API_BODY_JSON', expression: '$.v', operator: 'HAS_LENGTH', expectedValue: '5' })],
    );
    expect(r[0].passed).toBe(true);
  });

  it('checks array length', () => {
    const r = evaluateAssertions(
      apiCtx(JSON.stringify({ v: [1, 2, 3] })),
      [ast({ source: 'API_BODY_JSON', expression: '$.v', operator: 'HAS_LENGTH', expectedValue: '3' })],
    );
    expect(r[0].passed).toBe(true);
  });
});

// ─── CONTAINS_KEY ───

describe('CONTAINS_KEY', () => {
  it('passes when key exists', () => {
    const r = evaluateAssertions(
      apiCtx(JSON.stringify({ name: 'Alice', age: 30 })),
      [ast({ source: 'API_BODY_JSON', expression: '$', operator: 'CONTAINS_KEY', expectedValue: 'name' })],
    );
    expect(r[0].passed).toBe(true);
  });
});

// ─── MATCHES_JSON_SCHEMA ───

describe('MATCHES_JSON_SCHEMA', () => {
  it('validates against JSON Schema', () => {
    const schema = JSON.stringify({ type: 'object', properties: { name: { type: 'string' } }, required: ['name'] });
    const r = evaluateAssertions(
      apiCtx(JSON.stringify({ name: 'Alice' })),
      [ast({ source: 'API_BODY_JSON', expression: '$', operator: 'MATCHES_JSON_SCHEMA', expectedValue: schema })],
    );
    expect(r[0].passed).toBe(true);
  });

  it('fails on schema violation', () => {
    const schema = JSON.stringify({ type: 'object', properties: { name: { type: 'string' } }, required: ['name'] });
    const r = evaluateAssertions(
      apiCtx(JSON.stringify({})),
      [ast({ source: 'API_BODY_JSON', expression: '$', operator: 'MATCHES_JSON_SCHEMA', expectedValue: schema })],
    );
    expect(r[0].passed).toBe(false);
  });
});

// ─── FAILURE STRATEGY ───

describe('failure strategy', () => {
  it('fail-fast: stops at first failure', () => {
    const assertions = [
      ast({ id: 'a1', source: 'API_STATUS', operator: 'EQUALS', expectedValue: '200' }),
      ast({ id: 'a2', source: 'API_STATUS', operator: 'EQUALS', expectedValue: '404' }),
      ast({ id: 'a3', source: 'API_STATUS', operator: 'EQUALS', expectedValue: '200' }),
    ];
    const results = evaluateAssertions(apiCtx('{}', {}, 200), assertions, 'fail-fast');
    expect(results).toHaveLength(2);
    expect(results[0].passed).toBe(true);
    expect(results[1].passed).toBe(false);
  });

  it('soft: evaluates all assertions', () => {
    const assertions = [
      ast({ id: 'a1', source: 'API_STATUS', operator: 'EQUALS', expectedValue: '200' }),
      ast({ id: 'a2', source: 'API_STATUS', operator: 'EQUALS', expectedValue: '404' }),
      ast({ id: 'a3', source: 'API_STATUS', operator: 'EQUALS', expectedValue: '200' }),
    ];
    const results = evaluateAssertions(apiCtx('{}', {}, 200), assertions, 'soft');
    expect(results).toHaveLength(3);
    expect(results[0].passed).toBe(true);
    expect(results[1].passed).toBe(false);
    expect(results[2].passed).toBe(true);
  });

  it('continueOnFailure: overrides fail-fast', () => {
    const assertions = [
      ast({ id: 'a1', source: 'API_STATUS', operator: 'EQUALS', expectedValue: '404', continueOnFailure: true }),
      ast({ id: 'a2', source: 'API_STATUS', operator: 'EQUALS', expectedValue: '200' }),
    ];
    const results = evaluateAssertions(apiCtx('{}', {}, 200), assertions, 'fail-fast');
    expect(results).toHaveLength(2);
  });
});

// ─── hasFailedAssertions ───

describe('hasFailedAssertions', () => {
  it('returns false when all pass', () => {
    const results: AssertionResult[] = [
      { passed: true, message: 'ok', actualValue: '200', assertion: ast() },
    ];
    expect(hasFailedAssertions(results)).toBe(false);
  });

  it('returns true when any fails', () => {
    const results: AssertionResult[] = [
      { passed: true, message: 'ok', actualValue: '200', assertion: ast() },
      { passed: false, message: 'fail', actualValue: '404', assertion: ast() },
    ];
    expect(hasFailedAssertions(results)).toBe(true);
  });
});
