import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/shared/services/api';
import { queryKeys } from './queryKeys';
import type { EnvironmentMutationActions } from './mutation-types';

export function useEnvironments() {
  return useQuery({
    queryKey: queryKeys.environments,
    queryFn: () => api.environments.list(),
  });
}

export function useEnvironmentMutations(): EnvironmentMutationActions {
  const qc = useQueryClient();
  const create = useMutation({
    mutationFn: (env: string) => api.environments.create(env),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.environments }),
  });
  const remove = useMutation({
    mutationFn: (env: string) => api.environments.delete(env),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.environments }),
  });
  return {
    create: (env) => create.mutateAsync(env),
    remove: (env) => remove.mutateAsync(env),
  };
}
