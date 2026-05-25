import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/shared/services/api';
import { queryKeys } from './queryKeys';

export function useAgents() {
  return useQuery({
    queryKey: queryKeys.agents,
    queryFn: () => api.agents.list(),
    refetchInterval: 5000,
  });
}

export function useQueue() {
  return useQuery({
    queryKey: queryKeys.queue,
    queryFn: () => api.queue.list(),
    refetchInterval: 5000,
  });
}

export function useAgentMutations() {
  const qc = useQueryClient();
  const updateStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) => api.agents.updateStatus(id, status),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.agents }),
  });
  const updateLabels = useMutation({
    mutationFn: ({ id, labels }: { id: string; labels: string[] }) => api.agents.updateLabels(id, labels),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.agents }),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.agents.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.agents }),
  });
  return {
    updateStatus: (id: string, status: string) => updateStatus.mutateAsync({ id, status }),
    updateLabels: (id: string, labels: string[]) => updateLabels.mutateAsync({ id, labels }),
    remove: (id: string) => remove.mutateAsync(id),
  };
}
