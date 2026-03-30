
import React, { useEffect, useState, useRef, useCallback } from 'react';
import { CrudActions } from '@/shared/hooks/useCrud';
import { TestSuite, TestCase, ExecutionLog, Project, HeaderProfile, BodyTemplate, ApiEndpoint, ExecutionReport } from '@/shared/types';
import { CheckCircle2, XCircle, Loader2, PlayCircle, Terminal, Monitor, X, Globe, StopCircle } from 'lucide-react';
import { executionApi } from '@/shared/services/api';

interface ExecutionRunnerProps {
    suite: TestSuite;
    testCase: TestCase;
    project?: Project;
    headers: HeaderProfile[];
    bodies: BodyTemplate[];
    endpoints: ApiEndpoint[];
    environments: string[];
    initialEnvironment: string;
    onClose: () => void;
    reportsApi: CrudActions<ExecutionReport>;
}

export const ExecutionRunner: React.FC<ExecutionRunnerProps> = ({ suite, testCase, project, headers, bodies, endpoints, environments, initialEnvironment, onClose, reportsApi }) => {
    const [logs, setLogs] = useState<ExecutionLog[]>([]);
    const [status, setStatus] = useState<'IDLE' | 'RUNNING' | 'COMPLETED' | 'FAILED'>('IDLE');
    const [progress, setProgress] = useState(0);
    const [selectedEnv, setSelectedEnv] = useState<string>(initialEnvironment);
    const [reportId, setReportId] = useState<string | null>(null);
    const [elapsedMs, setElapsedMs] = useState(0);
    const logsEndRef = useRef<HTMLDivElement>(null);
    const eventSourceRef = useRef<EventSource | null>(null);
    const startTimeRef = useRef<number>(0);
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    useEffect(() => {
        logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [logs]);

    // Cleanup SSE and timer on unmount
    useEffect(() => {
        return () => {
            eventSourceRef.current?.close();
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, []);

    const startTimer = useCallback(() => {
        startTimeRef.current = Date.now();
        timerRef.current = setInterval(() => {
            setElapsedMs(Date.now() - startTimeRef.current);
        }, 100);
    }, []);

    const stopTimer = useCallback(() => {
        if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
        }
    }, []);

    const formatElapsed = (ms: number) => {
        const totalSec = Math.floor(ms / 1000);
        const min = Math.floor(totalSec / 60).toString().padStart(2, '0');
        const sec = (totalSec % 60).toString().padStart(2, '0');
        const tenths = Math.floor((ms % 1000) / 100);
        return `${min}:${sec}.${tenths}`;
    };

    const connectSSE = useCallback((rId: string) => {
        const es = executionApi.stream(rId);
        eventSourceRef.current = es;

        es.addEventListener('log', (event) => {
            const data = JSON.parse(event.data);
            setLogs(prev => [...prev, {
                stepId: data.stepId,
                timestamp: data.timestamp,
                status: data.status,
                message: data.message,
                screenshot: data.screenshot,
            }]);
        });

        es.addEventListener('progress', (event) => {
            const data = JSON.parse(event.data);
            setProgress(data.percent);
        });

        es.addEventListener('done', (event) => {
            const data = JSON.parse(event.data);
            setStatus(data.status === 'COMPLETED' ? 'COMPLETED' : 'FAILED');
            setProgress(100);
            stopTimer();
            es.close();
            eventSourceRef.current = null;
        });

        es.onerror = () => {
            // Connection dropped — mark as failed
            setStatus('FAILED');
            stopTimer();
            es.close();
            eventSourceRef.current = null;
        };
    }, [stopTimer]);

    const startExecution = async () => {
        setStatus('RUNNING');
        setLogs([]);
        setProgress(0);
        startTimer();

        try {
            const response = await executionApi.execute({
                type: 'case',
                projectId: project?.id || '',
                environment: selectedEnv,
                suiteId: suite.id,
                caseId: testCase.id,
            });

            setReportId(response.reportId);
            connectSSE(response.reportId);
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            setLogs([{
                stepId: 'error',
                timestamp: Date.now(),
                status: 'FAIL',
                message: `❌ Failed to start execution: ${msg}`,
            }]);
            setStatus('FAILED');
            stopTimer();
        }
    };

    const handleAbort = async () => {
        if (!reportId) return;
        try {
            await executionApi.abort(reportId);
        } catch {
            // Best effort
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
                        {status !== 'RUNNING' && (
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
                                    className="ml-2 px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded shadow-lg shadow-blue-500/20 transition-all flex items-center gap-1.5"
                                >
                                    <PlayCircle size={14} />
                                    {status === 'IDLE' ? 'Start Run' : 'Re-run'}
                                </button>
                            </div>
                        )}

                        {status === 'RUNNING' && (
                            <button
                                onClick={handleAbort}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600/20 hover:bg-red-600/40 text-red-400 text-xs font-bold rounded border border-red-600/30 transition-all"
                            >
                                <StopCircle size={14} />
                                Abort
                            </button>
                        )}

                        <div className="flex flex-col items-end">
                            <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Time Elapsed</span>
                            <span className="font-mono text-sm text-slate-300 font-medium">{formatElapsed(elapsedMs)}</span>
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
                            <Terminal size={12} /> Console Output
                        </div>
                        <div className="space-y-2 flex-1">
                            {logs.map((log, idx) => (
                                <div key={idx} className={`flex gap-3 text-xs leading-relaxed animate-in fade-in slide-in-from-left-2 duration-200 ${log.status === 'FAIL' ? 'text-red-400' : 'text-slate-400'}`}>
                                    <span className="text-slate-600 shrink-0 select-none w-16">[{new Date(log.timestamp).toLocaleTimeString().split(' ')[0]}]</span>
                                    <span className={
                                        log.message.includes('Starting') || log.message.includes('🚀') ? 'text-blue-400 font-bold'
                                        : log.message.includes('✅') || log.message.includes('Completed Successfully') ? 'text-emerald-400'
                                        : log.message.includes('📦') ? 'text-purple-400'
                                        : log.message.includes('🌐') ? 'text-cyan-400'
                                        : ''
                                    }>
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
                                Backend Execution Engine — API Mode
                            </div>
                        </div>

                        <div className="flex-1 flex items-center justify-center p-8 relative overflow-hidden bg-gray-100">
                            <div className="bg-white shadow-2xl rounded-xl w-full h-full mx-auto flex flex-col overflow-hidden opacity-100 relative border border-gray-200/50">
                                {/* API Response Preview Area */}
                                <div className="h-14 bg-white border-b border-gray-100 w-full flex items-center px-6 gap-6 justify-between">
                                    <div className="flex items-center gap-4">
                                        <div className="w-8 h-8 bg-blue-600 rounded-md shadow-sm"></div>
                                        <span className="text-sm font-semibold text-gray-700">API Execution Results</span>
                                    </div>
                                    <div className="text-xs text-gray-400 font-mono">{logs.length} events</div>
                                </div>
                                {/* Recent API logs summary */}
                                <div className="flex-1 overflow-y-auto p-6 space-y-2">
                                    {logs.filter(l => l.details || l.message.includes('🌐') || l.message.includes('→')).slice(-10).map((log, idx) => (
                                        <div key={idx} className="bg-slate-50 border border-slate-100 rounded-lg p-3 text-xs font-mono">
                                            <div className={`font-semibold ${log.status === 'PASS' ? 'text-emerald-600' : log.status === 'FAIL' ? 'text-red-600' : 'text-blue-600'}`}>
                                                {log.message}
                                            </div>
                                            {log.details && (
                                                <div className="mt-2 text-gray-500 space-y-1">
                                                    {log.details.httpStatus && <div>Status: <span className="text-gray-900">{log.details.httpStatus}</span></div>}
                                                    {log.details.durationMs && <div>Duration: <span className="text-gray-900">{log.details.durationMs}ms</span></div>}
                                                    {log.details.responseBody && (
                                                        <div className="mt-1">
                                                            <div className="text-gray-400 mb-1">Response:</div>
                                                            <pre className="bg-white border border-slate-200 rounded p-2 text-[11px] max-h-24 overflow-y-auto whitespace-pre-wrap">{log.details.responseBody}</pre>
                                                        </div>
                                                    )}
                                                    {log.details.extractedValue && <div>Extracted: <span className="text-blue-600 font-bold">{log.details.extractedValue}</span></div>}
                                                </div>
                                            )}
                                            {log.screenshot && (
                                                <div className="mt-2 text-gray-500">
                                                    <div className="text-gray-400 mb-1 text-xs">Screenshot:</div>
                                                    <img src={log.screenshot} alt="Step screenshot" className="rounded border border-slate-200 shadow-sm object-contain max-h-48 w-full bg-slate-100" />
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                    {logs.length === 0 && (
                                        <div className="flex-1 flex flex-col items-center justify-center text-gray-400 text-sm gap-2 py-16">
                                            <Monitor size={32} className="text-gray-300" />
                                            <span className="font-medium">Waiting for execution…</span>
                                        </div>
                                    )}
                                </div>

                                {/* Status Overlay */}
                                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                    {status === 'RUNNING' && logs.length === 0 && (
                                        <div className="bg-slate-900/90 px-6 py-4 rounded-xl shadow-2xl flex flex-col items-center border border-slate-700/50 backdrop-blur-md">
                                            <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-3"></div>
                                            <span className="text-white font-semibold text-sm tracking-wide">Connecting…</span>
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
                                            <span className="text-red-500 text-sm mt-1 font-medium">Check console for details</span>
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
