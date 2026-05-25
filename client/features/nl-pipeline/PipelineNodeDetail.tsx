import React, { useState, useEffect, useRef } from 'react';
import { X, Brain, PenTool, Star, CheckCircle2, Loader2, FileText, Table2, AlertTriangle } from 'lucide-react';

interface NodeDetailProps {
  node: {
    id: string;
    label: string;
    type: 'preparation' | 'agent' | 'checkpoint' | 'complete';
    agentName?: string;
    status: string;
    meta?: any;
  } | null;
  agentLog: any | null;
  checkpointData: any | null;
  thinkingText: string | null;
  runSummary: { totalCases: number; totalTokens: number; totalLatencyMs: number; totalBatches: number } | null;
  onClose: () => void;
  onCheckpointAction?: (action: 'approve' | 'edit' | 'retry', data?: any) => void;
}

function AgentSummaryView({ agentLog, agentName }: { agentLog: any; agentName?: string }) {
  const output = agentLog?.output_data;
  if (!output) {
    return <div className="text-xs text-slate-400 italic p-3">No output data available.</div>;
  }

  if (agentName === 'test_analyst') {
    const conditions = output.testConditions || [];
    const analysis = output.analysis || {};
    const cats: Record<string, number> = {};
    const risks: Record<string, number> = {};
    const techs: Record<string, number> = {};
    for (const c of conditions) {
      if (c.category) cats[c.category] = (cats[c.category] || 0) + 1;
      if (c.riskLevel) risks[c.riskLevel] = (risks[c.riskLevel] || 0) + 1;
      if (c.primaryTechnique) techs[c.primaryTechnique] = (techs[c.primaryTechnique] || 0) + 1;
    }

    return (
      <div className="p-3 space-y-3 text-sm">
        <div className="flex items-center gap-2">
          <Brain size={16} className="text-cyan-600" />
          <span className="font-medium text-slate-700">{conditions.length} Test Conditions</span>
        </div>
        {analysis.overallApproach && (
          <div className="bg-slate-50 rounded p-2 text-xs text-slate-600 leading-relaxed">
            <span className="font-medium text-slate-700">Approach:</span> {analysis.overallApproach}
          </div>
        )}
        {analysis.riskAssessmentSummary && (
          <div className="bg-slate-50 rounded p-2 text-xs text-slate-600 leading-relaxed">
            <span className="font-medium text-slate-700">Risk:</span> {analysis.riskAssessmentSummary}
          </div>
        )}
        <div className="grid grid-cols-3 gap-2 text-xs">
          {Object.keys(cats).length > 0 && (
            <div className="bg-slate-50 rounded p-2">
              <div className="font-medium text-slate-600 mb-1">Categories</div>
              {Object.entries(cats).map(([k, v]) => (
                <div key={k} className="flex justify-between text-slate-500">
                  <span>{k}</span><span className="font-mono">{v}</span>
                </div>
              ))}
            </div>
          )}
          {Object.keys(risks).length > 0 && (
            <div className="bg-slate-50 rounded p-2">
              <div className="font-medium text-slate-600 mb-1">Risk Levels</div>
              {Object.entries(risks).map(([k, v]) => (
                <div key={k} className="flex justify-between text-slate-500">
                  <span>{k}</span><span className="font-mono">{v}</span>
                </div>
              ))}
            </div>
          )}
          {Object.keys(techs).length > 0 && (
            <div className="bg-slate-50 rounded p-2">
              <div className="font-medium text-slate-600 mb-1">Techniques</div>
              {Object.entries(techs).map(([k, v]) => (
                <div key={k} className="flex justify-between text-slate-500">
                  <span>{k}</span><span className="font-mono">{v}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="border-t border-slate-200 pt-2">
          <div className="text-xs font-medium text-slate-600 mb-1">Conditions</div>
          <div className="space-y-1 max-h-40 overflow-y-auto">
            {conditions.slice(0, 15).map((c: any, i: number) => (
              <div key={i} className="text-xs bg-white border border-slate-200 rounded px-2 py-1 text-slate-600">
                <div className="flex items-center justify-between">
                  <span className="truncate">{c.condition || `Condition ${i + 1}`}</span>
                  <span className="shrink-0 ml-1 text-slate-400">[{c.category || '?'}]</span>
                </div>
              </div>
            ))}
            {conditions.length > 15 && (
              <div className="text-xs text-slate-400 text-center">+ {conditions.length - 15} more</div>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (agentName === 'test_designer') {
    const cases = output.draftTestCases || [];
    const techs: Record<string, number> = {};
    const cats: Record<string, number> = {};
    const prios: Record<string, number> = {};
    for (const tc of cases) {
      if (tc.techniqueApplied) techs[tc.techniqueApplied] = (techs[tc.techniqueApplied] || 0) + 1;
      if (tc.category) cats[tc.category] = (cats[tc.category] || 0) + 1;
      if (tc.priority) prios[tc.priority] = (prios[tc.priority] || 0) + 1;
    }

    return (
      <div className="p-3 space-y-3 text-sm">
        <div className="flex items-center gap-2">
          <PenTool size={16} className="text-indigo-600" />
          <span className="font-medium text-slate-700">{cases.length} Draft Test Cases</span>
        </div>
        <div className="grid grid-cols-3 gap-2 text-xs">
          {Object.keys(techs).length > 0 && (
            <div className="bg-slate-50 rounded p-2">
              <div className="font-medium text-slate-600 mb-1">Techniques</div>
              {Object.entries(techs).map(([k, v]) => (
                <div key={k} className="flex justify-between text-slate-500">
                  <span>{k}</span><span className="font-mono">{v}</span>
                </div>
              ))}
            </div>
          )}
          {Object.keys(cats).length > 0 && (
            <div className="bg-slate-50 rounded p-2">
              <div className="font-medium text-slate-600 mb-1">Categories</div>
              {Object.entries(cats).map(([k, v]) => (
                <div key={k} className="flex justify-between text-slate-500">
                  <span>{k}</span><span className="font-mono">{v}</span>
                </div>
              ))}
            </div>
          )}
          {Object.keys(prios).length > 0 && (
            <div className="bg-slate-50 rounded p-2">
              <div className="font-medium text-slate-600 mb-1">Priority</div>
              {Object.entries(prios).map(([k, v]) => (
                <div key={k} className="flex justify-between text-slate-500">
                  <span>{k}</span><span className="font-mono">{v}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="border-t border-slate-200 pt-2">
          <div className="text-xs font-medium text-slate-600 mb-1">Test Cases</div>
          <div className="space-y-1 max-h-40 overflow-y-auto">
            {cases.slice(0, 15).map((tc: any, i: number) => (
              <div key={i} className="text-xs bg-white border border-slate-200 rounded px-2 py-1">
                <div className="flex items-center justify-between gap-1">
                  <span className="font-medium text-slate-700 truncate">{tc.title || tc.id}</span>
                  <span className="shrink-0 text-slate-400">[{tc.category || '?'}]</span>
                </div>
                {tc.preconditions?.length > 0 && (
                  <div className="text-slate-400 truncate mt-0.5">{tc.preconditions[0]}</div>
                )}
              </div>
            ))}
            {cases.length > 15 && (
              <div className="text-xs text-slate-400 text-center">+ {cases.length - 15} more</div>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (agentName === 'quality_manager') {
    const cases = output.finalTestCases || [];
    const matrix = output.coverageMatrix;
    const matrixRows = matrix?.rows || [];
    const techs: Record<string, number> = {};
    const cats: Record<string, number> = {};
    const prios: Record<string, number> = {};
    for (const tc of cases) {
      if (tc.techniqueApplied) techs[tc.techniqueApplied] = (techs[tc.techniqueApplied] || 0) + 1;
      if (tc.category) cats[tc.category] = (cats[tc.category] || 0) + 1;
      if (tc.priority) prios[tc.priority] = (prios[tc.priority] || 0) + 1;
    }

    return (
      <div className="p-3 space-y-3 text-sm">
        <div className="flex items-center gap-2">
          <Star size={16} className="text-amber-600" />
          <span className="font-medium text-slate-700">{cases.length} Final Test Cases</span>
        </div>
        {matrixRows.length > 0 && (
          <div className="bg-slate-50 rounded p-2">
            <div className="flex items-center gap-1.5 text-xs font-medium text-slate-600 mb-1.5">
              <Table2 size={12} /> Coverage Matrix ({matrixRows.length} requirements)
            </div>
            <div className="space-y-1">
              {matrixRows.map((r: any, i: number) => (
                <div key={i} className="flex items-center justify-between text-xs bg-white rounded px-2 py-1 border border-slate-200">
                  <span className="text-slate-600 truncate mr-2">{r.requirementTitle}</span>
                  <span className="shrink-0 flex items-center gap-2">
                    <span className="text-slate-400">{r.testCaseCount} cases</span>
                    <span className={`font-mono ${r.coveragePercentage >= 100 ? 'text-green-600' : 'text-amber-600'}`}>
                      {r.coveragePercentage}%
                    </span>
                  </span>
                </div>
              ))}
            </div>
            <div className="text-xs text-slate-400 mt-1 text-right">
              Avg coverage: {Math.round(matrixRows.reduce((s: number, r: any) => s + r.coveragePercentage, 0) / matrixRows.length)}%
            </div>
          </div>
        )}
        <div className="grid grid-cols-3 gap-2 text-xs">
          {Object.keys(techs).length > 0 && (
            <div className="bg-slate-50 rounded p-2">
              <div className="font-medium text-slate-600 mb-1">Techniques</div>
              {Object.entries(techs).map(([k, v]) => (
                <div key={k} className="flex justify-between text-slate-500">
                  <span>{k}</span><span className="font-mono">{v}</span>
                </div>
              ))}
            </div>
          )}
          {Object.keys(cats).length > 0 && (
            <div className="bg-slate-50 rounded p-2">
              <div className="font-medium text-slate-600 mb-1">Categories</div>
              {Object.entries(cats).map(([k, v]) => (
                <div key={k} className="flex justify-between text-slate-500">
                  <span>{k}</span><span className="font-mono">{v}</span>
                </div>
              ))}
            </div>
          )}
          {Object.keys(prios).length > 0 && (
            <div className="bg-slate-50 rounded p-2">
              <div className="font-medium text-slate-600 mb-1">Priority</div>
              {Object.entries(prios).map(([k, v]) => (
                <div key={k} className="flex justify-between text-slate-500">
                  <span>{k}</span><span className="font-mono">{v}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="border-t border-slate-200 pt-2">
          <div className="text-xs font-medium text-slate-600 mb-1">Final Test Cases</div>
          <div className="space-y-1 max-h-40 overflow-y-auto">
            {cases.slice(0, 15).map((tc: any, i: number) => (
              <div key={i} className="text-xs bg-white border border-slate-200 rounded px-2 py-1">
                <div className="flex items-center justify-between gap-1">
                  <span className="font-medium text-slate-700 truncate">{tc.title || tc.id}</span>
                  <span className="shrink-0 flex items-center gap-1">
                    <span className="text-slate-400">{tc.priority}</span>
                    <span className="text-slate-300">[{tc.category || '?'}]</span>
                  </span>
                </div>
                {tc.preconditions?.length > 0 && (
                  <div className="text-slate-400 truncate mt-0.5">{tc.preconditions[0]}</div>
                )}
              </div>
            ))}
            {cases.length > 15 && (
              <div className="text-xs text-slate-400 text-center">+ {cases.length - 15} more</div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <pre className="text-xs bg-slate-50 p-2 rounded whitespace-pre-wrap max-h-full overflow-y-auto">
      {JSON.stringify(output, null, 2)}
    </pre>
  );
}

function AgentDetailTabs({ agentLog, node, thinkingText }: { agentLog: any; node: any; thinkingText: string | null }) {
  const [activeTab, setActiveTab] = useState<'summary' | 'thinking' | 'input' | 'output' | 'trace' | 'errors'>('summary');
  const thinkingRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (thinkingText && activeTab === 'thinking' && thinkingRef.current) {
      thinkingRef.current.scrollTop = thinkingRef.current.scrollHeight;
    }
  }, [thinkingText, activeTab]);

  useEffect(() => {
    if (thinkingText && node?.status === 'running') {
      setActiveTab('thinking');
    }
    if (node?.status === 'done') {
      setActiveTab('summary');
    }
  }, [thinkingText, node?.status]);

  const isRunning = node?.status === 'running';
  const tabs = ['summary', 'thinking', 'input', 'output', 'trace', 'errors'] as const;

  return (
    <div className="flex flex-col h-full">
      <div className="flex border-b border-slate-200 overflow-x-auto">
        {tabs.map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-3 py-2 text-xs font-medium capitalize border-b-2 transition-colors relative shrink-0 ${
              activeTab === tab
                ? 'border-blue-500 text-blue-700'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {tab === 'thinking' && isRunning && thinkingText && (
              <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
            )}
            {tab}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'summary' && (
          <AgentSummaryView agentLog={agentLog} agentName={node.agentName} />
        )}

        {activeTab === 'thinking' && (
          <div className="p-3">
            <div ref={thinkingRef} className="font-mono text-xs leading-relaxed whitespace-pre-wrap text-slate-600 max-h-full overflow-y-auto">
              {thinkingText ? (
                <div>
                  {thinkingText}
                  {isRunning && <span className="inline-block w-2 h-4 bg-blue-500 animate-pulse ml-0.5 align-middle" />}
                </div>
              ) : (
                <div className="text-slate-400 italic">
                  {isRunning ? (
                    <span className="flex items-center gap-2">
                      <Loader2 size={14} className="animate-spin" />
                      Waiting for agent response...
                    </span>
                  ) : (
                    'Agent thinking process will appear here during execution.'
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'input' && (
          <div className="p-3 space-y-3">
            {Array.isArray(agentLog?.input_prompt) ? (
              agentLog.input_prompt.map((msg: any, i: number) => (
                <div key={i}>
                  <div className="text-xs text-slate-400 mb-1 capitalize">{msg.role}</div>
                  <pre className="text-xs bg-slate-50 p-2 rounded max-h-40 overflow-y-auto whitespace-pre-wrap">
                    {msg.content || 'No data'}
                  </pre>
                </div>
              ))
            ) : (
              <>
                <div>
                  <div className="text-xs text-slate-400 mb-1">System Prompt</div>
                  <pre className="text-xs bg-slate-50 p-2 rounded max-h-40 overflow-y-auto whitespace-pre-wrap">
                    {agentLog?.input_prompt?.systemPrompt || 'No data'}
                  </pre>
                </div>
                <div>
                  <div className="text-xs text-slate-400 mb-1">User Message</div>
                  <pre className="text-xs bg-slate-50 p-2 rounded max-h-40 overflow-y-auto whitespace-pre-wrap">
                    {agentLog?.input_prompt?.userMessage || 'No data'}
                  </pre>
                </div>
              </>
            )}
          </div>
        )}

        {activeTab === 'output' && (
          <div className="p-3">
            {agentLog?.output_data ? (
              <div className="space-y-3">
                {node.agentName === 'test_analyst' && (
                  <AgentSummaryView agentLog={agentLog} agentName={node.agentName} />
                )}
                {node.agentName === 'test_designer' && (
                  <AgentSummaryView agentLog={agentLog} agentName={node.agentName} />
                )}
                {node.agentName === 'quality_manager' && (
                  <AgentSummaryView agentLog={agentLog} agentName={node.agentName} />
                )}
                {!['test_analyst', 'test_designer', 'quality_manager'].includes(node.agentName || '') && (
                  <pre className="text-xs bg-slate-50 p-2 rounded whitespace-pre-wrap max-h-full overflow-y-auto">
                    {JSON.stringify(agentLog.output_data, null, 2)}
                  </pre>
                )}
                <details className="group">
                  <summary className="text-xs text-slate-400 cursor-pointer hover:text-slate-600 select-none">
                    Raw JSON
                  </summary>
                  <pre className="text-xs bg-slate-50 p-2 rounded whitespace-pre-wrap max-h-60 overflow-y-auto mt-1">
                    {JSON.stringify(agentLog.output_data, null, 2)}
                  </pre>
                </details>
              </div>
            ) : (
              <div className="text-xs text-slate-400 italic">No output data yet</div>
            )}
          </div>
        )}

        {activeTab === 'trace' && (
          <div className="p-3 space-y-1">
            {agentLog?.raw_trace?.map((entry: any, i: number) => (
              <div key={i} className="text-xs font-mono">
                <span className="text-slate-400">
                  {entry.timestamp ? new Date(entry.timestamp).toISOString().slice(11, 19) : `[${i}]`}
                </span>{' '}
                <span className="text-slate-700">{entry.message || entry.name || `Step ${entry.step}`}</span>
              </div>
            )) || (
              <div className="text-xs text-slate-400">No trace data</div>
            )}
          </div>
        )}

        {activeTab === 'errors' && (
          <div className="p-3 text-xs text-slate-500">
            {agentLog?.status === 'FAILED' ? (
              <div className="flex items-center gap-1.5 text-red-600">
                <AlertTriangle size={14} /> Agent execution failed.
              </div>
            ) : (
              'No errors'
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function CheckpointDetailTabs({
  checkpointData,
  onAction,
}: {
  checkpointData: any;
  onAction: (action: 'approve' | 'edit' | 'retry', data?: any) => void;
}) {
  const [feedback, setFeedback] = useState('');
  const [editedItems, setEditedItems] = useState<any[]>([]);
  const items = checkpointData?.conditions || checkpointData?.cases || [];

  useEffect(() => {
    setEditedItems(items);
  }, [items]);

  const handleApprove = () => {
    const payload = checkpointData?.conditions
      ? { conditions: editedItems, analysis: checkpointData.analysis }
      : { cases: editedItems };
    onAction('approve', { feedback, editedData: payload });
  };

  const handleEdit = () => {
    const payload = checkpointData?.conditions
      ? { conditions: editedItems, analysis: checkpointData.analysis }
      : { cases: editedItems };
    onAction('edit', { feedback, editedData: payload });
  };

  const handleRetry = () => {
    onAction('retry', { feedback });
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-3">
        <div className="text-xs text-slate-500 mb-2">
          {checkpointData?.conditions ? `${checkpointData.conditions.length} Test Conditions`
            : checkpointData?.cases ? `${checkpointData.cases.length} Cases`
            : 'No items'}
        </div>
        <div className="space-y-2">
          {editedItems.slice(0, 20).map((item: any, i: number) => (
            <div key={i} className="border border-slate-200 rounded p-2 text-sm">
              <div className="font-medium text-slate-700">
                {item.condition || item.title || `Item ${i + 1}`}
              </div>
              {item.category && (
                <span className="text-xs text-slate-400">Category: {item.category}</span>
              )}
              {item.riskLevel && (
                <span className="text-xs text-slate-400 ml-2">Risk: {item.riskLevel}</span>
              )}
              {item.primaryTechnique && (
                <span className="text-xs text-slate-400 ml-2">Tech: {item.primaryTechnique}</span>
              )}
            </div>
          ))}
          {items.length > 20 && (
            <div className="text-xs text-slate-400 text-center py-2">
              + {items.length - 20} more items
            </div>
          )}
        </div>
        <div className="mt-3">
          <label className="text-xs text-slate-500 block mb-1">Feedback (optional)</label>
          <textarea
            value={feedback}
            onChange={e => setFeedback(e.target.value)}
            placeholder="Add review feedback..."
            className="w-full border border-slate-200 rounded p-2 text-xs resize-none h-16 focus:outline-none focus:border-blue-400"
          />
        </div>
      </div>
      <div className="border-t border-slate-200 p-3 flex gap-2">
        <button
          onClick={handleApprove}
          className="flex-1 py-1.5 bg-green-500 text-white text-sm rounded hover:bg-green-600"
        >
          Approve
        </button>
        <button
          onClick={handleEdit}
          className="flex-1 py-1.5 bg-blue-500 text-white text-sm rounded hover:bg-blue-600"
        >
          Edit & Continue
        </button>
        <button
          onClick={handleRetry}
          className="flex-1 py-1.5 bg-slate-500 text-white text-sm rounded hover:bg-slate-600"
        >
          Retry Agent
        </button>
      </div>
    </div>
  );
}

function CheckpointAutoPassedView({ node, agentLog }: { node: any; agentLog: any }) {
  const items = getCheckpointItems(node.id, agentLog);
  if (!items || items.length === 0) {
    return (
      <div className="p-4 text-sm text-slate-500">
        Auto-passed &mdash; no review needed for auto mode.
      </div>
    );
  }

  return (
    <div className="p-3 text-sm">
      <div className="flex items-center gap-1.5 text-green-600 text-xs font-medium mb-2">
        <CheckCircle2 size={14} /> Auto-approved ({items.length} items)
      </div>
      <div className="space-y-1 max-h-80 overflow-y-auto">
        {items.slice(0, 20).map((item: any, i: number) => (
          <div key={i} className="text-xs bg-white border border-slate-200 rounded px-2 py-1 text-slate-600">
            {item.title || item.condition || `Item ${i + 1}`}
          </div>
        ))}
        {items.length > 20 && (
          <div className="text-xs text-slate-400 text-center">+ {items.length - 20} more</div>
        )}
      </div>
    </div>
  );
}

function getCheckpointItems(checkpointId: string, agentLog: any): any[] | null {
  const output = agentLog?.output_data;
  if (!output) return null;
  if (checkpointId === 'checkpoint_1') return output.testConditions || null;
  if (checkpointId === 'checkpoint_2') return output.draftTestCases || null;
  if (checkpointId === 'checkpoint_3') return output.finalTestCases || null;
  return null;
}

function CompleteNodeView({ runSummary, generatedCases }: { runSummary: any; generatedCases: number }) {
  const cases = runSummary?.totalCases ?? generatedCases;
  const tokens = runSummary?.totalTokens ?? 0;
  const latency = runSummary?.totalLatencyMs ?? 0;
  const batches = runSummary?.totalBatches ?? 0;

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center gap-2 text-green-600">
        <CheckCircle2 size={18} />
        <span className="font-medium text-slate-800">Pipeline Complete</span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="bg-slate-50 rounded p-3 text-center">
          <div className="text-2xl font-bold text-slate-800">{cases}</div>
          <div className="text-xs text-slate-400">Test Cases</div>
        </div>
        <div className="bg-slate-50 rounded p-3 text-center">
          <div className="text-2xl font-bold text-slate-800">{batches}</div>
          <div className="text-xs text-slate-400">Batches</div>
        </div>
        <div className="bg-slate-50 rounded p-3 text-center">
          <div className="text-lg font-bold text-slate-800">{tokens.toLocaleString()}</div>
          <div className="text-xs text-slate-400">Total Tokens</div>
        </div>
        <div className="bg-slate-50 rounded p-3 text-center">
          <div className="text-lg font-bold text-slate-800">{latency > 0 ? `${(latency / 1000).toFixed(1)}s` : '-'}</div>
          <div className="text-xs text-slate-400">Total Time</div>
        </div>
      </div>

      {cases > 0 && (
        <div className="bg-blue-50 rounded p-3 text-xs text-blue-700 leading-relaxed">
          Successfully generated {cases} test case{cases !== 1 ? 's' : ''} across {batches} batch{batches !== 1 ? 'es' : ''}.
          Cases are saved to the project and available in NL Cases view.
        </div>
      )}
    </div>
  );
}

export function PipelineNodeDetail({
  node,
  agentLog,
  checkpointData,
  thinkingText,
  runSummary,
  onClose,
  onCheckpointAction,
}: NodeDetailProps) {
  if (!node) {
    return (
      <div className="w-96 border-l border-slate-200 bg-white shrink-0 flex items-center justify-center text-sm text-slate-400">
        Click a node to see details
      </div>
    );
  }

  const statusLabel = node.status === 'running' ? 'Running...' : node.status === 'waiting' ? 'Waiting for review' : node.status;
  const hasMeta = node.meta?.latencyMs || node.meta?.tokenUsage || node.meta?.totalCases;

  return (
    <div className="w-96 border-l border-slate-200 bg-white shrink-0 flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
        <div className="min-w-0">
          <h4 className="text-sm font-medium text-slate-800 truncate">{node.label}</h4>
          <div className="text-xs text-slate-400 mt-0.5 flex items-center gap-2 flex-wrap">
            <span>Status: {statusLabel}</span>
            {hasMeta && (
              <>
                {node.meta?.latencyMs && <span>&middot; {node.meta.latencyMs}ms</span>}
                {node.meta?.tokenUsage && <span>&middot; {node.meta.tokenUsage.toLocaleString()} tokens</span>}
                {node.meta?.totalCases > 0 && <span>&middot; {node.meta.totalCases} cases</span>}
              </>
            )}
          </div>
        </div>
        <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded shrink-0 ml-2">
          <X size={16} className="text-slate-400" />
        </button>
      </div>

      {node.type === 'agent' ? (
        <AgentDetailTabs agentLog={agentLog} node={node} thinkingText={thinkingText} />
      ) : node.type === 'checkpoint' && checkpointData && node.status === 'waiting' ? (
        <CheckpointDetailTabs
          checkpointData={checkpointData}
          onAction={(action, data) => onCheckpointAction?.(action, data)}
        />
      ) : node.type === 'checkpoint' ? (
        <CheckpointAutoPassedView node={node} agentLog={agentLog} />
      ) : node.type === 'complete' ? (
        <CompleteNodeView runSummary={runSummary} generatedCases={node.meta?.totalCases || 0} />
      ) : (
        <div className="p-4 text-sm text-slate-500">No detailed data available for this node.</div>
      )}
    </div>
  );
}