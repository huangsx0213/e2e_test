import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/shared/services/api';
import { queryKeys } from './queryKeys';

export function useProviderConfigs() {
  return useQuery({
    queryKey: queryKeys.providerConfigs,
    queryFn: () => api.providerConfigs.list(),
  });
}

export function useProviderConfigMutations() {
  const qc = useQueryClient();
  const queryKey = queryKeys.providerConfigs;
  const create = useMutation({
    mutationFn: (item: any) => api.providerConfigs.create(item),
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });
  const update = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => api.providerConfigs.update(id, data),
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.providerConfigs.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });
  const setActive = useMutation({
    mutationFn: (id: string) => api.providerConfigs.setActive(id),
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });
  const copy = useMutation({
    mutationFn: (id: string) => api.providerConfigs.copy(id),
    onSuccess: () => qc.invalidateQueries({ queryKey }),
  });
  return {
    create: (item: any) => create.mutateAsync(item),
    update: (id: string, data: any) => update.mutateAsync({ id, data }),
    remove: (id: string) => remove.mutateAsync(id),
    setActive: (id: string) => setActive.mutateAsync(id),
    copy: (id: string) => copy.mutateAsync(id),
  };
}
