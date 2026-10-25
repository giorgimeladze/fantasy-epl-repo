import { useEffect, useState } from 'react';

export type Route = 'team' | 'next-gameweek' | 'transfers' | 'planner' | 'predictions' | 'head-to-head';

export const ROUTES: Record<Route, string> = {
  team: '#/',
  'next-gameweek': '#/next-gw',
  transfers: '#/transfers',
  planner: '#/planner',
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
