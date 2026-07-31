import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { RefreshCw, Trash2 } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useRequirements } from '@/shared/hooks/useQueryHooks';
import { useTestGenRun } from '@/shared/test-gen-run';
import { queryKeys } from '@/shared/hooks/queryKeys';
import { TestGenConfigPanel, type TestGenStartConfig } from './TestGenConfigPanel';
import { TestGenStepper } from './TestGenStepper';
import { TestGenDetailPanel } from './TestGenDetailPanel';
import { TestGenRunHistory } from './TestGenRunHistory';
import { AgentPromptsPanel } from './AgentPromptsPanel';
import { ConfirmModal } from '@/shared/ui/ConfirmModal';

type TabId = 'new' | 'runtime' | 'history' | 'prompts';

const TABS: { id: TabId; label: string }[] = [
  { id: 'new', label: 'New' },
  { id: 'runtime', label: 'Runtime' },
  { id: 'history', label: 'History' },
  { id: 'prompts', label: 'Agent Prompts' },
];

interface AiTestGenPageProps {
  currentProjectId: string | null;
}

export function AiTestGenPage({ currentProjectId }: AiTestGenPageProps) {
  const [activeTab, setActiveTab] = useState<TabId>('new');
  const [showAbortConfirm, setShowAbortConfirm] = useState(false);
  const [showRetryConfirm, setShowRetryConfirm] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const pipeline = useTestGenRun(currentProjectId, { detailPanelVisible: activeTab !== 'history' });
  const queryClient = useQueryClient();
  const checkpointEditedData = useRef<any>(null);
  const [reviewMode, setReviewMode] = useState(false);

  const { data: requirements = [] } = useRequirements(currentProjectId || '');
  const flowStories = useMemo(() => requirements.filter(r => r.isFlow), [requirements]);

const handleRefresh = useCallback(async () => {
    // Always refresh the runs list (history)
    await queryClient.invalidateQueries({ queryKey: queryKeys.testGen.runs(currentProjectId || '') });
    // If there's an active run, also refresh its data
    if (pipeline.runId) {
      await pipeline.refresh();
      // Also re-fetch agent logs for the current run
      await queryClient.invalidateQueries({ queryKey: queryKeys.testGen.logs(pipeline.runId) });
    }
  }, [pipeline, queryClient, currentProjectId]);

  const handleStart = useCallback(async (config: TestGenStartConfig) => {
    try {
      await pipeline.start({
        requirementIds: config.requirementIds,
        providerConfigName: config.providerConfigName,
        model: config.model,
        modelName: config.modelName,
        mode: config.mode,
        flowIds: config.flowIds,
        useCache: config.useCache,
        reasoningEffort: config.reasoningEffort,
        reasoningSummary: config.reasoningSummary,
        textVerbosity: config.textVerbosity,
        referenceRunIds: config.referenceRunIds,
      });
      setActiveTab('runtime');
    } catch {
      // error dispatched to reducer via SET_ERROR
    }
  }, [pipeline]);

  const handleDeleteRun = useCallback(async (runId: string) => {
    try {
      const { api } = await import('@/shared/services/api');
      await api.testGen.delete(runId);
      await queryClient.invalidateQueries({ queryKey: queryKeys.testGen.runs(currentProjectId || '') });
    } catch { /* best effort */ }
  }, [currentProjectId, queryClient]);

  const handleClear = useCallback(() => {
    pipeline.reset();
  }, [pipeline]);

  const handleAbort = useCallback(async () => {
    setShowAbortConfirm(false);
    await pipeline.abort();
  }, [pipeline]);

  const handleNodeClick = useCallback((nodeId: string) => {
    pipeline.selectNode(nodeId as any);
    pipeline.setAutoFollowEnabled(false);
  }, [pipeline]);

  const handleCloseDetail = useCallback(() => {
    pipeline.selectNode(null);
    pipeline.setAutoFollowEnabled(true);
  }, [pipeline]);

  const handleToggleAutoFollow = useCallback(() => {
    pipeline.setAutoFollowEnabled(!pipeline.autoFollowEnabled);
  }, [pipeline]);

  const handleApprove = useCallback(() => {
    if (!pipeline.runId) return;
    pipeline.resume('approve', { editedData: checkpointEditedData.current ?? undefined });
    setReviewMode(false);
  }, [pipeline]);

  const handleRetry = useCallback(async () => {
    if (!pipeline.runId) return;
    // If the pipeline has an error node, use the retry-from-checkpoint API
    const errorNode = pipeline.nodes.find((n: any) => n.status === 'error');
    if (errorNode) {
      setRetrying(true);
      pipeline.startRetry(errorNode.id); // Only reset the selected error node, keep preceding nodes completed
      try {
        const { api } = await import('@/shared/services/api');
        await api.testGen.retry(pipeline.runId);
        await queryClient.invalidateQueries({ queryKey: queryKeys.testGen.runs(currentProjectId || '') });
      } catch {
        // error surfaced via SSE
      } finally {
        setRetrying(false);
        setReviewMode(false);
      }
    } else {
      setRetrying(true);
      checkpointEditedData.current = null;
      try {
        await pipeline.resume('retry');
      } catch {
        // error surfaced via SSE pipeline:error
      } finally {
        setRetrying(false);
        setReviewMode(false);
      }
    }
  }, [pipeline, queryClient, currentProjectId]);

  const handleRetryFailedRun = useCallback(async (runId: string) => {
    try {
      const errorNode = pipeline.nodes.find((n: any) => n.status === 'error');
      if (errorNode) pipeline.startRetry(errorNode.id);
      const { api } = await import('@/shared/services/api');
      await api.testGen.retry(runId);
      await queryClient.invalidateQueries({ queryKey: queryKeys.testGen.runs(currentProjectId || '') });
    } catch {
      // best effort
    }
  }, [pipeline, queryClient, currentProjectId]);

  const handleToggleReview = useCallback(() => {
    setReviewMode(prev => !prev);
  }, []);

  const handleDoneReviewing = useCallback(async () => {
    if (pipeline.selectedNode?.kind === 'checkpoint' && checkpointEditedData.current && pipeline.runId) {
      const { api } = await import('@/shared/services/api');
      const nodeId = pipeline.selectedNode.id;
      const cpMap: Record<string, number> = {
        checkpoint_1: 1, checkpoint_2: 2, checkpoint_3: 3,
      };
      const cpNum = cpMap[nodeId];
      if (cpNum) {
        await api.testGen.saveCheckpointEdits(
          pipeline.runId,
          checkpointEditedData.current,
          cpNum,
        );
        await pipeline.refreshCheckpointData();
      }
    }
    setReviewMode(false);
  }, [pipeline]);

  const handleCheckpointDataChange = useCallback((data: any) => {
    checkpointEditedData.current = data;
  }, []);

  const handleSelectRun = useCallback(async (runId: string) => {
    await pipeline.loadRun(runId);
    setActiveTab('runtime');
  }, [pipeline]);

  // Debug: log pipeline state on node selection
  useEffect(() => {
    if (pipeline.selectedNode) {
      console.log(`[TestGen] node=${pipeline.selectedNode.id} kind=${pipeline.selectedNode.kind} checkpoint=${pipeline.checkpointData ? 'yes' : 'no'} agentLog=${pipeline.selectedAgentLog ? 'yes' : 'no'} logs=${pipeline.agentLogs.length}`);
    }
  }, [pipeline.selectedNode, pipeline.checkpointData, pipeline.selectedAgentLog, pipeline.agentLogs]);

  const selectedAgentLog = pipeline.selectedAgentLog;

  if (!currentProjectId) {
    return <div className="h-full flex items-center justify-center text-slate-400">Select a project to continue</div>;
  }

  return (
    <div className="h-full flex flex-col bg-white overflow-hidden">
      {/* Header bar */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-200 bg-white shrink-0">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wider">AI Test Gen</h2>
          {pipeline.error && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 border border-red-200 max-w-md truncate">
              {pipeline.error.message}
            </span>
          )}
          {pipeline.isRunning && (
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium border ${
              pipeline.isConnected ? 'bg-green-100 text-green-700 border-green-200' : 'bg-red-100 text-red-700 border-red-200'
            }`}>
              {pipeline.isConnected ? 'Connected' : 'Disconnected'}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleClear}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
            title="Clear current pipeline to start fresh"
          >
            <Trash2 size={14} />
            Clear
          </button>
          <button
            onClick={handleRefresh}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
            title="Refresh pipeline runs list and node status"
          >
            <RefreshCw size={14} />
            Refresh
          </button>
          {pipeline.isRunning && (
            <button
              onClick={() => setShowAbortConfirm(true)}
              className="px-3 py-1.5 text-xs font-medium rounded-lg border border-red-200 text-red-600 hover:bg-red-50 transition-colors"
            >
              Abort
            </button>
          )}
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex border-b border-slate-200 bg-white px-4 shrink-0">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 text-xs font-medium transition-colors ${
              activeTab === tab.id
                ? 'text-blue-600 border-b-2 border-blue-600 -mb-px'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'new' && (
          <TestGenConfigPanel
            projectId={currentProjectId}
            requirements={requirements}
            flowStories={flowStories}
            onStart={handleStart}
            disabled={pipeline.isRunning}
          />
        )}
        {activeTab === 'runtime' && (
          <div className="h-full flex overflow-hidden">
            <div className="w-80 shrink-0 h-full overflow-hidden border-r border-slate-200 bg-slate-50/60">
              <TestGenStepper
                nodes={pipeline.nodes as any}
                selectedNodeId={pipeline.selectedNodeId ?? null}
                onNodeClick={handleNodeClick}
                autoFollowEnabled={pipeline.autoFollowEnabled}
                onToggleAutoFollow={handleToggleAutoFollow}
                isRunning={pipeline.isRunning}
              />
            </div>
            <div className="flex-1 overflow-hidden">
              <TestGenDetailPanel
                runId={pipeline.runId}
                node={pipeline.selectedNode as any ?? null}
                agentLog={selectedAgentLog}
                checkpointData={pipeline.checkpointData}
                thinkingText={pipeline.thinkingText}
                runSummary={pipeline.runSummary}
                agentLogs={pipeline.agentLogs}
                startConfig={pipeline.startConfig}
                requirements={requirements}
                flowStories={flowStories}
                modelName={pipeline.modelName}
                onClose={handleCloseDetail}
                onApprove={handleApprove}
                onRetry={() => setShowRetryConfirm(true)}
                onToggleReview={handleToggleReview}
                onDoneReviewing={handleDoneReviewing}
                onCheckpointDataChange={handleCheckpointDataChange}
                isEditing={reviewMode}
                retrying={retrying}
              />
            </div>
          </div>
        )}
        {activeTab === 'history' && (
          <TestGenRunHistory
            runs={pipeline.runs}
            onSelect={handleSelectRun}
            onBack={() => setActiveTab('new')}
            onDeleteRun={handleDeleteRun}
            onRetryRun={handleRetryFailedRun}
          />
        )}
        {activeTab === 'prompts' && (
          <AgentPromptsPanel projectId={currentProjectId} />
        )}
      </div>

      <ConfirmModal
        isOpen={showAbortConfirm}
        onClose={() => setShowAbortConfirm(false)}
        onConfirm={handleAbort}
        title="Abort Test Gen?"
        message="This will stop the current test generation run. Generated test cases from completed batches will be preserved. This action cannot be undone."
        confirmLabel="Abort Test Gen"
        type="warning"
      />

      <ConfirmModal
        isOpen={showRetryConfirm}
        onClose={() => setShowRetryConfirm(false)}
        onConfirm={() => { setShowRetryConfirm(false); handleRetry(); }}
        title="Retry from last checkpoint?"
        message="The agent will re-run from the previous checkpoint with the same inputs. Any edits made during review will be lost."
        confirmLabel="Retry from last checkpoint"
        type="warning"
      />
    </div>
  );
}
