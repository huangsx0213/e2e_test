import { useEffect, useRef } from 'react';

export function useRefreshOnMount(refresh: () => Promise<void>) {
  const refreshed = useRef(false);
  useEffect(() => {
    if (!refreshed.current) {
      refreshed.current = true;
      refresh();
    }
  }, [refresh]);
}
