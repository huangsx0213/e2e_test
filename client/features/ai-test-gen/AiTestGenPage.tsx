import { useState, useCallback, useEffect, useRef } from 'react';
import { History, Plus, RefreshCw, Trash2, Eye, Check } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useRequirements, useBusinessFlows } from '@/shared/hooks/useQueryHooks';
import { useTestGenRun } from '@/shared/test-gen-run';
import { queryKeys } from '@/shared/hooks/queryKeys';
import { TestGenConfigPanel, type TestGenStartConfig } from './TestGenConfigPanel';
import { TestGenStepper } from './TestGenStepper';
import { TestGenDetailPanel } from './TestGenDetailPanel';
import { TestGenRunHistory } from './TestGenRunHistory';
import { ConfirmModal } from '@/shared/ui/ConfirmModal';

interface AiTestGenPageProps {
  currentProjectId: string | null;
}

export function AiTestGenPage({ currentProjectId }: AiTestGenPageProps) {
  const [view, setView] = useState<'config' | 'history'>('config');
  const [showAbortConfirm, setShowAbortConfirm] = useState(false);
  const pipeline = useTestGenRun(currentProjectId);
  const queryClient = useQueryClient();
  const checkpointEditedData = useRef<any>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [reviewMode, setReviewMode] = useState(false);
  const isCheckpointSelected = pipeline.selectedNode?.kind === 'checkpoint';
  const hideButtonArea = isCheckpointSelected && !reviewMode;

  const { data: requirements = [] } = useRequirements(currentProjectId || '');
  const { data: businessFlows = [] } = useBusinessFlows(currentProjectId || '');

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
        mode: config.mode,
        businessFlowIds: config.flowIds,
        includeFlowCases: config.includeFlowCases,
        useCache: config.useCache,
      });
    } catch {
      // error dispatched to reducer via SET_ERROR
    }
  }, [pipeline]);

  const handleDeleteRun = useCallback(async (runId: string) => {
    try {
      const { api } = await import('@/shared/services/api');
      await api.pipeline.delete(runId);
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

const handleCheckpointAction = useCallback((action: any, data?: any) => {
  if (action === 'continue') {
    pipeline.resume('edit', data);
  } else {
    pipeline.resume(action, data);
  }
}, [pipeline]);

  const handleToggleReview = useCallback(() => {
    setReviewMode(prev => !prev);
  }, []);

  const handleCheckpointDataChange = useCallback((data: any) => {
    checkpointEditedData.current = data;
    if (saved) setSaved(false);
  }, [saved]);

  const handleExitReview = useCallback(() => {
    setReviewMode(false);
  }, []);

  const handleSaveCheckpoint = useCallback(async () => {
    if (!pipeline.runId || !checkpointEditedData.current) return;
    setSaving(true);
    try {
      const { api } = await import('@/shared/services/api');
      const nodeId = pipeline.selectedNode?.id;
      const agentMap: Record<string, string> = {
        checkpoint_1: 'test_analyst',
        checkpoint_2: 'test_designer',
        checkpoint_3: 'quality_manager',
      };
      const agentName = nodeId ? agentMap[nodeId] : undefined;
      const fieldMap: Record<string, string> = {
        checkpoint_1: 'testConditions',
        checkpoint_2: 'draftTestCases',
        checkpoint_3: 'finalTestCases',
      };
      const field = nodeId ? fieldMap[nodeId] : undefined;
      if (agentName && field) {
        await api.pipeline.saveCheckpointEdits(pipeline.runId, { [field]: checkpointEditedData.current }, agentName);
      }
      setSaved(true);
      setReviewMode(false);
    } finally {
      setSaving(false);
    }
  }, [pipeline.runId, pipeline.selectedNode]);

  const checkpointCompleted = pipeline.nodes.some(n => n.status === 'completed' || n.status === 'auto-passed') && pipeline.selectedNode?.kind === 'checkpoint';

  const handleSelectRun = useCallback(async (runId: string) => {
    await pipeline.loadRun(runId);
    setView('config');
  }, [pipeline]);

  // Debug: log pipeline state on node selection
  useEffect(() => {
    if (pipeline.selectedNode) {
      console.log('[TestGen] Selected node:', pipeline.selectedNode.id, 'kind:', pipeline.selectedNode.kind);
      console.log('[TestGen] checkpointData:', pipeline.checkpointData ? 'has data' : 'null');
      console.log('[TestGen] selectedAgentLog:', pipeline.selectedAgentLog ? 'has log' : 'null');
      console.log('[TestGen] agentLogs count:', pipeline.agentLogs.length);
    }
  }, [pipeline.selectedNode, pipeline.checkpointData, pipeline.selectedAgentLog, pipeline.agentLogs]);

  const selectedAgentLog = pipeline.selectedAgentLog;

  if (!currentProjectId) {
    return <div className="h-full flex items-center justify-center text-slate-400">Select a project to continue</div>;
  }

  return (
    <div className="h-full flex flex-col bg-slate-50 overflow-hidden">
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
          {isCheckpointSelected && (
            <button
              onClick={handleToggleReview}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                reviewMode
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100'
                  : 'border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
              title={reviewMode ? 'Exit editing mode' : 'Review and edit checkpoint output'}
            >
              {reviewMode ? <Check size={14} /> : <Eye size={14} />}
              {reviewMode ? 'Done Reviewing' : 'Review'}
            </button>
          )}
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
          <button
            onClick={() => setView(view === 'history' ? 'config' : 'history')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
              view === 'history'
                ? 'bg-blue-50 border-blue-200 text-blue-700'
                : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            {view === 'history' ? <Plus size={14} /> : <History size={14} />}
            {view === 'history' ? 'New Run' : 'History'}
          </button>
        </div>
      </div>

      {view === 'history' ? (
        <TestGenRunHistory
          runs={pipeline.runs}
          onSelect={handleSelectRun}
          onBack={() => setView('config')}
          onDeleteRun={handleDeleteRun}
        />
      ) : (
        <div className="flex-1 flex overflow-hidden">
          <TestGenConfigPanel
            requirements={requirements}
            businessFlows={businessFlows}
            onStart={handleStart}
            disabled={pipeline.isRunning}
            checkpointWaiting={pipeline.nodes.some(n => n.status === 'waiting')}
            onContinue={() => { pipeline.resume('edit', { editedData: checkpointEditedData.current }); handleExitReview(); }} 
            checkpointCompleted={checkpointCompleted}
            onSave={handleSaveCheckpoint}
            saving={saving}
            saved={saved}
            hideButtonArea={hideButtonArea}
          />
          <div className="flex-1 flex flex-col overflow-hidden">
            <TestGenStepper
              nodes={pipeline.nodes as any}
              selectedNodeId={pipeline.selectedNodeId ?? null}
              onNodeClick={handleNodeClick}
              autoFollowEnabled={pipeline.autoFollowEnabled}
              onToggleAutoFollow={handleToggleAutoFollow}
              isRunning={pipeline.isRunning}
            />
            <div className="flex-1 overflow-hidden">
        <TestGenDetailPanel
          node={pipeline.selectedNode as any ?? null}
          agentLog={selectedAgentLog}
          checkpointData={pipeline.checkpointData}
          thinkingText={pipeline.thinkingText}
          runSummary={pipeline.runSummary}
          agentLogs={pipeline.agentLogs}
          onClose={handleCloseDetail}
          onCheckpointAction={handleCheckpointAction}
          onCheckpointDataChange={handleCheckpointDataChange}
          reviewMode={reviewMode}
        />
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        isOpen={showAbortConfirm}
        onClose={() => setShowAbortConfirm(false)}
        onConfirm={handleAbort}
        title="Abort Test Gen?"
        message="This will stop the current test generation run. Generated test cases from completed batches will be preserved. This action cannot be undone."
        confirmLabel="Abort Test Gen"
        type="warning"
      />
    </div>
  );
}
