// Every page, in navigation order. Add a page here and it gets a URL, a nav link and a render.
import type { ComponentType } from 'react';
import { DashboardPage } from './features/dashboard/DashboardPage.tsx';
import { HeadToHeadPage } from './features/headToHead/HeadToHeadPage.tsx';
import { NextGameweekPage } from './features/nextGameweek/NextGameweekPage.tsx';
import { PlannerPage } from './features/planner/PlannerPage.tsx';
import { PredictionsPage } from './features/predictions/PredictionsPage.tsx';
import { TransfersPage } from './features/transfers/TransfersPage.tsx';

/** What every page receives from App. */
export interface PageProps {
  /** Ends the session (a 401 from the API). */
  onUnauthorized: () => void;
}

export interface PageRoute {
  hash: string;
  label: string;
  Page: ComponentType<PageProps>;
}

export const ROUTES: readonly PageRoute[] = [
  { hash: '#/', label: 'My team', Page: DashboardPage },
  { hash: '#/next-gw', label: 'Next GW', Page: NextGameweekPage },
  { hash: '#/transfers', label: 'Transfers', Page: TransfersPage },
  { hash: '#/planner', label: 'Planner', Page: PlannerPage },
  { hash: '#/predictions', label: 'Predictions', Page: PredictionsPage },
  { hash: '#/head-to-head', label: 'Head-to-head', Page: HeadToHeadPage },
];

/** The page for `hash`; unknown hashes (and none) show the first page. */
export const routeFor = (hash: string): PageRoute => ROUTES.find((r) => r.hash === hash) ?? ROUTES[0]!;
