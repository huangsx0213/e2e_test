import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/shared/services/api';
import type { BusinessFlow } from '../../../shared/contracts/index';

export function useBusinessFlows(projectId: string) {
  return useQuery({
    queryKey: ['business-flows', projectId],
    queryFn: () => api.businessFlows.listByProject(projectId),
enabled: !!projectId,
  });
}

export function useBusinessFlowMutations(projectId: string) {
  const qc = useQueryClient();
  const queryKey = ['business-flows', projectId];
  const create = useMutation({
    mutationFn: (item: Omit<BusinessFlow, 'id'> | BusinessFlow) => api.businessFlows.create(item),
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });
  const update = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<BusinessFlow> }) => api.businessFlows.update(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.businessFlows.delete(id),
    onSuccess: (_, id) => {
      qc.setQueryData<BusinessFlow[]>(queryKey, (current = []) => current.filter((flow) => flow.id !== id));
    },
  });
  const approve = useMutation({
    mutationFn: (id: string) => api.businessFlows.approve(id),
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });
  const unapprove = useMutation({
    mutationFn: (id: string) => api.businessFlows.unapprove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });

  return {
    create: (item: Omit<BusinessFlow, 'id'> | BusinessFlow) => create.mutateAsync(item),
    update: (id: string, data: Partial<BusinessFlow>) => update.mutateAsync({ id, data }),
    remove: (id: string) => remove.mutateAsync(id),
approve: (id: string) => approve.mutateAsync(id),
    unapprove: (id: string) => unapprove.mutateAsync(id),
  };
}
