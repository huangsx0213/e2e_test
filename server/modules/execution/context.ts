import { interpolate } from './interpolator.ts';

/**
 * ExecutionContext manages layered variable scopes for test execution.
 *
 * Priority (low → high):
 *  1. Suite Variables (defaults)
 *  2. Scenario Overrides
 *  3. Data Row Values
 *  4. Runtime Variables (EXTRACT_VAR etc.)
 *
 * Child contexts (for RUN_MODULE) inherit parent variables
 * and add module param defaults + overrides on top.
 */
export class ExecutionContext {
  private layers: Record<string, string>[];
  private runtimeVars: Record<string, string>;

  constructor(layers: Record<string, string>[] = []) {
    this.layers = layers;
    this.runtimeVars = {};
  }

  /**
   * Create context from typical execution scenario inputs.
   */
  static create(options: {
    suiteVariables?: Record<string, string>;
    scenarioOverrides?: Record<string, string>;
    dataRowValues?: Record<string, string>;
  }): ExecutionContext {
    const layers: Record<string, string>[] = [];
    if (options.suiteVariables) layers.push(options.suiteVariables);
    if (options.scenarioOverrides) layers.push(options.scenarioOverrides);
    if (options.dataRowValues) layers.push(options.dataRowValues);
    return new ExecutionContext(layers);
  }

  /**
   * Merge all layers (in priority order) into a single flat record.
   * Runtime vars have the highest priority.
   */
  resolveAll(): Record<string, string> {
    const merged: Record<string, string> = {};
    for (const layer of this.layers) {
      Object.assign(merged, layer);
    }
    Object.assign(merged, this.runtimeVars);
    return merged;
  }

  /**
   * Resolve a single variable key.
   */
  resolve(key: string): string | undefined {
    // Check runtime first  (highest priority)
    if (this.runtimeVars[key] !== undefined) return this.runtimeVars[key];
    // Walk layers in reverse (later layers have higher priority)
    for (let i = this.layers.length - 1; i >= 0; i--) {
      if (this.layers[i][key] !== undefined) return this.layers[i][key];
    }
    return undefined;
  }

  /**
   * Set a runtime variable (from EXTRACT_VAR, API response capture, etc.)
   */
  setRuntimeVar(key: string, value: string): void {
    this.runtimeVars[key] = value;
  }

  /**
   * Interpolate a template string using all resolved variables.
   */
  interpolate(template: string): string {
    return interpolate(template, this.resolveAll());
  }

  /**
   * Create a child context for RUN_MODULE execution.
   * The child inherits all parent variables, then layers module param defaults
   * and caller-provided overrides on top.
   */
  createChildContext(
    moduleParamDefaults: Record<string, string>,
    callerOverrides: Record<string, string>,
  ): ExecutionContext {
    // Resolve caller overrides through parent context
    // E.g. override { "USER": "{{GLOBAL_USER}}" } should resolve GLOBAL_USER from parent
    const parentVars = this.resolveAll();
    const resolvedOverrides: Record<string, string> = {};
    for (const [k, v] of Object.entries(callerOverrides)) {
      resolvedOverrides[k] = interpolate(v, parentVars);
    }

    const childLayers = [
      parentVars,             // all parent variables (flattened)
      moduleParamDefaults,    // module's own param defaults
      resolvedOverrides,      // caller provided values (highest priority)
    ];

    return new ExecutionContext(childLayers);
  }
}
