import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/shared/services/api';
import { queryKeys } from './queryKeys';
import type { DynamicVariable } from '@/shared/types';

export function useDynamicVariables(projectId: string) {
  return useQuery({
    queryKey: queryKeys.dynamicVariables(projectId),
    queryFn: () => api.dynamicVariables.list(projectId),
    enabled: !!projectId,
  });
}

export function useDynamicVariableMutations(projectId: string) {
  const qc = useQueryClient();
  const create = useMutation({
    mutationFn: (data: Omit<DynamicVariable, 'id' | 'projectId' | 'createdAt' | 'updatedAt'>) => api.dynamicVariables.create(projectId, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.dynamicVariables(projectId) }),
  });
  const update = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<DynamicVariable> }) => api.dynamicVariables.update(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.dynamicVariables(projectId) }),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.dynamicVariables.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.dynamicVariables(projectId) }),
  });
  return {
    create: (data: Omit<DynamicVariable, 'id' | 'projectId' | 'createdAt' | 'updatedAt'>) => create.mutateAsync(data),
    update: (id: string, data: Partial<DynamicVariable>) => update.mutateAsync({ id, data }),
    remove: (id: string) => remove.mutateAsync(id),
  };
}
