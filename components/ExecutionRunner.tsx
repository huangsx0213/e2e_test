
import React, { useEffect, useState, useRef } from 'react';
import { TestSuite, TestCase, ExecutionLog, TestStep, Project, HeaderProfile, BodyTemplate, ApiEndpoint, EnvironmentType } from '../types';
import { CheckCircle2, XCircle, Loader2, PlayCircle, Terminal, Clock, Monitor, Minimize2, Maximize2, X, Workflow, Globe } from 'lucide-react';

interface ExecutionRunnerProps {
  suite: TestSuite;
  testCase: TestCase;
  project?: Project; // Need project to resolve modules
  headers: HeaderProfile[];
  bodies: BodyTemplate[];
  endpoints: ApiEndpoint[];
  environments: string[];
  initialEnvironment: string;
  onClose: () => void;
}

export const ExecutionRunner: React.FC<ExecutionRunnerProps> = ({ suite, testCase, project, headers, bodies, endpoints, environments, initialEnvironment, onClose }) => {
  const [logs, setLogs] = useState<ExecutionLog[]>([]);
  const [status, setStatus] = useState<'IDLE' | 'RUNNING' | 'COMPLETED' | 'FAILED'>('IDLE');
  const [progress, setProgress] = useState(0);
  const [selectedEnv, setSelectedEnv] = useState<string>(initialEnvironment);
  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Wait for user to start or auto-start? 
    // Let's auto-start but allow env selection first? 
    // For now, auto-start with default DEV env, but maybe we should pause?
    // Let's pause and show a "Start" button with Env selector.
  }, []);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  const addLog = (log: ExecutionLog) => {
    setLogs(prev => [...prev, log]);
  };

  const interpolate = (str: string, vars: Record<string, string>) => {
    if (!str) return '';
    return str.replace(/\$\{(\w+)\}/g, (_, key) => vars[key] || `\${${key}}`);
  };

  const executeStepsRecursive = async (steps: TestStep[], context: Record<string, string>, depth: number = 0): Promise<void> => {
     for (let i = 0; i < steps.length; i++) {
        const step = steps[i];
        
        // Handle RUN_MODULE
        if (step.action === 'RUN_MODULE') {
            const moduleId = step.target;
            const module = project?.modules.find(m => m.id === moduleId);
            
            if (!module) {
                addLog({
                    stepId: step.id,
                    timestamp: Date.now(),
                    status: 'FAIL',
                    message: `❌ Module Not Found: ${moduleId}`
                });
                throw new Error(`Module ${moduleId} not found`);
            }

            addLog({
                stepId: step.id,
                timestamp: Date.now(),
                status: 'RUNNING',
                message: `${'  '.repeat(depth)}📦 Executing Module: ${module.name}`
            });

            // 1. Get Module Defaults
            const moduleDefaults: Record<string, string> = {};
            if (module.params) {
                module.params.forEach(p => {
                    moduleDefaults[p.name] = p.defaultValue || '';
                });
            }

            // 2. Parse Step Overrides
            let overrides = {};
            try {
                if (step.data) overrides = JSON.parse(step.data);
            } catch (e) {
                console.warn("Invalid JSON in module data overrides");
            }

            // 3. Merge Context: Global < Module Defaults < Overrides
            const moduleContext = { 
                ...context, 
                ...moduleDefaults,
                ...overrides 
            };
            
            // Note: We interpolate overrides themselves in case they reference parent variables
            // E.g. Module Override { "USER": "${GLOBAL_USER}" }
            Object.keys(moduleContext).forEach(k => {
                moduleContext[k] = interpolate(moduleContext[k], context);
            });

            await executeStepsRecursive(module.steps, moduleContext, depth + 1);
            
            addLog({
                stepId: step.id,
                timestamp: Date.now(),
                status: 'PASS',
                message: `${'  '.repeat(depth)}✅ Module Completed: ${module.name}`
            });
            continue;
        }

        // Standard Step Execution
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

        // API Specific Handling (Headers & Body Templates & Endpoints)
        if (step.action.startsWith('API_')) {
            // 1. Resolve Endpoint
            if (step.endpointId) {
                const endpoint = endpoints.find(e => e.id === step.endpointId);
                if (endpoint) {
                    const baseUrl = endpoint.baseUrls[selectedEnv];
                    const cleanBase = baseUrl.replace(/\/$/, '');
                    const cleanPath = resolvedTarget.replace(/^\//, '');
                    resolvedTarget = `${cleanBase}/${cleanPath}`;
                    
                    addLog({
                        stepId: step.id,
                        timestamp: Date.now(),
                        status: 'RUNNING',
                        message: `${'  '.repeat(depth)}🌐 Endpoint (${selectedEnv}): ${endpoint.name} -> ${resolvedTarget}`
                    });
                }
            }

            // Parse variables from data if we are using Profiles/Templates
            let apiVars: Record<string, string> = {};
            const isVariableMode = step.headerProfileId || step.bodyTemplateId;
            
            if (isVariableMode) {
                try {
                    apiVars = JSON.parse(resolvedData || '{}');
                } catch (e) {
                    // Fallback or ignore
                }
            }

            // 2. Resolve Headers
            if (step.headerProfileId) {
                const profile = headers.find(h => h.id === step.headerProfileId);
                if (profile) {
                    const resolvedHeaders = profile.headers.map(h => {
                        let val = h.value;
                        const matches = val.match(/\{\{([^}]+)\}\}/g);
                        if (matches) {
                            matches.forEach(m => {
                                const key = m.replace(/\{\{|\}\}/g, '');
                                val = val.replaceAll(m, apiVars[key] || '');
                            });
                        }
                        return { key: h.key, value: val };
                    });

                    addLog({
                        stepId: step.id,
                        timestamp: Date.now(),
                        status: 'RUNNING',
                        message: `${'  '.repeat(depth)}📎 Applied Headers: ${profile.name}\n${resolvedHeaders.map(h => `${'  '.repeat(depth)}      ${h.key}: ${h.value}`).join('\n')}`
                    });
                }
            }

            // 3. Resolve Body
            if (step.bodyTemplateId) {
                const template = bodies.find(b => b.id === step.bodyTemplateId);
                if (template) {
                    let bodyContent = template.content;
                    
                    // Find all variables in the template
                    const matches = bodyContent.match(/\{\{([^}]+)\}\}/g);
                    if (matches) {
                        matches.forEach(m => {
                            const key = m.replace(/\{\{|\}\}/g, '');
                            const val = apiVars[key] !== undefined ? apiVars[key] : interpolate(template.defaultValues?.[key] || '', context);
                            bodyContent = bodyContent.replaceAll(m, val);
                        });
                    }

                    resolvedData = bodyContent;

                    addLog({
                        stepId: step.id,
                        timestamp: Date.now(),
                        status: 'RUNNING',
                        message: `${'  '.repeat(depth)}📄 Applied Body Template: ${template.name}`
                    });
                }
            } else if (isVariableMode) {
                // If we have Headers but NO Body Template, the 'data' field was used for variables.
                // So the actual request body should be empty (or we assume GET/DELETE).
                resolvedData = '';
            }
        }

        const cleanStep = {
            ...step,
            target: resolvedTarget,
            data: resolvedData
        };
        
        await simulateStep(cleanStep, i, steps.length, depth);
     }
  };

  const simulateStep = async (step: TestStep, index: number, total: number, depth: number) => {
    const indent = '  '.repeat(depth);
    addLog({
      stepId: step.id,
      timestamp: Date.now(),
      status: 'RUNNING',
      message: `${indent}[${step.action}] ${step.target} ${step.data ? `with "${step.data}"` : ''}`
    });

    return new Promise<void>((resolve, reject) => {
      // Simulation delay
      const delay = step.action === 'WAIT' ? parseInt(step.data) || 1000 : Math.random() * 800 + 400;
      
      setTimeout(() => {
        // Mock failure randomly for demo if text implies failure
        const isFailure = step.data === 'invalid' && step.action === 'API_POST'; 
        
        if (isFailure) {
             addLog({
                stepId: step.id,
                timestamp: Date.now(),
                status: 'PASS', 
                message: `${indent}✅ Step ${index + 1} Passed: API returned 401 as expected`
            });
            resolve();
        } else {
             addLog({
                stepId: step.id,
                timestamp: Date.now(),
                status: 'PASS',
                message: `${indent}✅ Step ${index + 1} Passed`
            });
            resolve();
        }
        
        // Only update progress bar for top level steps for simplicity in this demo
        if (depth === 0) {
            setProgress(Math.round(((index + 1) / total) * 100));
        }
      }, delay);
    });
  };

  const startExecution = async () => {
    setStatus('RUNNING');
    setLogs([]);
    setProgress(0);

    // 1. Prepare Environment Variables
    const suiteDefaults = (suite.variables || []).reduce((acc, v) => ({ ...acc, [v.key]: v.value }), {});
    const firstRowData = suite.dataRows && suite.dataRows.length > 0 ? suite.dataRows[0] : {};
    
    const executionContext = { ...suiteDefaults, ...firstRowData };

    addLog({
      stepId: 'init',
      timestamp: Date.now(),
      status: 'PASS',
      message: `🚀 Starting Test Case: ${testCase.name}`
    });

    addLog({
      stepId: 'env',
      timestamp: Date.now(),
      status: 'PASS',
      message: `🔧 Environment: ${selectedEnv} | Using Suite Variables & Data Row #1`
    });

    try {
        await executeStepsRecursive(testCase.steps, executionContext);
        
        addLog({
            stepId: 'finish',
            timestamp: Date.now(),
            status: 'PASS',
            message: `🏁 Execution Completed Successfully`
        });
        setStatus('COMPLETED');
    } catch (e) {
        setStatus('FAILED');
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-50 flex items-center justify-center p-6 animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-[95vw] h-[90vh] rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-gray-700/50 ring-1 ring-white/10">
        {/* Header */}
        <div className="h-16 px-6 bg-slate-900 border-b border-slate-800 flex justify-between items-center text-white shrink-0">
            <div className="flex items-center gap-4">
                <div className={`p-2 rounded-full ${status === 'RUNNING' ? 'bg-blue-500/20 text-blue-400' : status === 'COMPLETED' ? 'bg-emerald-500/20 text-emerald-400' : status === 'IDLE' ? 'bg-gray-500/20 text-gray-400' : 'bg-red-500/20 text-red-400'}`}>
                    {status === 'RUNNING' && <Loader2 className="animate-spin" size={20} />}
                    {status === 'COMPLETED' && <CheckCircle2 size={20} />}
                    {status === 'FAILED' && <XCircle size={20} />}
                    {status === 'IDLE' && <PlayCircle size={20} />}
                </div>
                <div>
                    <h3 className="font-semibold text-lg tracking-tight">{testCase.name}</h3>
                    <p className="text-xs text-slate-400 font-medium">{suite.name}</p>
                </div>
            </div>
            <div className="flex items-center gap-6">
                 {status === 'IDLE' && (
                    <div className="flex items-center gap-2 mr-4">
                        <span className="text-xs text-slate-400 font-medium uppercase tracking-wider">Target Env:</span>
                        <div className="relative">
                            <Globe size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
                            <select 
                                className="bg-slate-800 border border-slate-700 text-slate-200 text-xs rounded pl-7 pr-2 py-1.5 focus:ring-1 focus:ring-blue-500 outline-none cursor-pointer"
                                value={selectedEnv}
                                onChange={(e) => setSelectedEnv(e.target.value)}
                            >
                                {environments.map(env => (
                                    <option key={env} value={env}>{env}</option>
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
                    <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Time Elapsed</span>
                    <span className="font-mono text-sm text-slate-300 font-medium">00:00:0{Math.floor(logs.length * 0.8)}</span>
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
                className={`h-full transition-all duration-300 ${status === 'FAILED' ? 'bg-red-500' : 'bg-blue-500'} shadow-[0_0_10px_rgba(99,102,241,0.5)]`} 
                style={{ width: `${progress}%` }}
            ></div>
        </div>

        {/* Main Content */}
        <div className="flex-1 flex overflow-hidden">
             {/* Terminal Log */}
             <div className="w-[40%] bg-slate-950 p-6 overflow-y-auto font-mono text-sm space-y-3 flex flex-col border-r border-slate-800">
                <div className="text-slate-500 text-xs font-bold uppercase tracking-widest mb-4 flex items-center gap-2">
                    <Terminal size={12}/> Console Output
                </div>
                <div className="space-y-2 flex-1">
                    {logs.map((log, idx) => (
                        <div key={idx} className={`flex gap-3 text-xs leading-relaxed animate-in fade-in slide-in-from-left-2 duration-200 ${log.status === 'FAIL' ? 'text-red-400' : 'text-slate-400'}`}>
                            <span className="text-slate-600 shrink-0 select-none w-16">[{new Date(log.timestamp).toLocaleTimeString().split(' ')[0]}]</span>
                            <span className={log.message.includes('Starting') ? 'text-blue-400 font-bold' : log.message.includes('Passed') ? 'text-emerald-400' : ''}>
                                {log.message}
                            </span>
                        </div>
                    ))}
                    <div ref={logsEndRef} />
                </div>
             </div>

             {/* Live Preview */}
             <div className="flex-1 bg-gray-100 flex flex-col relative">
                <div className="bg-white border-b border-gray-200 p-3 flex items-center gap-3 shadow-sm z-10">
                   <div className="flex gap-1.5 ml-1">
                       <div className="w-2.5 h-2.5 rounded-full bg-red-400"></div>
                       <div className="w-2.5 h-2.5 rounded-full bg-slate-400"></div>
                       <div className="w-2.5 h-2.5 rounded-full bg-green-400"></div>
                   </div>
                   <div className="flex-1 bg-gray-50 hover:bg-white transition-colors rounded-md px-3 py-1.5 text-xs text-gray-500 font-mono truncate border border-gray-200 flex items-center gap-2">
                       <span className="text-green-600">🔒</span>
                       https://staging.quantum-store.com/app
                   </div>
                </div>
                
                <div className="flex-1 flex items-center justify-center p-8 relative overflow-hidden bg-[url('https://grainy-gradients.vercel.app/noise.svg')] bg-gray-100">
                    {/* Simplified Visual Simulation of a Web Page */}
                    <div className="bg-white shadow-2xl rounded-xl w-full h-full mx-auto flex flex-col overflow-hidden opacity-100 relative border border-gray-200/50">
                        {/* Fake Header */}
                        <div className="h-14 bg-white border-b border-gray-100 w-full flex items-center px-6 gap-6 justify-between">
                            <div className="flex items-center gap-4">
                                <div className="w-8 h-8 bg-blue-600 rounded-md shadow-sm"></div>
                                <div className="flex gap-4">
                                    <div className="w-16 h-2 bg-gray-100 rounded-full"></div>
                                    <div className="w-16 h-2 bg-gray-100 rounded-full"></div>
                                </div>
                            </div>
                            <div className="w-8 h-8 rounded-full bg-gray-100"></div>
                        </div>
                        {/* Fake Content */}
                        <div className="p-8 grid grid-cols-12 gap-6">
                           <div className="col-span-12 h-10 bg-gray-50 rounded-lg mb-2 w-1/3"></div>
                           <div className="col-span-12 h-64 bg-slate-50 border-2 border-dashed border-slate-200 rounded-xl flex flex-col items-center justify-center text-gray-400 text-sm gap-2">
                                <Monitor size={32} className="text-gray-300" />
                                <span className="font-medium">Browser Viewport</span>
                           </div>
                        </div>

                        {/* Status Overlay */}
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                            {status === 'RUNNING' && (
                                <div className="bg-slate-900/90 px-6 py-4 rounded-xl shadow-2xl flex flex-col items-center border border-slate-700/50 backdrop-blur-md">
                                    <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-3"></div>
                                    <span className="text-white font-semibold text-sm tracking-wide">Automating...</span>
                                </div>
                            )}
                            {status === 'COMPLETED' && (
                                <div className="bg-white/95 px-10 py-8 rounded-2xl shadow-2xl flex flex-col items-center border border-emerald-100 animate-in fade-in zoom-in duration-300">
                                    <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mb-4">
                                        <CheckCircle2 size={36} className="text-emerald-600" />
                                    </div>
                                    <span className="text-slate-900 font-bold text-xl tracking-tight">Test Passed</span>
                                    <span className="text-slate-500 text-sm mt-1">All assertions verified</span>
                                </div>
                            )}
                             {status === 'FAILED' && (
                                <div className="bg-white/95 px-10 py-8 rounded-2xl shadow-2xl flex flex-col items-center border border-red-100 animate-in fade-in zoom-in duration-300">
                                    <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-4">
                                        <XCircle size={36} className="text-red-600" />
                                    </div>
                                    <span className="text-slate-900 font-bold text-xl tracking-tight">Test Failed</span>
                                    <span className="text-red-500 text-sm mt-1 font-medium">Step 7: Element not found</span>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
             </div>
        </div>
      </div>
    </div>
  );
};
