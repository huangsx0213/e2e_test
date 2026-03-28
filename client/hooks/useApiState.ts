import React, { useState, useEffect, useCallback } from 'react';

export function useApiState<T>(
  fetcher: () => Promise<T>,
  saver: (data: T) => Promise<void>,
  initialValue: T
): [T, React.Dispatch<React.SetStateAction<T>>, boolean] {
  const [state, setState] = useState<T>(initialValue);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    fetcher().then(data => {
      if (mounted) {
        setState(data);
        setLoading(false);
      }
    }).catch(err => {
      console.error("Failed to fetch data", err);
      if (mounted) setLoading(false);
    });
    return () => { mounted = false; };
  }, [fetcher]);

  const setApiState = useCallback((action: React.SetStateAction<T>) => {
    setState(prevState => {
      const newState = typeof action === 'function' ? (action as any)(prevState) : action;
      saver(newState).catch(err => console.error("Failed to save data", err));
      return newState;
    });
  }, [saver]);

  return [state, setApiState, loading];
}
