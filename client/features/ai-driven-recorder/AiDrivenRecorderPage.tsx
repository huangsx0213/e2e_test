/**
 * AiDrivenRecorderPage — AI 驱动录制主页面
 *
 * 参考 AiTestGenPage 的 tab 布局：New / Runtime / History
 * 入口：NlCasesPage 的 "AI Record" 按钮，或侧边栏直接访问。
 */

import { useState, useCallback, useEffect } from 'react';
import { RefreshCw, Trash2, StopCircle } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useNlCases, useProviderConfigs } from '@/shared/hooks/useQueryHooks';
import { queryKeys } from '@/shared/hooks/queryKeys';
import { api } from '@/shared/services/api';
import { useAiDrivenRecorderRun } from '@/shared/ai-driven-recorder-run';
import { ConfirmModal } from '@/shared/ui/ConfirmModal';
import { RecorderConfigPanel } from './RecorderConfigPanel';
import { RecorderRuntimePanel } from './RecorderRuntimePanel';
import { RecorderRunHistory } from './RecorderRunHistory';

type TabId = 'new' | 'runtime' | 'history';

const TABS: { id: TabId; label: string }[] = [
  { id: 'new', label: 'New' },
  { id: 'runtime', label: 'Runtime' },
  { id: 'history', label: 'History' },
];

interface AiDrivenRecorderPageProps {
  currentProjectId: string | null;
  /** 从 NlCasesPage 跳转时传入的预选 NlCase ID */
  preselectNlCaseId?: string | null;
  /** 跳转到 TestBuilder 的回调 */
  onNavigateToTestBuilder?: (suiteId: string, caseId: string) => void;
}

export function AiDrivenRecorderPage({
  currentProjectId,
  preselectNlCaseId,
  onNavigateToTestBuilder,
}: AiDrivenRecorderPageProps) {
  const [activeTab, setActiveTab] = useState<TabId>('new');
  const [showAbortConfirm, setShowAbortConfirm] = useState(false);
  const [takeoverPending, setTakeoverPending] = useState(false);
  const [history, setHistory] = useState<any[]>([]);
  const queryClient = useQueryClient();

  const { state, isRunning, start, abort, reset, loadRun } = useAiDrivenRecorderRun(
    currentProjectId,
    { preselectNlCaseId },
  );

  const { data: nlCases = [] } = useNlCases(currentProjectId || '');
  const { data: providerConfigs = [] } = useProviderConfigs();

  // 加载历史
  const refreshHistory = useCallback(async () => {
    if (!currentProjectId) return;
    try {
      const runs = await api.aiDrivenRecorder.runs(currentProjectId);
      setHistory(runs);
    } catch {
      // best effort
    }
  }, [currentProjectId]);

  useEffect(() => {
    refreshHistory();
  }, [refreshHistory]);

  // 启动后自动切换到 runtime tab
  useEffect(() => {
    if (state.runId && activeTab === 'new') {
      setActiveTab('runtime');
    }
  }, [state.runId, activeTab]);

  // 完成后刷新历史
  useEffect(() => {
    if (state.status === 'completed' || state.status === 'failed') {
      refreshHistory();
      queryClient.invalidateQueries({ queryKey: queryKeys.nlCases(currentProjectId || '') });
    }
  }, [state.status, refreshHistory, queryClient, currentProjectId]);

  const handleStart = useCallback(
    async (config: any, nlCaseSteps: any[]) => {
      await start(config, nlCaseSteps);
    },
    [start],
  );

  const handleAbort = useCallback(async () => {
    setShowAbortConfirm(false);
    await abort();
    setActiveTab('new');
  }, [abort]);

  const handleClear = useCallback(() => {
    reset();
    setActiveTab('new');
  }, [reset]);

  const handleDeleteRun = useCallback(
    async (runId: string) => {
      if (!currentProjectId) return;
      try {
        await api.aiDrivenRecorder.delete(currentProjectId, runId);
        await refreshHistory();
      } catch {
        // best effort
      }
    },
    [currentProjectId, refreshHistory],
  );

  const handleSelectRun = useCallback(
    async (runId: string) => {
      await loadRun(runId);
      setActiveTab('runtime');
    },
    [loadRun],
  );

  const handleTakeoverComplete = useCallback(
    (nlStepIndex: number) => {
      const runId = state.runId;
      if (!runId || !currentProjectId || takeoverPending) return;
      setTakeoverPending(true);
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${protocol}//${window.location.host}`);
      let timer: ReturnType<typeof setTimeout> | undefined;
      const finish = () => {
        if (timer) clearTimeout(timer);
        setTakeoverPending(false);
        try {
          ws.close();
        } catch {
          // noop
        }
      };
      ws.onopen = () => {
        if (ws.readyState !== WebSocket.OPEN) return;
        // 必须用 RECORDING_EVENT 信封：server ws-handlers 只订阅该信封并广播内部事件给 Agent
        ws.send(
          JSON.stringify({
            event: 'RECORDING_EVENT',
            data: {
              event: 'AI_RECORDER_TAKEOVER_COMPLETE',
              data: { runId, nlStepIndex, projectId: currentProjectId },
            },
          }),
        );
        finish();
      };
      ws.onerror = finish;
      timer = setTimeout(finish, 5000); // 兜底：socket 无响应时恢复按钮
    },
    [state.runId, currentProjectId, takeoverPending],
  );

  const handleViewSuite = useCallback(
    (suiteId: string, caseId: string) => {
      if (onNavigateToTestBuilder) {
        onNavigateToTestBuilder(suiteId, caseId);
      }
    },
    [onNavigateToTestBuilder],
  );

  if (!currentProjectId) {
    return <div className="h-full flex items-center justify-center text-slate-400">Select a project to continue</div>;
  }

  return (
    <div className="h-full flex flex-col bg-white overflow-hidden">
      {/* Header bar */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-200 bg-white shrink-0">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wider">AI Recorder</h2>
          {state.error && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 border border-red-200 max-w-md truncate">
              {state.error.message}
            </span>
          )}
          {isRunning && (
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium border ${
              state.isConnected ? 'bg-green-100 text-green-700 border-green-200' : 'bg-red-100 text-red-700 border-red-200'
            }`}>
              {state.isConnected ? 'Connected' : 'Disconnected'}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleClear}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
            title="Clear current run to start fresh"
          >
            <Trash2 size={14} />
            Clear
          </button>
          <button
            onClick={refreshHistory}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
            title="Refresh run history"
          >
            <RefreshCw size={14} />
            Refresh
          </button>
          {isRunning && (
            <button
              onClick={() => setShowAbortConfirm(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-red-200 text-red-600 hover:bg-red-50 transition-colors"
            >
              <StopCircle size={14} />
              Abort
            </button>
          )}
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex border-b border-slate-200 bg-white px-4 shrink-0">
        {TABS.map((tab) => (
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
            {tab.id === 'runtime' && state.runId && (
              <span className="ml-1.5 inline-flex w-1.5 h-1.5 rounded-full bg-blue-500" />
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'new' && (
          <RecorderConfigPanel
            nlCases={nlCases}
            providerConfigs={providerConfigs}
            preselectNlCaseId={preselectNlCaseId}
            onStart={handleStart}
            disabled={isRunning || state.isStarting}
          />
        )}
        {activeTab === 'runtime' && (
          <RecorderRuntimePanel
            state={state}
            takeoverPending={takeoverPending}
            onTakeoverComplete={handleTakeoverComplete}
            onViewSuite={handleViewSuite}
          />
        )}
        {activeTab === 'history' && (
          <RecorderRunHistory
            runs={history}
            onSelect={handleSelectRun}
            onDeleteRun={handleDeleteRun}
            onBack={() => setActiveTab('new')}
          />
        )}
      </div>

      <ConfirmModal
        isOpen={showAbortConfirm}
        onClose={() => setShowAbortConfirm(false)}
        onConfirm={handleAbort}
        title="Abort AI Recording?"
        message="This will stop the current recording run. Any steps already captured will be preserved in the draft suite. This action cannot be undone."
        confirmLabel="Abort Recording"
        type="warning"
      />
    </div>
  );
}
