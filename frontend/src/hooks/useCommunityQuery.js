import { useEffect, useState } from 'react';
import { useGames } from '../features/games/hooks/useGames';
import { communityApi } from '../lib/communityApi';

export function useCommunityQuery(path) {
  const { user } = useGames();
  const [attempt, retry] = useState(0);
  const [result, setResult] = useState({});
  const key = `${path}:${user?.id || 0}:${attempt}`;
  useEffect(() => {
    const controller = new AbortController();
    communityApi(path, { signal: controller.signal }).then(data => {
      if (!controller.signal.aborted) setResult({ key, data });
    }).catch(error => {
      if (!controller.signal.aborted) setResult({ key, error: error.message });
    });
    return () => controller.abort();
  }, [path, key]);
  return { ...(result.key === key ? result : {}), loading: result.key !== key,
    retry: () => retry(value => value + 1),
    update: transform => setResult(current => current.key === key ? { ...current, data: transform(current.data) } : current) };
}

