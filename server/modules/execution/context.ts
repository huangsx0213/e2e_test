import { interpolate } from './interpolator.ts';

/**
 * ExecutionContext manages layered variable scopes for test execution.
 *
 * Priority (low → high):
 *  1. Global Settings (TBD)
 *  2. Environment Variables (TBD)
 *  3. Suite Variables (defaults)
 *  4. Suite Data Row
 *  5. Scenario Variables
 *  6. Scenario Data Row
 *  7. Scenario Overrides
 *  8. Runtime Variables (EXTRACT_VAR etc.)
 *
 * Child contexts (for RUN_MODULE) inherit parent variables
 * and add module param defaults + overrides on top.
 */
export class ExecutionContext {
  private layers: { name: string; data: Record<string, string> }[];
  private runtimeVars: Record<string, { value: string; source: string }>;
  private caseVars: Record<string, string>;
  private namespaces: Record<string, Record<string, string>>;
  private currentSuiteName: string | null = null;
  private currentCaseName: string | null = null;
  private currentStepId: string | null = null;
  private onVariableSetCallback?: (key: string, value: string, scope: string) => void;

  constructor(layers: { name: string; data: Record<string, string> }[] = []) {
    this.layers = layers;
    this.runtimeVars = {};
    this.caseVars = {};
    this.namespaces = {};
  }

  /**
   * Register a callback to be notified when a variable is set.
   */
  onVariableSet(callback: (key: string, value: string, scope: string) => void): void {
    this.onVariableSetCallback = callback;
  }

  /**
   * Set the current suite and case names for namespacing.
   */
  setCurrentContext(suiteName: string | null, caseName: string | null): void {
    this.currentSuiteName = suiteName;
    this.currentCaseName = caseName;
  }

  /**
   * Set the current step ID for logging.
   */
  setCurrentStep(stepId: string | null): void {
    this.currentStepId = stepId;
  }

  /**
   * Get the current step ID.
   */
  getCurrentStep(): string | null {
    return this.currentStepId;
  }

  /**
   * Inject a shared runtime variables object (useful for cross-suite sharing in scenarios)
   */
  setSharedRuntimeVars(sharedVars: Record<string, string>) {
    // Convert flat record to structured record with RUNTIME source
    this.runtimeVars = Object.fromEntries(
      Object.entries(sharedVars).map(([k, v]) => [k, { value: v, source: 'RUNTIME' }])
    );
  }

  /**
   * Clear case-scoped variables. Call this after each case finishes.
   */
  clearCaseVars(): void {
    this.caseVars = {};
  }

  /**
   * Create context from typical execution scenario inputs.
   */
  static create(options: {
    environmentVariables?: Record<string, string>;
    dynamicVariables?: Record<string, string>;
    suiteVariables?: Record<string, string>;
    suiteDataRow?: Record<string, string>;
    scenarioVariables?: Record<string, string>;
    scenarioDataRow?: Record<string, string>;
    scenarioOverrides?: Record<string, string>;
  }): ExecutionContext {
    const layers: { name: string; data: Record<string, string> }[] = [];
    if (options.environmentVariables) layers.push({ name: 'ENVIRONMENT', data: options.environmentVariables });
    if (options.dynamicVariables) layers.push({ name: 'DYNAMIC', data: options.dynamicVariables });
    if (options.suiteVariables) layers.push({ name: 'SUITE', data: options.suiteVariables });
    if (options.suiteDataRow) layers.push({ name: 'SUITE_DATA', data: options.suiteDataRow });
    if (options.scenarioVariables) layers.push({ name: 'SCENARIO', data: options.scenarioVariables });
    if (options.scenarioDataRow) layers.push({ name: 'SCENARIO_DATA', data: options.scenarioDataRow });
    if (options.scenarioOverrides) {
      // Filter out empty strings so they fall back to previous layers
      const filteredOverrides = Object.fromEntries(
        Object.entries(options.scenarioOverrides).filter(([_, v]) => v !== '')
      );
      layers.push({ name: 'OVERRIDE', data: filteredOverrides });
    }
    return new ExecutionContext(layers);
  }

  /**
   * Merge all layers (in priority order) into a single flat record.
   * Runtime vars have the highest priority.
   */
  resolveAll(): Record<string, string> {
    const merged: Record<string, string> = {};
    for (const layer of this.layers) {
      Object.assign(merged, layer.data);
    }
    for (const [k, v] of Object.entries(this.runtimeVars)) {
      merged[k] = v.value;
    }
    Object.assign(merged, this.caseVars);

    // Add namespaced variables to the flat record
    for (const [ns, vars] of Object.entries(this.namespaces)) {
      for (const [k, v] of Object.entries(vars)) {
        merged[`${ns}.${k}`] = v;
      }
    }

    return merged;
  }

  /**
   * Returns a detailed map of variables with their source information.
   * Values are interpolated to show their resolved state.
   */
  resolveDetailed(): Record<string, { value: string; source: string }> {
    const detailed: Record<string, { value: string; source: string }> = {};
    const allVars = this.resolveAll();

    // Process layers in order (later layers overwrite earlier ones)
    for (const layer of this.layers) {
      for (const [k, v] of Object.entries(layer.data)) {
        detailed[k] = { value: interpolate(v, allVars), source: layer.name };
      }
    }

    // Runtime variables
    for (const [k, v] of Object.entries(this.runtimeVars)) {
      detailed[k] = { value: interpolate(v.value, allVars), source: v.source };
    }

    // Case variables
    for (const [k, v] of Object.entries(this.caseVars)) {
      detailed[k] = { value: interpolate(v, allVars), source: 'CASE' };
    }

    return detailed;
  }

  /**
   * Resolve a single variable key.
   */
  resolve(key: string): string | undefined {
    // Check case vars first
    if (this.caseVars[key] !== undefined) return this.caseVars[key];
    // Check runtime first  (highest priority)
    if (this.runtimeVars[key] !== undefined) return this.runtimeVars[key].value;
    // Walk layers in reverse (later layers have higher priority)
    for (let i = this.layers.length - 1; i >= 0; i--) {
      if (this.layers[i].data[key] !== undefined) return this.layers[i].data[key];
    }
    return undefined;
  }

  /**
   * Set a runtime variable (from EXTRACT_VAR, API response capture, etc.)
   */
  setRuntimeVar(key: string, value: string, scope: 'CASE' | 'SUITE' | 'ENVIRONMENT' = 'SUITE'): void {
    if (scope === 'CASE') {
      this.caseVars[key] = value;
      if (this.currentCaseName) {
        this.setNamespaceVar(this.currentCaseName, key, value);
      }
    } else {
      this.runtimeVars[key] = { value, source: `RUNTIME_${scope}` };
      if (scope === 'SUITE' && this.currentSuiteName) {
        this.setNamespaceVar(this.currentSuiteName, key, value);
      }
    }

    // Trigger callback if registered
    if (this.onVariableSetCallback) {
      this.onVariableSetCallback(key, value, scope);
    }
  }

  /**
   * Set a variable within a specific namespace.
   */
  private setNamespaceVar(namespace: string, key: string, value: string): void {
    const ns = namespace.replace(/\s+/g, '_').toLowerCase();
    if (!this.namespaces[ns]) {
      this.namespaces[ns] = {};
    }
    this.namespaces[ns][key] = value;
  }

  /**
   * Interpolate a template string using all resolved variables.
   */
  interpolate(template: string): string {
    return interpolate(template, this.resolveAll(), (key, value, scope) => {
      this.setRuntimeVar(key, value, scope as any);
    });
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
    const parentVars = this.resolveAll();
    const resolvedOverrides: Record<string, string> = {};
    for (const [k, v] of Object.entries(callerOverrides)) {
      if (v !== '') {
        resolvedOverrides[k] = interpolate(v, parentVars, (key, value, scope) => {
          this.setRuntimeVar(key, value, scope as any);
        });
      }
    }

    const childLayers = [
      { name: 'PARENT', data: parentVars },             // all parent variables (flattened)
      { name: 'MODULE_DEFAULT', data: moduleParamDefaults },    // module's own param defaults
      { name: 'CALLER_OVERRIDE', data: resolvedOverrides },      // caller provided values (highest priority)
    ];

    const childContext = new ExecutionContext(childLayers);
    childContext.setCurrentContext(this.currentSuiteName, this.currentCaseName);
    childContext.setCurrentStep(this.currentStepId);
    if (this.onVariableSetCallback) {
      childContext.onVariableSet(this.onVariableSetCallback);
    }
    return childContext;
  }
}
