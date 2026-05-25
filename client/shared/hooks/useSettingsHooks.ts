import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/shared/services/api';
import { queryKeys } from './queryKeys';
import type { Settings } from '@/shared/types';
import type { MutationActions } from './mutation-types';

export function useSettings() {
  return useQuery({
    queryKey: queryKeys.settings,
    queryFn: () => api.settings.list(),
  });
}

export function useSettingsMutations(): MutationActions<Settings> {
  const qc = useQueryClient();
  const create = useMutation({
    mutationFn: (item: Omit<Settings, 'id'> | Settings) => api.settings.create(item),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.settings }),
  });
  const update = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Settings> }) => api.settings.update(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.settings }),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.settings.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.settings }),
  });
  return {
    create: (item) => create.mutateAsync(item),
    update: (id, data) => update.mutateAsync({ id, data }),
    remove: (id) => remove.mutateAsync(id),
  };
}
