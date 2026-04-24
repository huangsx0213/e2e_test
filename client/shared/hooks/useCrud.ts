import { useState, useEffect, useCallback } from 'react';
import {
  CrudService,
  EnvironmentService,
} from '@/shared/services/api';

export interface CrudActions<T extends { id: string }> {
  create: (item: T) => Promise<void>;
  update: (id: string, item: Partial<T>) => Promise<void>;
  remove: (id: string) => Promise<void>;
  refresh: () => Promise<void>;
}

export interface EnvironmentActions {
  create: (item: string) => Promise<void>;
  remove: (item: string) => Promise<void>;
  refresh: () => Promise<void>;
}

export function useCrud<T extends { id: string }>(apiResource: CrudService<T>) {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const res = await apiResource.list();
    setData(res);
  }, [apiResource]);

  useEffect(() => {
    let mounted = true;
    apiResource.list().then((res: T[]) => {
      if (mounted) {
        setData(res);
        setLoading(false);
      }
    });
    return () => { mounted = false; };
  }, [apiResource]);

  const create = useCallback(async (item: T) => {
    setData(prev => [...prev, item]); // Optimistic update
    try {
      await apiResource.create(item);
    } catch (e) {
      setData(prev => prev.filter(i => i.id !== item.id)); // Rollback on fail
      throw e;
    }
  }, [apiResource]);

  const update = useCallback(async (id: string, item: Partial<T>) => {
    setData(prev => prev.map(i => i.id === id ? { ...i, ...item } as T : i)); // Optimistic update
    try {
      await apiResource.update(id, item);
    } catch (e) {
      refresh();
      throw e;
    }
  }, [apiResource, refresh]);

  const remove = useCallback(async (id: string) => {
    setData(prev => prev.filter(i => i.id !== id)); // Optimistic update
    try {
      await apiResource.delete(id);
    } catch (e) {
      refresh();
      throw e;
    }
  }, [apiResource, refresh]);

  const actions: CrudActions<T> = { create, update, remove, refresh };

  return [data, actions, loading] as const;
}

export function useEnvCrud(apiResource: EnvironmentService) {
  const [data, setData] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const res = await apiResource.list();
    setData(res);
  }, [apiResource]);

  useEffect(() => {
    let mounted = true;
    apiResource.list().then((res: string[]) => {
      if (mounted) {
        setData(res);
        setLoading(false);
      }
    });
    return () => { mounted = false; };
  }, [apiResource]);

  const create = useCallback(async (item: string) => {
    setData(prev => [...prev, item]);
    try {
      await apiResource.create(item);
    } catch (e) {
      setData(prev => prev.filter(i => i !== item));
      throw e;
    }
  }, [apiResource]);

  const remove = useCallback(async (item: string) => {
    setData(prev => prev.filter(i => i !== item));
    try {
      await apiResource.delete(item);
    } catch (e) {
      refresh();
      throw e;
    }
  }, [apiResource, refresh]);

  const actions: EnvironmentActions = { create, remove, refresh };

  return [data, actions, loading] as const;
}
