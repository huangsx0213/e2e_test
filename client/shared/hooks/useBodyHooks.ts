import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/shared/services/api';
import { queryKeys } from './queryKeys';
import type { BodyTemplate } from '@/shared/types';
import type { MutationActions } from './mutation-types';

export function useBodies() {
  return useQuery({
    queryKey: queryKeys.bodies,
    queryFn: () => api.bodies.list(),
  });
}

export function useBodyMutations(): MutationActions<BodyTemplate> {
  const qc = useQueryClient();
  const create = useMutation({
    mutationFn: (item: Omit<BodyTemplate, 'id'> | BodyTemplate) => api.bodies.create(item),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.bodies }),
  });
  const update = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<BodyTemplate> }) => api.bodies.update(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.bodies }),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.bodies.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.bodies }),
  });
  return {
    create: (item) => create.mutateAsync(item),
    update: (id, data) => update.mutateAsync({ id, data }),
    remove: (id) => remove.mutateAsync(id),
  };
}
