import { useState, useEffect, useCallback } from 'react';

export function useCrud<T extends { id: string }>(apiResource: any) {
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

  return [data, { create, update, remove }, loading] as const;
}

export function useEnvCrud(apiResource: any) {
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

  return [data, { create, remove }, loading] as const;
}
