import { type PageRoute, ROUTES } from '../routes.ts';

interface Props {
  active: PageRoute;
  onLogout: () => void;
}

export function NavBar({ active, onLogout }: Props) {
  return (
    <header className="topbar">
      <span className="brand">⚽ My FPL Team</span>
      <nav className="nav" aria-label="Main">
        {ROUTES.map((route) => (
          <a
            key={route.hash}
            href={route.hash}
            className={route === active ? 'nav-link active' : 'nav-link'}
            aria-current={route === active ? 'page' : undefined}
          >
            {route.label}
          </a>
        ))}
      </nav>
      <button className="secondary" onClick={onLogout}>
        Sign out
      </button>
    </header>
  );
}
