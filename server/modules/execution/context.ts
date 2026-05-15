import { interpolate } from './interpolator.ts';
import type { DynamicVariable, LayerName } from '../../shared/contracts/index.ts';

export const LAYER_PRIORITY: LayerName[] = [
  'DYNAMIC',
  'ENVIRONMENT',
  'RUNTIME_ENVIRONMENT',
  'SUITE',
  'SUITE_DATA',
  'RUNTIME_SUITE',
  'MODULE_DEFAULT',
  'SCENARIO',
  'SCENARIO_DATA',
  'RUNTIME_SCENARIO',
  'OVERRIDE',
  'CALLER_OVERRIDE',
  'CASE'
];

/**
 * ExecutionContext manages layered variable scopes for test execution.
 *
 * Priority (low → high):
 *  1. DYNAMIC (Project global dynamic variables)
 *  2. ENVIRONMENT (Environment variables like PROD/DEV)
 *  3. RUNTIME_ENVIRONMENT (Extracted at runtime with ENV scope)
 *  4. SUITE (Suite static defaults)
 *  5. SUITE_DATA (Suite data-driven row)
 *  6. RUNTIME_SUITE (Extracted at runtime with SUITE scope)
 *  7. MODULE_DEFAULT (Module default parameters)
 *  8. SCENARIO (Scenario static defaults)
 *  9. SCENARIO_DATA (Scenario data-driven row)
 * 10. RUNTIME_SCENARIO (Extracted at runtime with SCENARIO scope)
 * 11. OVERRIDE (Manual execution overrides)
 * 12. CALLER_OVERRIDE (Module caller explicit parameters)
 * 13. CASE (Extracted at runtime with CASE scope - Highest)
 *
 * Child contexts (for RUN_MODULE) are sandboxed: they only inherit global layers
 * (DYNAMIC, ENVIRONMENT, RUNTIME_ENVIRONMENT, RUNTIME_SUITE, RUNTIME_SCENARIO) and add module-specific layers.
 */
export class ExecutionContext {
  private layers: Record<LayerName, Record<string, string>>;
  private namespaces: Record<string, Record<string, string>>;
  private dynamicVariableConfigs: Record<string, DynamicVariable> = {};
  private dynamicVariableCaches: Record<string, string> = {};
  private currentScenarioName: string | null = null;
  private currentSuiteName: string | null = null;
  private currentCaseName: string | null = null;
  private currentStepId: string | null = null;
  private onVariableSetCallback?: (key: string, value: string, scope: string) => void;

  constructor() {
    this.layers = {} as Record<LayerName, Record<string, string>>;
    for (const layer of LAYER_PRIORITY) {
      this.layers[layer] = {};
    }
    this.namespaces = {};
  }

  /**
   * Register a callback to be notified when a variable is set.
   */
  onVariableSet(callback: (key: string, value: string, scope: string) => void): void {
    this.onVariableSetCallback = callback;
  }

  removeOnVariableSet(): void {
    this.onVariableSetCallback = undefined;
  }

  /**
   * Set the current scenario, suite and case names for namespacing.
   */
  setCurrentContext(scenarioName: string | null, suiteName: string | null, caseName: string | null): void {
    this.currentScenarioName = scenarioName;
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
    this.layers['RUNTIME_SUITE'] = { ...this.layers['RUNTIME_SUITE'], ...sharedVars };
  }

  /**
   * Get all current dynamic variable caches.
   */
  getDynamicVariableCaches(): Record<string, string> {
    return { ...this.dynamicVariableCaches };
  }

  /**
   * Inject dynamic variable caches.
   */
  setDynamicVariableCaches(caches: Record<string, string>): void {
    this.dynamicVariableCaches = { ...this.dynamicVariableCaches, ...caches };
  }

  /**
   * Clear case-scoped variables and caches. Call this after each case finishes.
   */
  clearCaseVars(): void {
    this.layers['CASE'] = {};
    // Clear ONCE_PER_CASE caches
    for (const [name, config] of Object.entries(this.dynamicVariableConfigs)) {
      if (config.evaluationStrategy === 'ONCE_PER_CASE') {
        delete this.dynamicVariableCaches[name];
      }
    }
  }

  /**
   * Clear suite-scoped variables and caches. Call this after each suite finishes.
   */
  clearSuiteVars(): void {
    this.layers['RUNTIME_SUITE'] = {};
    // Clear ONCE_PER_SUITE caches
    for (const [name, config] of Object.entries(this.dynamicVariableConfigs)) {
      if (config.evaluationStrategy === 'ONCE_PER_SUITE') {
        delete this.dynamicVariableCaches[name];
      }
    }
  }

  /**
   * Clear scenario-scoped variables and caches. Call this after each scenario finishes.
   */
  clearScenarioVars(): void {
    this.layers['RUNTIME_SCENARIO'] = {};
    // Clear ONCE_PER_SCENARIO caches
    for (const [name, config] of Object.entries(this.dynamicVariableConfigs)) {
      if (config.evaluationStrategy === 'ONCE_PER_SCENARIO') {
        delete this.dynamicVariableCaches[name];
      }
    }
  }

  /**
   * Create context from typical execution scenario inputs.
   */
  static create(options: {
    environmentVariables?: Record<string, string>;
    dynamicVariables?: Record<string, string>;
    dynamicVariableConfigs?: Record<string, DynamicVariable>;
    suiteVariables?: Record<string, string>;
    suiteDataRow?: Record<string, string>;
    scenarioVariables?: Record<string, string>;
    scenarioDataRow?: Record<string, string>;
    scenarioOverrides?: Record<string, string>;
  }): ExecutionContext {
    const ctx = new ExecutionContext();
    if (options.dynamicVariableConfigs) ctx.dynamicVariableConfigs = { ...options.dynamicVariableConfigs };
    if (options.dynamicVariables) ctx.layers['DYNAMIC'] = { ...options.dynamicVariables };
    if (options.environmentVariables) ctx.layers['ENVIRONMENT'] = { ...options.environmentVariables };
    if (options.suiteVariables) ctx.layers['SUITE'] = { ...options.suiteVariables };
    if (options.suiteDataRow) ctx.layers['SUITE_DATA'] = { ...options.suiteDataRow };
    if (options.scenarioVariables) ctx.layers['SCENARIO'] = { ...options.scenarioVariables };
    if (options.scenarioDataRow) ctx.layers['SCENARIO_DATA'] = { ...options.scenarioDataRow };
    if (options.scenarioOverrides) {
      ctx.layers['OVERRIDE'] = Object.fromEntries(
        Object.entries(options.scenarioOverrides).filter(([_, v]) => v !== '')
      );
    }
    return ctx;
  }

  /**
   * Merge all layers (in priority order) into a single flat record.
   */
  resolveAll(): Record<string, string> {
    const merged: Record<string, string> = {};
    for (const layerName of LAYER_PRIORITY) {
      for (const [k, v] of Object.entries(this.layers[layerName])) {
        // If it's a dynamic variable and we have a cached value, use it
        if (layerName === 'DYNAMIC' && this.dynamicVariableCaches[k] !== undefined) {
          merged[k] = this.dynamicVariableCaches[k];
        } else {
          merged[k] = v;
        }
      }
    }

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
    for (const layerName of LAYER_PRIORITY) {
      for (const [k, v] of Object.entries(this.layers[layerName])) {
        // If it's a dynamic variable and we have a cached value, use it
        if (layerName === 'DYNAMIC' && this.dynamicVariableCaches[k] !== undefined) {
          detailed[k] = { value: this.dynamicVariableCaches[k], source: layerName };
        } else {
          detailed[k] = { value: interpolate(v, allVars), source: layerName };
        }
      }
    }

    return detailed;
  }

  /**
   * Resolve a single variable key.
   */
  resolve(key: string): string | undefined {
    // Walk layers in reverse (later layers have higher priority)
    for (let i = LAYER_PRIORITY.length - 1; i >= 0; i--) {
      const layerName = LAYER_PRIORITY[i];
      const value = this.layers[layerName][key];
      
      if (value !== undefined) {
        // Special handling for DYNAMIC layer with scoped caching
        if (layerName === 'DYNAMIC' && this.dynamicVariableConfigs[key]) {
          const config = this.dynamicVariableConfigs[key];
          const strategy = config.evaluationStrategy;

          if (strategy === 'EVERY_TIME' || strategy === 'ONCE_PER_RUN') {
            return value;
          }

          // Check cache for scoped strategies
          if (this.dynamicVariableCaches[key] !== undefined) {
            return this.dynamicVariableCaches[key];
          }

          // Not in cache, resolve it now
          // We use a temporary flat map to avoid infinite recursion during interpolation
          const flatVars = this.resolveAll();
          const resolved = interpolate(value, flatVars);
          this.dynamicVariableCaches[key] = resolved;
          return resolved;
        }
        
        return value;
      }
    }
    return undefined;
  }

  /**
   * Formats a name into a namespace prefix (lowercase, spaces to underscores).
   */
  private formatNamespace(name: string): string {
    return name.replace(/\s+/g, '_').toLowerCase();
  }

  /**
   * 动态变量固化与命名空间自动前缀核心逻辑 (Set Runtime Variable & Auto-Prefixing)
   *
   * 解决的问题：
   * 1. 动态变量（如 {{$uuid()}}）默认每次求值都会生成新值。通过此方法将其“固化”到指定层级，实现复用。
   * 2. 自动命名空间前缀：为了避免不同 Case/Suite 提取的变量同名冲突，系统会自动根据其所在的层级
   *    （Scenario / Suite / Case）附加对应的名称前缀。
   *
   * @param key 变量名 (Variable Name)
   * @param value 固化后的值 (Resolved Value)
   * @param scope 作用域 (Scope: CASE, SUITE, SCENARIO, ENVIRONMENT)。默认是 CASE。
   * @param explicitNamespace 显式命名空间 (Explicit Namespace)。主要用于 RUN_MODULE 导出变量时指定别名。
   */
  setRuntimeVar(key: string, value: string, scope: 'CASE' | 'SUITE' | 'SCENARIO' | 'ENVIRONMENT' = 'CASE', explicitNamespace?: string): void {
    // 1. 确定前缀 (Determine Prefix)
    // 如果提供了显式命名空间（例如模块导出别名），则优先使用。
    // 否则，在后续逻辑中根据当前上下文的名称（Case名、Suite名、Scenario名）自动推断。
    let prefix = explicitNamespace ? this.formatNamespace(explicitNamespace) : null;

    if (scope === 'CASE') {
      // 存入当前 Case 运行时上下文
      this.layers['CASE'][key] = value;
      // 自动追加 Case 级前缀 (例如：credit_card.req_id)
      if (!prefix && this.currentCaseName) prefix = this.formatNamespace(this.currentCaseName);
      if (prefix) this.layers['CASE'][`${prefix}.${key}`] = value;
    } else if (scope === 'SUITE') {
      // 存入当前 Suite 运行时上下文
      this.layers['RUNTIME_SUITE'][key] = value;
      // 自动追加 Suite 级前缀 (例如：payment.batch_time)
      if (!prefix && this.currentSuiteName) prefix = this.formatNamespace(this.currentSuiteName);
      if (prefix) this.layers['RUNTIME_SUITE'][`${prefix}.${key}`] = value;
    } else if (scope === 'SCENARIO') {
      // 存入当前 Scenario 运行时上下文
      this.layers['RUNTIME_SCENARIO'][key] = value;
      // 自动追加 Scenario 级前缀 (例如：order_flow.session_token)
      if (!prefix && this.currentScenarioName) prefix = this.formatNamespace(this.currentScenarioName);
      if (prefix) this.layers['RUNTIME_SCENARIO'][`${prefix}.${key}`] = value;
    } else if (scope === 'ENVIRONMENT') {
      // 环境变量不加前缀，直接全局生效
      this.layers['RUNTIME_ENVIRONMENT'][key] = value;
    }

    // 触发变量设置回调 (Trigger callback for UI/Logging)
    if (this.onVariableSetCallback) {
      this.onVariableSetCallback(key, value, scope);
    }
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
   * The child inherits ONLY global variables (Sandboxing), then layers module param defaults
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

    const childContext = new ExecutionContext();

    // Strict Scoping: Only inherit global layers to enforce module sandboxing
    childContext.layers['DYNAMIC'] = { ...this.layers['DYNAMIC'] };
    childContext.layers['ENVIRONMENT'] = { ...this.layers['ENVIRONMENT'] };
    childContext.layers['RUNTIME_ENVIRONMENT'] = { ...this.layers['RUNTIME_ENVIRONMENT'] };
    childContext.layers['RUNTIME_SUITE'] = { ...this.layers['RUNTIME_SUITE'] };
    childContext.layers['RUNTIME_SCENARIO'] = { ...this.layers['RUNTIME_SCENARIO'] };

    // Set module-specific layers
    childContext.layers['MODULE_DEFAULT'] = { ...moduleParamDefaults };
    childContext.layers['CALLER_OVERRIDE'] = resolvedOverrides;

    // Inherit namespaces (useful for global suite vars)
    childContext.namespaces = JSON.parse(JSON.stringify(this.namespaces));

    childContext.setCurrentContext(this.currentScenarioName, this.currentSuiteName, this.currentCaseName);
    childContext.setCurrentStep(this.currentStepId);
    if (this.onVariableSetCallback) {
      childContext.onVariableSet(this.onVariableSetCallback);
    }
    return childContext;
  }

  /**
   * 模块调用的显式命名空间合并 (Merge Child Extracted Vars)
   *
   * 解决的问题：
   * 当用户拖拽一个 RUN_MODULE 步骤时，前端 UI 提供一个 "Namespace (导出别名)" 字段。
   * 该模块内提取的变量，返回父级时自动变为 `namespace.变量名`，从而解决模块复用时的变量冲突。
   *
   * @param childContext 子模块的执行上下文
   * @param namespace 显式指定的命名空间别名
   */
  mergeChildExtractedVars(childContext: ExecutionContext, namespace?: string): void {
    const prefix = namespace ? this.formatNamespace(namespace) : null;

    const mergeLayer = (layerName: LayerName, targetScope: 'CASE' | 'SUITE' | 'SCENARIO') => {
      for (const [k, v] of Object.entries(childContext.layers[layerName])) {
        // 如果提供了显式命名空间，我们将子模块中提取的变量加上该前缀。
        // 注意：只对基础变量（不包含 '.' 的变量）加前缀，避免对子模块内部已经加过前缀的变量重复加前缀。
        if (prefix) {
          if (!k.includes('.')) {
            this.setRuntimeVar(k, v, targetScope, namespace);
          }
        } else {
          // 如果没有显式命名空间，直接合并（保留子模块内部的自动前缀）
          this.layers[layerName][k] = v;
        }
      }
    };

    mergeLayer('CASE', 'CASE');
    mergeLayer('RUNTIME_SUITE', 'SUITE');
    mergeLayer('RUNTIME_SCENARIO', 'SCENARIO');
  }
}
