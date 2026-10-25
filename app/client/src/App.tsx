import { useCallback, useState } from 'react';
import { api, tokenStore } from './api.ts';
import { NavBar } from './components/NavBar.tsx';
import { LoginPage } from './features/auth/LoginPage.tsx';
import { useHashRoute } from './hooks/useHashRoute.ts';
import { routeFor } from './routes.ts';

export function App() {
  const [token, setToken] = useState<string | null>(() => tokenStore.get());
  const route = routeFor(useHashRoute());

  function handleLogin(newToken: string) {
    tokenStore.set(newToken);
    setToken(newToken);
  }

  // Stable, so pages can depend on it in effects.
  const handleSessionEnd = useCallback(() => {
    tokenStore.clear();
    setToken(null);
  }, []);

  async function handleLogout() {
    await api.logout().catch(() => undefined);
    handleSessionEnd();
  }

  if (!token) return <LoginPage onLogin={handleLogin} />;

  const { Page } = route;
  return (
    <div className="dashboard">
      <NavBar active={route} onLogout={handleLogout} />
      <main className="content">
        {/* `key` gives each page fresh state when navigating. */}
        <Page key={route.hash} onUnauthorized={handleSessionEnd} />
      </main>
    </div>
  );
}
