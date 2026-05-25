import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/shared/services/api';
import { queryKeys } from './queryKeys';
import type { Project } from '@/shared/types';
import type { MutationActions } from './mutation-types';

export function useProjects() {
  return useQuery({
    queryKey: queryKeys.projects,
    queryFn: () => api.projects.list(),
  });
}

export function useProjectMutations(): MutationActions<Project> {
  const qc = useQueryClient();
  const create = useMutation({
    mutationFn: (item: Omit<Project, 'id'> | Project) => api.projects.create(item),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.projects }),
  });
  const update = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Project> }) => api.projects.update(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.projects }),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.projects.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.projects }),
  });
  return {
    create: (item) => create.mutateAsync(item),
    update: (id, data) => update.mutateAsync({ id, data }),
    remove: (id) => remove.mutateAsync(id),
  };
}
