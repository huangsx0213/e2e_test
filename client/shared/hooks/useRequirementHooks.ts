import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/shared/services/api';
import type { Requirement } from '../../../shared/contracts/index';

export function useRequirements(projectId: string) {
  return useQuery({
    queryKey: ['requirements', projectId],
    queryFn: () => api.requirements.listByProject(projectId),
    enabled: !!projectId,
  });
}

export function useRequirementMutations(projectId: string) {
  const qc = useQueryClient();
  const queryKey = ['requirements', projectId];
  const create = useMutation({
    mutationFn: (item: Omit<Requirement, 'id'> | Requirement) => api.requirements.create(item),
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });
  const update = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Requirement> }) => api.requirements.update(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.requirements.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });
  return {
    create: (item) => create.mutateAsync(item),
    update: (id, data) => update.mutateAsync({ id, data }),
    remove: (id) => remove.mutateAsync(id),
  };
}
