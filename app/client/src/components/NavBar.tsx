import { ROUTES, type Route } from '../hooks/useHashRoute.ts';

const LINKS: Array<{ route: Route; label: string }> = [
  { route: 'team', label: 'My team' },
  { route: 'head-to-head', label: 'Head-to-head' },
];

interface Props {
  active: Route;
  onLogout: () => void;
}

export function NavBar({ active, onLogout }: Props) {
  return (
    <header className="topbar">
      <span className="brand">⚽ My FPL Team</span>
      <nav className="nav" aria-label="Main">
        {LINKS.map(({ route, label }) => (
          <a
            key={route}
            href={ROUTES[route]}
            className={route === active ? 'nav-link active' : 'nav-link'}
            aria-current={route === active ? 'page' : undefined}
          >
            {label}
          </a>
        ))}
      </nav>
      <button className="secondary" onClick={onLogout}>
        Sign out
      </button>
    </header>
  );
}
