import { useState, useCallback, useEffect } from 'react';
import { History, Plus, RefreshCw } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useRequirements, useBusinessFlows } from '@/shared/hooks/useQueryHooks';
import { usePipelineRun } from '@/shared/pipeline-run';
import { queryKeys } from '@/shared/hooks/queryKeys';
import { PipelineConfigPanel, type PipelineStartConfig } from './PipelineConfigPanel';
import { PipelineStepper } from './PipelineStepper';
import { PipelineDetailPanel } from './PipelineDetailPanel';
import { PipelineRunHistory } from './PipelineRunHistory';
import { ConfirmModal } from '@/shared/ui/ConfirmModal';

interface AiPipelinePageProps {
  currentProjectId: string | null;
}

export function AiPipelinePage({ currentProjectId }: AiPipelinePageProps) {
  const [view, setView] = useState<'config' | 'history'>('config');
  const [showAbortConfirm, setShowAbortConfirm] = useState(false);
  const pipeline = usePipelineRun(currentProjectId);
  const queryClient = useQueryClient();

  const { data: requirements = [] } = useRequirements(currentProjectId || '');
  const { data: businessFlows = [] } = useBusinessFlows(currentProjectId || '');

const handleRefresh = useCallback(async () => {
    await pipeline.refresh();
    // Trigger refetch of agent logs
    await queryClient.invalidateQueries({ queryKey: queryKeys.pipeline.logs(pipeline.runId || '') });
  }, [pipeline, queryClient]);

  const handleStart = useCallback(async (config: PipelineStartConfig) => {
    try {
      await pipeline.start({
        requirementIds: config.requirementIds,
        providerConfigName: config.providerConfigName,
        mode: config.mode,
      });
    } catch {
      // error dispatched to reducer via SET_ERROR
    }
  }, [pipeline]);

  const handleDeleteRun = useCallback(async (runId: string) => {
    try {
      const { api } = await import('@/shared/services/api');
      await api.pipeline.delete(runId);
    } catch { /* best effort */ }
  }, []);

  const handleAbort = useCallback(async () => {
    setShowAbortConfirm(false);
    await pipeline.abort();
  }, [pipeline]);

  const handleNodeClick = useCallback((nodeId: string) => {
    pipeline.selectNode(nodeId as any);
  }, [pipeline]);

  const handleCloseDetail = useCallback(() => {
    pipeline.selectNode(null);
  }, [pipeline]);

  const handleToggleAutoFollow = useCallback(() => {
    pipeline.setAutoFollowEnabled(!pipeline.autoFollowEnabled);
  }, [pipeline]);

  const handleCheckpointAction = useCallback((action: any, data?: any) => {
    pipeline.resume(action, data);
  }, [pipeline]);

  // Debug: log pipeline state on node selection
  useEffect(() => {
    if (pipeline.selectedNode) {
      console.log('[Pipeline] Selected node:', pipeline.selectedNode.id, 'kind:', pipeline.selectedNode.kind);
      console.log('[Pipeline] checkpointData:', pipeline.checkpointData ? 'has data' : 'null');
      console.log('[Pipeline] selectedAgentLog:', pipeline.selectedAgentLog ? 'has log' : 'null');
      console.log('[Pipeline] agentLogs count:', pipeline.agentLogs.length);
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
          <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wider">AI Pipeline</h2>
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
          {pipeline.runId && (
            <button
              onClick={handleRefresh}
              disabled={!pipeline.runId}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50"
              title="Refresh node status and content"
            >
              <RefreshCw size={14} />
              Refresh
            </button>
          )}
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
        <PipelineRunHistory
          runs={pipeline.runs}
          onSelect={() => setView('config')}
          onBack={() => setView('config')}
          onDeleteRun={handleDeleteRun}
        />
      ) : (
        <div className="flex-1 flex overflow-hidden">
          <PipelineConfigPanel
            requirements={requirements}
            businessFlows={businessFlows}
            onStart={handleStart}
            disabled={pipeline.isRunning}
          />
          <div className="flex-1 flex flex-col overflow-hidden">
            <PipelineStepper
              nodes={pipeline.nodes as any}
              selectedNodeId={pipeline.selectedNodeId ?? null}
              onNodeClick={handleNodeClick}
              autoFollowEnabled={pipeline.autoFollowEnabled}
              onToggleAutoFollow={handleToggleAutoFollow}
              isRunning={pipeline.isRunning}
            />
            <div className="flex-1 overflow-hidden">
              <PipelineDetailPanel
                node={pipeline.selectedNode as any ?? null}
                agentLog={selectedAgentLog}
                checkpointData={pipeline.checkpointData}
                thinkingText={pipeline.thinkingText}
                runSummary={pipeline.runSummary}
                onClose={handleCloseDetail}
                onCheckpointAction={handleCheckpointAction}
              />
            </div>
          </div>
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
