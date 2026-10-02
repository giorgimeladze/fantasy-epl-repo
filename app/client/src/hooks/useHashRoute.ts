import { useEffect, useState } from 'react';

export type Route = 'team' | 'head-to-head';

export const ROUTES: Record<Route, string> = {
  team: '#/',
  'head-to-head': '#/head-to-head',
};

function currentRoute(): Route {
  return window.location.hash === ROUTES['head-to-head'] ? 'head-to-head' : 'team';
}

/** Minimal hash-based routing: bookmarkable pages without a router dependency. */
export function useHashRoute(): Route {
  const [route, setRoute] = useState<Route>(currentRoute);

  useEffect(() => {
    const onChange = () => setRoute(currentRoute());
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);

  return route;
}
