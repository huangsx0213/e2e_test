import React, { useState, useCallback, useRef } from 'react';
import { History, Plus } from 'lucide-react';
import { useRequirements, useBusinessFlows, usePipelineRuns, useCheckpoint, useAgentLogs } from '../../shared/hooks/useQueryHooks';
import { usePipelineSSE } from '../../shared/hooks/usePipelineSSE';
import { api } from '@/shared/services/api';
import { PipelineConfigPanel, type PipelineStartConfig } from './PipelineConfigPanel';
import { PipelineFlowCanvas } from './PipelineFlowCanvas';
import { PipelineNodeDetail } from './PipelineNodeDetail';
import { PipelineRunHistory } from './PipelineRunHistory';
import { ConfirmModal } from '../../shared/ui/ConfirmModal';

interface AiPipelinePageProps {
  currentProjectId: string | null;
}

interface PipelineNodeState {
  id: string;
  label: string;
  type: 'preparation' | 'agent' | 'checkpoint' | 'complete';
  agentName?: string;
  subSteps?: { label: string; done: boolean; running?: boolean }[];
  status: 'pending' | 'running' | 'waiting' | 'done' | 'error' | 'auto-passed';
  meta?: { tokenUsage?: number; latencyMs?: number; outputCount?: number; outputLabel?: string; errorMessage?: string };
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

const agentNodeIds = new Set(PIPELINE_NODES.filter(n => n.type === 'agent').map(n => n.id));

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
  const [error, setError] = useState<string | null>(null);
  const [showAbortConfirm, setShowAbortConfirm] = useState(false);
  const [thinkingText, setThinkingText] = useState<string | null>(null);
  const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data: requirements = [] } = useRequirements(currentProjectId || '');
  const { data: businessFlows = [] } = useBusinessFlows(currentProjectId || '');
  const { data: runs = [], refetch: refetchRuns } = usePipelineRuns(currentProjectId || '');
  const { data: checkpoint } = useCheckpoint(activeRunId || '');
  const { data: agentLogs = [] } = useAgentLogs(activeRunId || '', selectedNodeId?.replace('agent_', '') || undefined);

  const showError = useCallback((msg: string) => {
    setError(msg);
    if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
    errorTimerRef.current = setTimeout(() => setError(null), 8000);
  }, []);

  const handleSSEEvent = useCallback((event: any) => {
    setNodeStates((prev: PipelineNodeState[]) => prev.map((node: PipelineNodeState) => {
      switch (event.type) {
        case 'agent:start': {
          const nodeId = `agent_${event.data.agentName}`;
          if (node.id === nodeId) {
            return { ...node, status: 'running' as const, subSteps: node.subSteps?.map(s => ({ ...s, done: false })) };
          }
          // Mark preceding nodes as done
          const nodeIndex = prev.findIndex(n => n.id === nodeId);
          if (prev.indexOf(node) < nodeIndex && node.type !== 'complete') {
            return { ...node, status: 'done' as const };
          }
          return node;
        }
        case 'agent:complete':
          if (node.id === `agent_${event.data.agentName}`) {
            return {
              ...node,
              status: 'done' as const,
              meta: {
                outputCount: event.data.outputCount || 0,
                outputLabel: event.data.outputSummary || '',
                tokenUsage: event.data.tokenUsage,
                latencyMs: event.data.latencyMs,
              },
            };
          }
          return node;
        case 'agent:step':
          if (node.id === `agent_${event.data.agentName}` && node.subSteps) {
            return {
              ...node,
              subSteps: node.subSteps.map((s, i) => ({
                ...s,
                done: i < event.data.stepIndex,
                running: i === event.data.stepIndex,
              })),
            };
          }
          return node;
        case 'agent:thinking':
          if (node.id === `agent_${event.data.agentName}`) {
            setThinkingText(event.data.text);
          }
          return node;
        case 'checkpoint:waiting': {
          const cpId = `checkpoint_${event.data.checkpointNumber}`;
          setCheckpointData(event.data.payload);
          // Auto-select the checkpoint node
          setSelectedNodeId(cpId);
          if (node.id === cpId) {
            return { ...node, status: 'waiting' as const };
          }
          return node;
        }
        case 'checkpoint:resolved': {
          const cpId = `checkpoint_${event.data.checkpointNumber}`;
          setCheckpointData(null);
          setThinkingText(null);
          if (node.id === cpId) {
            return { ...node, status: 'done' as const };
          }
          return node;
        }
        case 'batch:start':
          setBatch(event.data.batch);
          setTotalBatches(event.data.total);
          return node;
        case 'batch:complete':
          setGeneratedCases(prev => prev + (event.data.testCases || 0));
          return node;
        case 'pipeline:complete':
          setIsRunning(false);
          setThinkingText(null);
          setNodeStates((prev2: PipelineNodeState[]) => prev2.map(n => ({
            ...n,
            status: n.status === 'pending' ? 'done' as const : n.status,
          })));
          setGeneratedCases(event.data.stats?.totalCases || 0);
          refetchRuns();
          return node;
        case 'pipeline:error':
          showError(event.data.message || 'Pipeline error');
          // Mark current batch node in error if recoverable
          return node;
        default:
          return node;
      }
    }));
  }, [refetchRuns, showError]);

  const { start: startSSE, stop: stopSSE, isConnected: isSSEConnected } = usePipelineSSE({
    projectId: currentProjectId,
    config: isRunning ? {} : null,
    onEvent: handleSSEEvent,
  });

  // Auto-follow: when a node becomes running or waiting, switch to viewing it
  const nodeStatesRef = useRef(nodeStates);
  nodeStatesRef.current = nodeStates;
  const autoFollowRef = useRef(true);

  const findActiveNode = useCallback((states: PipelineNodeState[]) => {
    const active = states.find(n => n.status === 'running' || n.status === 'waiting');
    return active?.id || null;
  }, []);

  // Watch node states and auto-select running/waiting nodes
  React.useEffect(() => {
    if (!isRunning || !autoFollowRef.current) return;
    const activeId = findActiveNode(nodeStates);
    if (activeId && activeId !== selectedNodeId) {
      setSelectedNodeId(activeId);
    }
  }, [nodeStates, isRunning, selectedNodeId, findActiveNode]);

  const handleNodeClick = useCallback((nodeId: string) => {
    autoFollowRef.current = false;
    setSelectedNodeId(prev => prev === nodeId ? null : nodeId);
    // Re-enable auto-follow after 30s of manual interaction
    setTimeout(() => { autoFollowRef.current = true; }, 30000);
  }, []);

  const handleStart = useCallback(async (config: PipelineStartConfig) => {
    setNodeStates(PIPELINE_NODES.map(n => ({
      ...n,
      status: 'pending' as PipelineNodeState['status'],
      subSteps: n.subSteps?.map(s => ({ ...s, done: false, running: false })),
    })));
    setBatch(0);
    setTotalBatches(0);
    setGeneratedCases(0);
    setIsRunning(true);
    setSelectedNodeId(null);
    setCheckpointData(null);
    setRunMode(config.mode);
    setError(null);
    setThinkingText(null);
    autoFollowRef.current = true;

    try {
      const { runId } = await api.pipeline.start(currentProjectId!, config);
      setActiveRunId(runId);
      startSSE();
    } catch (err: any) {
      setIsRunning(false);
      showError('Failed to start pipeline: ' + (err.message || 'Unknown error'));
    }
  }, [currentProjectId, startSSE, showError]);

  const handleCheckpointAction = useCallback(async (action: 'approve' | 'edit' | 'retry', data?: any) => {
    if (!activeRunId) return;
    try {
      await api.pipeline.resume(activeRunId, { action, feedback: data?.feedback });
      setCheckpointData(null);
    } catch (err: any) {
      showError('Failed to ' + action + ': ' + (err.message || 'Unknown error'));
    }
  }, [activeRunId, showError]);

  const handleAbort = useCallback(async () => {
    setShowAbortConfirm(false);
    if (!activeRunId) return;
    try {
      await api.pipeline.abort(activeRunId);
      stopSSE();
      setIsRunning(false);
      setThinkingText(null);
      refetchRuns();
    } catch (err: any) {
      showError('Failed to abort: ' + (err.message || 'Unknown error'));
    }
  }, [activeRunId, stopSSE, refetchRuns, showError]);

  const handleSelectHistoryRun = useCallback((_runId: string) => {
    setView('config');
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
        <div className="flex gap-2 items-center">
          {error && (
            <span className="text-xs px-2 py-1 rounded bg-red-100 text-red-700 animate-in fade-in max-w-md truncate">
              {error}
            </span>
          )}
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
            isRunning={isRunning}
            onAbort={() => setShowAbortConfirm(true)}
            onCheckpointAction={runMode === 'interactive' ? handleCheckpointAction : undefined}
          />
          <PipelineNodeDetail
            node={selectedNode}
            agentLog={agentLog}
            checkpointData={checkpointData}
            thinkingText={thinkingText}
            onClose={() => { setSelectedNodeId(null); autoFollowRef.current = false; }}
            onCheckpointAction={handleCheckpointAction}
          />
        </div>
      )}

      <ConfirmModal
        isOpen={showAbortConfirm}
        onClose={() => setShowAbortConfirm(false)}
        onConfirm={handleAbort}
        title="Abort Pipeline?"
        message="This will stop the current pipeline run. Generated test cases from completed batches will be preserved. This action cannot be undone."
        confirmLabel="Abort Pipeline"
        type="warning"
      />
    </div>
  );
}