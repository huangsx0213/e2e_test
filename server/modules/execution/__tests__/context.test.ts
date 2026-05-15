import { describe, expect, it } from 'vitest';
import { ExecutionContext } from '../context.ts';

function createCtx(opts: {
  suiteVars?: Record<string, string>;
  envVars?: Record<string, string>;
  scenarioVars?: Record<string, string>;
  dataRow?: Record<string, string>;
}) {
  return ExecutionContext.create({
    suiteVariables: opts.suiteVars || {},
    environmentVariables: opts.envVars || {},
    scenarioVariables: opts.scenarioVars || {},
    suiteDataRow: opts.dataRow || {},
  });
}

// ─── Resolve ───

describe('resolve', () => {
  it('returns value from suite layer', () => {
    const ctx = createCtx({ suiteVars: { key: 'suite-val' } });
    expect(ctx.resolve('key')).toBe('suite-val');
  });

  it('returns value from environment layer', () => {
    const ctx = createCtx({ envVars: { key: 'env-val' } });
    expect(ctx.resolve('key')).toBe('env-val');
  });

  it('case layer overrides suite layer', () => {
    const ctx = createCtx({ suiteVars: { key: 'suite' } });
    ctx.setRuntimeVar('key', 'case', 'CASE');
    expect(ctx.resolve('key')).toBe('case');
  });

  it('returns undefined for unknown key', () => {
    expect(createCtx({}).resolve('nope')).toBeUndefined();
  });

  it('suite data row overrides suite default', () => {
    const ctx = createCtx({ suiteVars: { key: 'default' }, dataRow: { key: 'row' } });
    expect(ctx.resolve('key')).toBe('row');
  });

  it('scenario overrides suite', () => {
    const ctx = createCtx({ suiteVars: { key: 'suite' }, scenarioVars: { key: 'scenario' } });
    expect(ctx.resolve('key')).toBe('scenario');
  });
});

// ─── resolveAll ───

describe('resolveAll', () => {
  it('merges all layers', () => {
    const ctx = createCtx({ suiteVars: { a: 'suite' }, envVars: { b: 'env' } });
    ctx.setRuntimeVar('c', 'case', 'CASE');
    expect(ctx.resolveAll()).toEqual({ a: 'suite', b: 'env', c: 'case' });
  });

  it('higher priority overwrites lower', () => {
    const ctx = createCtx({ suiteVars: { key: 'suite' } });
    ctx.setRuntimeVar('key', 'case', 'CASE');
    expect(ctx.resolveAll()).toEqual({ key: 'case' });
  });
});

// ─── setRuntimeVar ───

describe('setRuntimeVar', () => {
  it('sets CASE-scoped variable', () => {
    const ctx = createCtx({});
    ctx.setCurrentContext(null, null, 'MyCase');
    ctx.setRuntimeVar('token', 'abc', 'CASE');
    expect(ctx.resolve('token')).toBe('abc');
    expect(ctx.resolve('mycase.token')).toBe('abc');
  });

  it('sets SUITE-scoped variable', () => {
    const ctx = createCtx({});
    ctx.setCurrentContext(null, 'MySuite', null);
    ctx.setRuntimeVar('token', 'abc', 'SUITE');
    expect(ctx.resolve('token')).toBe('abc');
    expect(ctx.resolve('mysuite.token')).toBe('abc');
  });

  it('sets SCENARIO-scoped variable', () => {
    const ctx = createCtx({});
    ctx.setCurrentContext('MyScenario', null, null);
    ctx.setRuntimeVar('token', 'abc', 'SCENARIO');
    expect(ctx.resolve('token')).toBe('abc');
    expect(ctx.resolve('myscenario.token')).toBe('abc');
  });

  it('ENVIRONMENT-scoped variable has no prefix', () => {
    const ctx = createCtx({});
    ctx.setRuntimeVar('key', 'val', 'ENVIRONMENT');
    expect(ctx.resolve('key')).toBe('val');
  });

  it('triggers onVariableSet callback', () => {
    const ctx = createCtx({});
    const calls: string[] = [];
    ctx.onVariableSet((key, value, scope) => { calls.push(`${key}=${value}(${scope})`); });
    ctx.setRuntimeVar('x', '1', 'CASE');
    expect(calls).toEqual(['x=1(CASE)']);
    ctx.removeOnVariableSet();
  });
});

// ─── Scoping: clearCaseVars / clearSuiteVars / clearScenarioVars ───

describe('scope cleanup', () => {
  it('clearCaseVars removes case-scoped vars', () => {
    const ctx = createCtx({});
    ctx.setRuntimeVar('token', 'abc', 'CASE');
    ctx.clearCaseVars();
    expect(ctx.resolve('token')).toBeUndefined();
  });

  it('clearSuiteVars removes suite-scoped vars', () => {
    const ctx = createCtx({});
    ctx.setRuntimeVar('token', 'abc', 'SUITE');
    ctx.clearSuiteVars();
    expect(ctx.resolve('token')).toBeUndefined();
  });

  it('clearScenarioVars removes scenario-scoped vars', () => {
    const ctx = createCtx({});
    ctx.setRuntimeVar('token', 'abc', 'SCENARIO');
    ctx.clearScenarioVars();
    expect(ctx.resolve('token')).toBeUndefined();
  });
});

// ─── Child Context (RUN_MODULE) ───

describe('child context (RUN_MODULE)', () => {
  it('child inherits global layers only', () => {
    const ctx = createCtx({ envVars: { env: 'prod' }, suiteVars: { suite: 's1' } });
    ctx.setRuntimeVar('extracted', 'val', 'SUITE');
    const child = ctx.createChildContext({ modParam: 'default' }, { callerVar: 'override' });
    // Child should see env and runtime_suite
    expect(child.resolve('env')).toBe('prod');
    expect(child.resolve('extracted')).toBe('val');
    // Child should NOT see suite static vars (sandboxed)
    expect(child.resolve('suite')).toBeUndefined();
    // Child has module defaults and caller overrides
    expect(child.resolve('modParam')).toBe('default');
    expect(child.resolve('callerVar')).toBe('override');
  });

  it('caller override beats module default', () => {
    const ctx = createCtx({});
    const child = ctx.createChildContext({ key: 'default' }, { key: 'override' });
    expect(child.resolve('key')).toBe('override');
  });

  it('mergeChildExtractedVars copies vars back', () => {
    const ctx = createCtx({});
    ctx.setCurrentContext('Scenario', 'Suite', 'Case');
    const child = ctx.createChildContext({}, {});
    child.setRuntimeVar('extracted', 'val', 'CASE');
    ctx.mergeChildExtractedVars(child);
    expect(ctx.resolve('extracted')).toBe('val');
  });

  it('mergeChildExtractedVars applies namespace prefix', () => {
    const ctx = createCtx({});
    ctx.setCurrentContext('Scenario', 'Suite', 'Case');
    const child = ctx.createChildContext({}, {});
    child.setRuntimeVar('token', 'abc', 'CASE');
    ctx.mergeChildExtractedVars(child, 'ns1');
    expect(ctx.resolve('token')).toBe('abc');
    expect(ctx.resolve('ns1.token')).toBe('abc');
  });
});

// ─── Shared Runtime Vars (cross-suite in scenario) ───

describe('shared runtime vars', () => {
  it('setSharedRuntimeVars injects into RUNTIME_SUITE layer', () => {
    const ctx = createCtx({});
    ctx.setSharedRuntimeVars({ sharedKey: 'sharedVal' });
    expect(ctx.resolve('sharedKey')).toBe('sharedVal');
  });
});

// ─── Dynamic Variable Caches ───

describe('dynamic variable caches', () => {
  it('set and get dynamic variable caches', () => {
    const ctx = createCtx({});
    ctx.setDynamicVariableCaches({ cachedKey: 'cachedVal' });
    expect(ctx.getDynamicVariableCaches()).toEqual({ cachedKey: 'cachedVal' });
  });
});

// ─── onVariableSet callback cleanup ───

describe('onVariableSet', () => {
  it('removeOnVariableSet stops the callback', () => {
    const ctx = createCtx({});
    let called = false;
    ctx.onVariableSet(() => { called = true; });
    ctx.removeOnVariableSet();
    ctx.setRuntimeVar('x', '1', 'CASE');
    expect(called).toBe(false);
  });
});
