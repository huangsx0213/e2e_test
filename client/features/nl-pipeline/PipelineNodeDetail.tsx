import React, { useState, useEffect, useRef } from 'react';
import { X, Brain, Loader2 } from 'lucide-react';

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
  onClose: () => void;
  onCheckpointAction?: (action: 'approve' | 'edit' | 'retry', data?: any) => void;
}

function AgentDetailTabs({ agentLog, node, thinkingText }: { agentLog: any; node: any; thinkingText: string | null }) {
  const [activeTab, setActiveTab] = useState<'thinking' | 'input' | 'output' | 'trace' | 'errors'>('output');
  const thinkingRef = useRef<HTMLDivElement>(null);

  // Auto-scroll thinking content
  useEffect(() => {
    if (thinkingText && activeTab === 'thinking' && thinkingRef.current) {
      thinkingRef.current.scrollTop = thinkingRef.current.scrollHeight;
    }
  }, [thinkingText, activeTab]);

  // Switch to thinking tab when content arrives
  useEffect(() => {
    if (thinkingText && node?.status === 'running') {
      setActiveTab('thinking');
    }
  }, [thinkingText, node?.status]);

  const isRunning = node?.status === 'running';
  const tabs = ['thinking', 'input', 'output', 'trace', 'errors'] as const;

  return (
    <div className="flex flex-col h-full">
      <div className="flex border-b border-slate-200">
        {tabs.map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-3 py-2 text-xs font-medium capitalize border-b-2 transition-colors relative ${
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
      <div className="flex-1 overflow-y-auto p-3 text-sm">
        {activeTab === 'thinking' && (
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
        )}

        {activeTab === 'input' && (
          <div className="space-y-3">
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
          </div>
        )}

        {activeTab === 'output' && (
          <pre className="text-xs bg-slate-50 p-2 rounded whitespace-pre-wrap max-h-full overflow-y-auto">
            {agentLog?.output_data
              ? JSON.stringify(agentLog.output_data, null, 2)
              : 'No output data yet'}
          </pre>
        )}

        {activeTab === 'trace' && (
          <div className="space-y-1">
            {agentLog?.raw_trace?.map((entry: any, i: number) => (
              <div key={i} className="text-xs font-mono">
                <span className="text-slate-400">[{entry.timestamp}]</span>{' '}
                <span className="text-slate-700">{entry.message}</span>
              </div>
            )) || (
              <div className="text-xs text-slate-400">No trace data</div>
            )}
          </div>
        )}

        {activeTab === 'errors' && (
          <div className="text-xs text-slate-500">
            {agentLog?.status === 'FAILED' ? (
              <div className="text-red-600">Agent execution failed.</div>
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
  const items = checkpointData?.conditions || checkpointData?.cases || [];

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-3">
        <div className="text-xs text-slate-500 mb-2">
          {checkpointData?.conditions ? `${checkpointData.conditions.length} Test Conditions`
            : checkpointData?.cases ? `${checkpointData.cases.length} Cases`
            : 'No items'}
        </div>
        <div className="space-y-2">
          {items.slice(0, 20).map((item: any, i: number) => (
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
          onClick={() => onAction('approve', { feedback })}
          className="flex-1 py-1.5 bg-green-500 text-white text-sm rounded hover:bg-green-600"
        >
          Approve
        </button>
        <button
          onClick={() => onAction('edit', { feedback })}
          className="flex-1 py-1.5 bg-blue-500 text-white text-sm rounded hover:bg-blue-600"
        >
          Edit &amp; Continue
        </button>
        <button
          onClick={() => onAction('retry', { feedback })}
          className="flex-1 py-1.5 bg-slate-500 text-white text-sm rounded hover:bg-slate-600"
        >
          Retry Agent
        </button>
      </div>
    </div>
  );
}

export function PipelineNodeDetail({
  node,
  agentLog,
  checkpointData,
  thinkingText,
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
  const hasMeta = node.meta?.latencyMs || node.meta?.tokenUsage;

  return (
    <div className="w-96 border-l border-slate-200 bg-white shrink-0 flex flex-col">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
        <div>
          <h4 className="text-sm font-medium text-slate-800">{node.label}</h4>
          <div className="text-xs text-slate-400 mt-0.5 flex items-center gap-2">
            <span>Status: {statusLabel}</span>
            {hasMeta && (
              <>
                {node.meta?.latencyMs && <span>\u00B7 {node.meta.latencyMs}ms</span>}
                {node.meta?.tokenUsage && <span>\u00B7 {node.meta.tokenUsage.toLocaleString()} tokens</span>}
              </>
            )}
          </div>
        </div>
        <button onClick={onClose} className="p-1 hover:bg-slate-100 rounded">
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
        <div className="p-4 text-sm text-slate-500">
          {node.status === 'auto-passed' ? 'Auto-passed \u2014 no review needed for auto mode.' : 'Waiting for review data...'}
        </div>
      ) : (
        <div className="p-4 text-sm text-slate-500">No detailed data available for this node.</div>
      )}
    </div>
  );
}