import { useState, useEffect, useCallback } from 'react';
import {
  CrudService,
  EnvironmentService,
} from '@/shared/services/api';

export interface CrudActions<T extends { id: string }> {
  create: (item: T) => Promise<void>;
  update: (id: string, item: Partial<T>) => Promise<void>;
  remove: (id: string) => Promise<void>;
}

export interface EnvironmentActions {
  create: (item: string) => Promise<void>;
  remove: (item: string) => Promise<void>;
}

export function useCrud<T extends { id: string }>(apiResource: CrudService<T>) {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);

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
    await apiResource.update(id, item);
  }, [apiResource]);

  const remove = useCallback(async (id: string) => {
    setData(prev => prev.filter(i => i.id !== id)); // Optimistic update
    await apiResource.delete(id);
  }, [apiResource]);

  const actions: CrudActions<T> = { create, update, remove };

  return [data, actions, loading] as const;
}

export function useEnvCrud(apiResource: EnvironmentService) {
  const [data, setData] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

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
    await apiResource.delete(item);
  }, [apiResource]);

  const actions: EnvironmentActions = { create, remove };

  return [data, actions, loading] as const;
}
