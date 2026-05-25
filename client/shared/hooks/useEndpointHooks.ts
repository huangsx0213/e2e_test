import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/shared/services/api';
import { queryKeys } from './queryKeys';
import type { ApiEndpoint } from '@/shared/types';
import type { MutationActions } from './mutation-types';

export function useEndpoints() {
  return useQuery({
    queryKey: queryKeys.endpoints,
    queryFn: () => api.endpoints.list(),
  });
}

export function useEndpointMutations(): MutationActions<ApiEndpoint> {
  const qc = useQueryClient();
  const create = useMutation({
    mutationFn: (item: Omit<ApiEndpoint, 'id'> | ApiEndpoint) => api.endpoints.create(item),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.endpoints }),
  });
  const update = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<ApiEndpoint> }) => api.endpoints.update(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.endpoints }),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.endpoints.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.endpoints }),
  });
  return {
    create: (item) => create.mutateAsync(item),
    update: (id, data) => update.mutateAsync({ id, data }),
    remove: (id) => remove.mutateAsync(id),
  };
}
