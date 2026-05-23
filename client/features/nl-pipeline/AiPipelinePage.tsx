import React, { useState, useCallback } from 'react';
import { History, Plus } from 'lucide-react';
import { useRequirements, useBusinessFlows, usePipelineRuns, useCheckpoint, useAgentLogs } from '../../shared/hooks/useQueryHooks';
import { usePipelineSSE } from '../../shared/hooks/usePipelineSSE';
import { api } from '@/shared/services/api';
import { PipelineConfigPanel, type PipelineStartConfig } from './PipelineConfigPanel';
import { PipelineFlowCanvas } from './PipelineFlowCanvas';
import { PipelineNodeDetail } from './PipelineNodeDetail';
import { PipelineRunHistory } from './PipelineRunHistory';

interface AiPipelinePageProps {
  currentProjectId: string | null;
}

interface PipelineNodeState {
  id: string;
  label: string;
  type: 'preparation' | 'agent' | 'checkpoint' | 'complete';
  agentName?: string;
  subSteps?: { label: string; done: boolean }[];
  status: 'pending' | 'running' | 'waiting' | 'done' | 'error' | 'auto-passed';
  meta?: { tokenUsage?: number; latencyMs?: number; outputCount?: number; outputLabel?: string };
}

const PIPELINE_NODES: PipelineNodeState[] = [
  { id: 'preparation', label: 'Preparation', type: 'preparation', status: 'pending' },
  { id: 'agent_test_analyst', label: 'Test Analyst', type: 'agent', agentName: 'test_analyst', status: 'pending',
    subSteps: [
      { label: 'Assess risk & priority', done: false },
      { label: 'Extract test conditions', done: false },
      { label: 'Select ISTQB techniques', done: false },
    ] },
  { id: 'checkpoint_1', label: 'Review Conditions', type: 'checkpoint', status: 'pending' },
  { id: 'agent_test_designer', label: 'Test Designer', type: 'agent', agentName: 'test_designer', status: 'pending',
    subSteps: [
      { label: 'Design test cases', done: false },
      { label: 'Apply test techniques', done: false },
      { label: 'Self-review quality', done: false },
    ] },
  { id: 'checkpoint_2', label: 'Review Drafts', type: 'checkpoint', status: 'pending' },
  { id: 'agent_quality_manager', label: 'Quality Manager', type: 'agent', agentName: 'quality_manager', status: 'pending',
    subSteps: [
      { label: 'Review 6 dimensions', done: false },
      { label: 'Merge human feedback', done: false },
      { label: 'Generate coverage matrix', done: false },
    ] },
  { id: 'checkpoint_3', label: 'Final Review', type: 'checkpoint', status: 'pending' },
  { id: 'complete', label: 'Complete', type: 'complete', status: 'pending' },
];

export function AiPipelinePage({ currentProjectId }: AiPipelinePageProps) {
  const [view, setView] = useState<'config' | 'history'>('config');
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [nodeStates, setNodeStates] = useState<PipelineNodeState[]>(PIPELINE_NODES.map(n => ({ ...n })));
  const [batch, setBatch] = useState(0);
  const [totalBatches, setTotalBatches] = useState(0);
  const [generatedCases, setGeneratedCases] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [checkpointData, setCheckpointData] = useState<any>(null);
  const [runMode, setRunMode] = useState<'auto' | 'interactive'>('auto');

  const { data: requirements = [] } = useRequirements(currentProjectId || '');
  const { data: businessFlows = [] } = useBusinessFlows(currentProjectId || '');
  const { data: runs = [], refetch: refetchRuns } = usePipelineRuns(currentProjectId || '');
  const { data: checkpoint } = useCheckpoint(activeRunId || '');
  const { data: agentLogs = [] } = useAgentLogs(activeRunId || '', selectedNodeId?.replace('agent_', '') || undefined);

  const handleSSEEvent = useCallback((event: any) => {
    setNodeStates((prev: PipelineNodeState[]) => prev.map((node: PipelineNodeState) => {
      switch (event.type) {
        case 'agent:start':
          if (node.id === `agent_${event.data.agentName}`) {
            return { ...node, status: 'running' as const, subSteps: node.subSteps?.map(s => ({ ...s, done: false })) };
          }
          return node;
        case 'agent:complete':
          if (node.id === `agent_${event.data.agentName}`) {
            return { ...node, status: 'done' as const, meta: { outputCount: 0, outputLabel: event.data.outputSummary } };
          }
          return node;
        case 'checkpoint:waiting':
          if (node.id === `checkpoint_${event.data.checkpointNumber}`) {
            return { ...node, status: 'waiting' as const };
          }
          setCheckpointData(event.data.payload);
          return node;
        case 'checkpoint:resolved':
          if (node.id === `checkpoint_${event.data.checkpointNumber}`) {
            return { ...node, status: 'done' as const };
          }
          setCheckpointData(null);
          return node;
        case 'batch:start':
          setBatch(event.data.batch);
          setTotalBatches(event.data.total);
          return node;
        case 'batch:complete':
          setGeneratedCases(prev => prev + (event.data.testCases || 0));
          return node;
        case 'pipeline:complete':
          setIsRunning(false);
          setNodeStates((prev: PipelineNodeState[]) => prev.map(n => {
            if (n.id === 'complete') return { ...n, status: 'done' as const };
            return { ...n, status: n.status === 'pending' ? 'done' as const : n.status };
          }));
          setGeneratedCases(event.data.stats?.totalCases || 0);
          refetchRuns();
          return node;
        case 'pipeline:error':
          return node;
        default:
          return node;
      }
    }));
  }, [refetchRuns]);

  const { start: startSSE, stop: stopSSE, isConnected: isSSEConnected } = usePipelineSSE({
    projectId: currentProjectId,
    config: isRunning ? {} : null,
    onEvent: handleSSEEvent,
  });

  const handleStart = useCallback(async (config: PipelineStartConfig) => {
    setNodeStates(PIPELINE_NODES.map(n => ({
      ...n,
      status: 'pending' as PipelineNodeState['status'],
      subSteps: n.subSteps?.map(s => ({ ...s, done: false })),
    })));
    setBatch(0);
    setTotalBatches(0);
    setGeneratedCases(0);
    setIsRunning(true);
    setSelectedNodeId(null);
    setCheckpointData(null);
    setRunMode(config.mode);

    try {
      const { runId } = await api.pipeline.start(currentProjectId!, config);
      setActiveRunId(runId);
      // Trigger SSE connection
      startSSE();
    } catch (err: any) {
      setIsRunning(false);
    }
  }, [currentProjectId, startSSE]);

  const handleNodeClick = useCallback((nodeId: string) => {
    setSelectedNodeId(prev => prev === nodeId ? null : nodeId);
  }, []);

  const handleCheckpointAction = useCallback(async (action: 'approve' | 'edit' | 'retry', data?: any) => {
    if (!activeRunId) return;
    try {
      await api.pipeline.resume(activeRunId, { action, feedback: data?.feedback });
      setCheckpointData(null);
    } catch (err: any) {
      alert('Failed: ' + err.message);
    }
  }, [activeRunId]);

  const handleAbort = useCallback(async () => {
    if (!activeRunId) return;
    try {
      await api.pipeline.abort(activeRunId);
      stopSSE();
      setIsRunning(false);
      refetchRuns();
    } catch (err: any) {
      alert('Failed to abort: ' + err.message);
    }
  }, [activeRunId, stopSSE, refetchRuns]);

  const handleSelectHistoryRun = useCallback((_runId: string) => {
    setView('config');
    // For now, we just switch back — full history detail view is future work
  }, []);

  const selectedNode = selectedNodeId
    ? nodeStates.find(n => n.id === selectedNodeId)
    : null;

  const agentLog = selectedNode?.agentName && agentLogs.length > 0
    ? agentLogs.find((l: any) => l.agent_name === selectedNode.agentName)
    : null;

  if (!currentProjectId) {
    return <div className="h-full flex items-center justify-center text-slate-400">Select a project to continue</div>;
  }

  return (
    <div className="h-full flex flex-col bg-slate-50 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 bg-white shrink-0">
        <h2 className="text-base font-semibold text-slate-800">AI Pipeline</h2>
        <div className="flex gap-2">
          {isRunning && (
            <span className={`text-xs px-2 py-1 rounded ${isSSEConnected ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
              {isSSEConnected ? 'Connected' : 'Disconnected'}
            </span>
          )}
          <button
            onClick={() => setView(view === 'history' ? 'config' : 'history')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded border transition-colors ${
              view === 'history'
                ? 'bg-blue-50 border-blue-200 text-blue-700'
                : 'border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            {view === 'history' ? <Plus size={14} /> : <History size={14} />}
            {view === 'history' ? 'New Run' : 'History'}
          </button>
        </div>
      </div>

      {view === 'history' ? (
        <PipelineRunHistory
          runs={runs}
          onSelect={handleSelectHistoryRun}
          onBack={() => setView('config')}
        />
      ) : (
        <div className="flex-1 flex overflow-hidden">
          <PipelineConfigPanel
            requirements={requirements}
            businessFlows={businessFlows}
            onStart={handleStart}
            disabled={isRunning}
          />
          <PipelineFlowCanvas
            nodes={nodeStates}
            batch={batch}
            totalBatches={totalBatches}
            generatedCases={generatedCases}
            onNodeClick={handleNodeClick}
            selectedNodeId={selectedNodeId}
            onAbort={handleAbort}
            isRunning={isRunning}
            onCheckpointAction={runMode === 'interactive' ? handleCheckpointAction : undefined}
          />
          <PipelineNodeDetail
            node={selectedNode}
            agentLog={agentLog}
            checkpointData={checkpointData}
            onClose={() => setSelectedNodeId(null)}
            onCheckpointAction={handleCheckpointAction}
          />
        </div>
      )}
    </div>
  );
}