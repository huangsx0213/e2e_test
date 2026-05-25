import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/shared/services/api';
import { queryKeys } from './queryKeys';
import type { HeaderProfile } from '@/shared/types';
import type { MutationActions } from './mutation-types';

export function useHeaders() {
  return useQuery({
    queryKey: queryKeys.headers,
    queryFn: () => api.headers.list(),
  });
}

export function useHeaderMutations(): MutationActions<HeaderProfile> {
  const qc = useQueryClient();
  const create = useMutation({
    mutationFn: (item: Omit<HeaderProfile, 'id'> | HeaderProfile) => api.headers.create(item),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.headers }),
  });
  const update = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<HeaderProfile> }) => api.headers.update(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.headers }),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.headers.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.headers }),
  });
  return {
    create: (item) => create.mutateAsync(item),
    update: (id, data) => update.mutateAsync({ id, data }),
    remove: (id) => remove.mutateAsync(id),
  };
}
