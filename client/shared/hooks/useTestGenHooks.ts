import { useQuery } from '@tanstack/react-query';
import { api } from '@/shared/services/api';
import { queryKeys } from './queryKeys';

export function useTestGenRuns(projectId: string) {
  return useQuery({
    queryKey: queryKeys.testGen.runs(projectId),
    queryFn: () => api.pipeline.runs(projectId),
    enabled: !!projectId,
    refetchInterval: (query: any) => {
      const running = query.state.data?.some((r: any) => r.status === 'RUNNING' || r.status === 'WAITING_REVIEW');
      return running ? 3000 : false;
    },
  });
}

export function useCheckpoint(runId: string) {
  return useQuery({
    queryKey: queryKeys.testGen.checkpoint(runId),
    queryFn: () => api.pipeline.checkpoint(runId),
    enabled: !!runId,
    refetchInterval: 5000,
  });
}

export function useAgentLogs(runId: string, agentName?: string, refetchIntervalMs?: number) {
  return useQuery({
    queryKey: [...queryKeys.testGen.logs(runId), agentName || 'all'],
    queryFn: () => api.pipeline.logs(runId, agentName),
    enabled: !!runId,
    refetchInterval: refetchIntervalMs ? Math.max(refetchIntervalMs, 1000) : false,
  });
}
