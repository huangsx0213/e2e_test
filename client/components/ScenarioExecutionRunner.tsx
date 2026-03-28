import React, { useEffect, useState, useRef } from "react";
import {
  TestSuite,
  TestCase,
  ExecutionLog,
  TestStep,
  Project,
  HeaderProfile,
  BodyTemplate,
  ApiEndpoint,
  TestScenario,
} from "../types";
import {
  CheckCircle2,
  XCircle,
  Loader2,
  PlayCircle,
  Terminal,
  Clock,
  X,
  Globe,
  Layers,
} from "lucide-react";

interface ScenarioExecutionRunnerProps {
  scenario: TestScenario;
  suites: TestSuite[];
  project?: Project;
  headers: HeaderProfile[];
  bodies: BodyTemplate[];
  endpoints: ApiEndpoint[];
  environments: string[];
  initialEnvironment: string;
  onClose: () => void;
  reportsApi: any;
}

export const ScenarioExecutionRunner: React.FC<
  ScenarioExecutionRunnerProps
> = ({
  scenario,
  suites,
  project,
  headers,
  bodies,
  endpoints,
  environments,
  initialEnvironment,
  onClose,
  reportsApi,
}) => {
  const [logs, setLogs] = useState<ExecutionLog[]>([]);
  const logsRef = useRef<ExecutionLog[]>([]);
  const [status, setStatus] = useState<
    "IDLE" | "RUNNING" | "COMPLETED" | "FAILED"
  >("IDLE");
  const [progress, setProgress] = useState(0);
  const [selectedEnv, setSelectedEnv] = useState<string>(initialEnvironment);
  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  const addLog = (log: ExecutionLog) => {
    setLogs((prev) => {
      const newLogs = [...prev, log];
      logsRef.current = newLogs;
      return newLogs;
    });
  };

  const interpolate = (str: string, vars: Record<string, string>) => {
    if (!str) return "";
    return str.replace(/\$\{(\w+)\}/g, (_, key) => vars[key] || `\${${key}}`);
  };

  const executeStepsRecursive = async (
    steps: TestStep[],
    context: Record<string, string>,
    depth: number = 0,
  ): Promise<void> => {
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];

      if (step.action === "RUN_MODULE") {
        const moduleId = step.target;
        const module = project?.modules.find((m) => m.id === moduleId);

        if (!module) {
          addLog({
            stepId: step.id,
            timestamp: Date.now(),
            status: "FAIL",
            message: `❌ Module Not Found: ${moduleId}`,
          });
          throw new Error(`Module ${moduleId} not found`);
        }

        addLog({
          stepId: step.id,
          timestamp: Date.now(),
          status: "RUNNING",
          message: `${"  ".repeat(depth)}📦 Executing Module: ${module.name}`,
        });

        const moduleDefaults: Record<string, string> = {};
        if (module.params) {
          module.params.forEach((p) => {
            moduleDefaults[p.name] = p.defaultValue || "";
          });
        }

        let overrides = {};
        try {
          if (step.data) overrides = JSON.parse(step.data);
        } catch (e) {
          console.warn("Invalid JSON in module data overrides");
        }

        const moduleContext = {
          ...context,
          ...moduleDefaults,
          ...overrides,
        };

        Object.keys(moduleContext).forEach((k) => {
          moduleContext[k] = interpolate(moduleContext[k], context);
        });

        await executeStepsRecursive(module.steps, moduleContext, depth + 1);

        addLog({
          stepId: step.id,
          timestamp: Date.now(),
          status: "PASS",
          message: `${"  ".repeat(depth)}✅ Module Completed: ${module.name}`,
        });
        continue;
      }

      let resolvedTarget = interpolate(step.target, context);
      let resolvedData = interpolate(step.data, context);

      // Resolve PageName.ElementName or PageName/ElementName for UI steps
      if (project && resolvedTarget && !step.action.startsWith('API_') && !['OPEN', 'WAIT', 'RUN_MODULE'].includes(step.action)) {
          const separator = resolvedTarget.includes('.') ? '.' : (resolvedTarget.includes('/') ? '/' : null);
          if (separator) {
              const parts = resolvedTarget.split(separator);
              if (parts.length === 2) {
                  const [pageName, elementName] = parts;
                  const page = project.pages.find(p => p.name === pageName);
                  if (page) {
                      const element = page.elements.find(e => e.name === elementName);
                      if (element) {
                          resolvedTarget = element.value;
                      }
                  }
              }
          }
      }

      if (step.action.startsWith("API_")) {
        let apiVars: Record<string, string> = {};
        const isVariableMode = step.headerProfileId || step.bodyTemplateId || step.endpointId;

        if (isVariableMode) {
          try {
            apiVars = JSON.parse(resolvedData || "{}");
          } catch (e) {}
        }

        if (step.endpointId) {
          const endpoint = endpoints.find((e) => e.id === step.endpointId);
          if (endpoint) {
            const baseUrl = endpoint.baseUrls[selectedEnv] || "";
            const cleanBase = baseUrl.replace(/\/$/, "");
            const cleanPath = resolvedTarget.replace(/^\//, "");
            resolvedTarget = `${cleanBase}/${cleanPath}`;

            // Append URL Parameters
            if (endpoint.parameters && endpoint.parameters.length > 0) {
                const params = new URLSearchParams();
                endpoint.parameters.forEach(p => {
                    if (!p.enabled) return;
                    let val = p.value;
                    const matches = val.match(/\{\{([^}]+)\}\}|\{([^}]+)\}/g);
                    if (matches) {
                        matches.forEach(m => {
                            const key = m.replace(/\{\{|\}\}|\{|\}/g, '');
                            val = val.replaceAll(m, apiVars[key] !== undefined ? apiVars[key] : interpolate(`\${${key}}`, context));
                        });
                    }
                    params.append(p.key, val);
                });
                const queryString = params.toString();
                if (queryString) {
                    resolvedTarget += resolvedTarget.includes('?') ? `&${queryString}` : `?${queryString}`;
                }
            }

            addLog({
              stepId: step.id,
              timestamp: Date.now(),
              status: "RUNNING",
              message: `${"  ".repeat(depth)}🌐 Endpoint (${selectedEnv}): ${endpoint.name} -> ${resolvedTarget}`,
            });
          }
        }

        // Interpolate URL variables in the resolvedTarget (path and base URL)
        const urlMatches = resolvedTarget.match(/\{\{([^}]+)\}\}|\{([^}]+)\}/g);
        if (urlMatches) {
            urlMatches.forEach(m => {
                const key = m.replace(/\{\{|\}\}|\{|\}/g, '');
                resolvedTarget = resolvedTarget.replaceAll(m, apiVars[key] !== undefined ? apiVars[key] : interpolate(`\${${key}}`, context));
            });
        }

        if (step.headerProfileId) {
          const profile = headers.find((h) => h.id === step.headerProfileId);
          if (profile) {
            const resolvedHeaders = profile.headers.map((h) => {
              let val = h.value;
              const matches = val.match(/\{\{([^}]+)\}\}|\{([^}]+)\}/g);
              if (matches) {
                matches.forEach(m => {
                  const key = m.replace(/\{\{|\}\}|\{|\}/g, '');
                  val = val.replaceAll(m, apiVars[key] || '');
                });
              }
              return { key: h.key, value: val };
            });

            addLog({
              stepId: step.id,
              timestamp: Date.now(),
              status: "RUNNING",
              message: `${"  ".repeat(depth)}📎 Applied Headers: ${profile.name}`,
            });
          }
        }

        if (step.bodyTemplateId) {
          const template = bodies.find((b) => b.id === step.bodyTemplateId);
          if (template) {
            let bodyContent = template.content;
            
            const matches = bodyContent.match(/\{\{([^}]+)\}\}|\{([^}]+)\}/g);
            if (matches) {
              matches.forEach(m => {
                const key = m.replace(/\{\{|\}\}|\{|\}/g, '');
                const val = apiVars[key] !== undefined ? apiVars[key] : interpolate(template.defaultValues?.[key] || '', context);
                bodyContent = bodyContent.replaceAll(m, val);
              });
            }

            resolvedData = bodyContent;

            addLog({
              stepId: step.id,
              timestamp: Date.now(),
              status: "RUNNING",
              message: `${"  ".repeat(depth)}📄 Applied Body Template: ${template.name}`,
            });
          }
        } else if (isVariableMode) {
          resolvedData = "";
        }
      }

      const cleanStep = {
        ...step,
        target: resolvedTarget,
        data: resolvedData,
      };

      await simulateStep(cleanStep, i, steps.length, depth);
    }
  };

  const simulateStep = async (
    step: TestStep,
    index: number,
    total: number,
    depth: number,
  ) => {
    const indent = "  ".repeat(depth);
    addLog({
      stepId: step.id,
      timestamp: Date.now(),
      status: "RUNNING",
      message: `${indent}[${step.action}] ${step.target} ${step.data ? `with "${step.data}"` : ""}`,
    });

    return new Promise<void>((resolve) => {
      const delay =
        step.action === "WAIT"
          ? parseInt(step.data) || 1000
          : Math.random() * 400 + 200;

      setTimeout(() => {
        const isFailure = step.data === "invalid" && step.action === "API_POST";

        if (isFailure) {
          addLog({
            stepId: step.id,
            timestamp: Date.now(),
            status: "PASS",
            message: `${indent}✅ Step ${index + 1} Passed: API returned 401 as expected`,
          });
        } else {
          addLog({
            stepId: step.id,
            timestamp: Date.now(),
            status: "PASS",
            message: `${indent}✅ Step ${index + 1} Passed`,
          });
        }
        resolve();
      }, delay);
    });
  };

  const startExecution = async () => {
    setStatus("RUNNING");
    setLogs([]);
    logsRef.current = [];
    setProgress(0);

    addLog({
      stepId: "init",
      timestamp: Date.now(),
      status: "PASS",
      message: `🚀 Starting Scenario: ${scenario.name}`,
    });

    addLog({
      stepId: "env",
      timestamp: Date.now(),
      status: "PASS",
      message: `🔧 Environment: ${selectedEnv}`,
    });

    let totalCases = 0;
    scenario.suites.forEach((ss) => {
      const suite = suites.find((s) => s.id === ss.suiteId);
      if (suite) totalCases += suite.cases.length;
    });

    if (totalCases === 0) {
      addLog({
        stepId: "finish",
        timestamp: Date.now(),
        status: "PASS",
        message: `🏁 Scenario has no test cases to run.`,
      });
      setStatus("COMPLETED");
      setProgress(100);
      return;
    }

    let casesCompleted = 0;

    try {
      for (const scenarioSuite of scenario.suites) {
        const suite = suites.find((s) => s.id === scenarioSuite.suiteId);
        if (!suite) continue;

        addLog({
          stepId: `suite-${suite.id}`,
          timestamp: Date.now(),
          status: "RUNNING",
          message: `\n📦 Executing Suite: ${suite.name}`,
        });

        const suiteDefaults = (suite.variables || []).reduce(
          (acc, v) => ({ ...acc, [v.key]: v.value }),
          {},
        );
        const firstRowData =
          suite.dataRows && suite.dataRows.length > 0 ? suite.dataRows[0] : {};

        // Context merge order: Suite Defaults < Scenario Overrides < Data Row
        const executionContext = {
          ...suiteDefaults,
          ...scenarioSuite.variableOverrides,
          ...firstRowData,
        };

        for (const testCase of suite.cases) {
          addLog({
            stepId: `case-${testCase.id}`,
            timestamp: Date.now(),
            status: "RUNNING",
            message: `  🧪 Running Case: ${testCase.name}`,
          });

          await executeStepsRecursive(testCase.steps, executionContext, 1);

          casesCompleted++;
          setProgress(Math.round((casesCompleted / totalCases) * 100));
        }
      }

      addLog({
        stepId: "finish",
        timestamp: Date.now(),
        status: "PASS",
        message: `\n🏁 Scenario Execution Completed Successfully`,
      });
      setStatus("COMPLETED");
      
      reportsApi.create({
        id: `report-${Date.now()}`,
        suiteId: scenario.id,
        suiteName: `Scenario: ${scenario.name}`,
        startTime: Date.now(),
        endTime: Date.now(),
        status: 'COMPLETED',
        passRate: 100,
        totalCases: totalCases,
        passedCases: totalCases,
        failedCases: 0,
        logs: logsRef.current,
        environment: selectedEnv
      });
    } catch (e) {
      addLog({
        stepId: "error",
        timestamp: Date.now(),
        status: "FAIL",
        message: `\n❌ Scenario Execution Failed: ${e}`,
      });
      setStatus("FAILED");
      
      reportsApi.create({
        id: `report-${Date.now()}`,
        suiteId: scenario.id,
        suiteName: `Scenario: ${scenario.name}`,
        startTime: Date.now(),
        endTime: Date.now(),
        status: 'FAILED',
        passRate: Math.round((casesCompleted / totalCases) * 100) || 0,
        totalCases: totalCases,
        passedCases: casesCompleted,
        failedCases: totalCases - casesCompleted,
        logs: logsRef.current,
        environment: selectedEnv
      });
    }
  };

  return (
    <div className="flex flex-col h-full w-full bg-slate-900 overflow-hidden">
      {/* Header */}
      <div className="h-16 px-6 bg-slate-900 border-b border-slate-800 flex justify-between items-center text-white shrink-0">
        <div className="flex items-center gap-4">
          <div
            className={`p-2 rounded-full ${status === "RUNNING" ? "bg-blue-500/20 text-blue-400" : status === "COMPLETED" ? "bg-emerald-500/20 text-emerald-400" : status === "IDLE" ? "bg-gray-500/20 text-gray-400" : "bg-red-500/20 text-red-400"}`}
          >
            {status === "RUNNING" && (
              <Loader2 className="animate-spin" size={20} />
            )}
            {status === "COMPLETED" && <CheckCircle2 size={20} />}
            {status === "FAILED" && <XCircle size={20} />}
            {status === "IDLE" && <PlayCircle size={20} />}
          </div>
          <div>
            <h3 className="font-semibold text-lg tracking-tight">
              {scenario.name}
            </h3>
            <p className="text-xs text-slate-400 font-medium">
              Scenario Execution
            </p>
          </div>
        </div>
        <div className="flex items-center gap-6">
          {status === "IDLE" && (
            <div className="flex items-center gap-2 mr-4">
              <span className="text-xs text-slate-400 font-medium uppercase tracking-wider">
                Target Env:
              </span>
              <div className="relative">
                <Globe
                  size={14}
                  className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <select
                  className="bg-slate-800 border border-slate-700 text-slate-200 text-xs rounded pl-7 pr-2 py-1.5 focus:ring-1 focus:ring-blue-500 outline-none cursor-pointer"
                  value={selectedEnv}
                  onChange={(e) => setSelectedEnv(e.target.value)}
                >
                  {environments.map((env) => (
                    <option key={env} value={env}>
                      {env}
                    </option>
                  ))}
                </select>
              </div>
              <button
                onClick={startExecution}
                className="ml-2 px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded shadow-lg shadow-blue-500/20 transition-all"
              >
                Start Run
              </button>
            </div>
          )}

          <div className="flex flex-col items-end">
            <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">
              Time Elapsed
            </span>
            <span className="font-mono text-sm text-slate-300 font-medium">
              00:00:0{Math.floor(logs.length * 0.8)}
            </span>
          </div>
          <div className="h-6 w-px bg-slate-800 mx-2"></div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors"
          >
            <X size={20} />
          </button>
        </div>
      </div>

      {/* Progress Line */}
      <div className="h-0.5 bg-slate-800 w-full">
        <div
          className={`h-full transition-all duration-300 ${status === "FAILED" ? "bg-red-500" : "bg-blue-500"} shadow-[0_0_10px_rgba(99,102,241,0.5)]`}
          style={{ width: `${progress}%` }}
        ></div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Terminal Log */}
        <div className="flex-1 bg-slate-950 p-6 overflow-y-auto font-mono text-sm space-y-3 flex flex-col">
          <div className="text-slate-500 text-xs font-bold uppercase tracking-widest mb-4 flex items-center gap-2">
            <Terminal size={12} /> Console Output
          </div>
          <div className="space-y-2 flex-1 whitespace-pre-wrap">
            {logs.map((log, idx) => (
              <div
                key={idx}
                className={`flex gap-3 text-xs leading-relaxed animate-in fade-in slide-in-from-left-2 duration-200 ${log.status === "FAIL" ? "text-red-400" : "text-slate-400"}`}
              >
                <span className="text-slate-600 shrink-0 select-none w-16">
                  [{new Date(log.timestamp).toLocaleTimeString().split(" ")[0]}]
                </span>
                <span
                  className={
                    log.message.includes("Starting") ||
                    log.message.includes("Executing Suite")
                      ? "text-blue-400 font-bold"
                      : log.message.includes("Passed") ||
                          log.message.includes("Completed")
                        ? "text-emerald-400"
                        : ""
                  }
                >
                  {log.message}
                </span>
              </div>
            ))}
            <div ref={logsEndRef} />
          </div>
        </div>
      </div>
    </div>
  );
};
