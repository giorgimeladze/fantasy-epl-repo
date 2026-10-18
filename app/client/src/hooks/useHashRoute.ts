import { useEffect, useState } from 'react';

export type Route = 'team' | 'head-to-head' | 'predictions';

export const ROUTES: Record<Route, string> = {
  team: '#/',
  'head-to-head': '#/head-to-head',
  predictions: '#/predictions',
};

function currentRoute(): Route {
  const match = (Object.keys(ROUTES) as Route[]).find((route) => ROUTES[route] === window.location.hash);
  return match ?? 'team';
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
