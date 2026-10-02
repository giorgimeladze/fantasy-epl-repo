import { useState } from 'react';
import { api, tokenStore } from './api.ts';
import { NavBar } from './components/NavBar.tsx';
import { useHashRoute } from './hooks/useHashRoute.ts';
import { DashboardPage } from './pages/DashboardPage.tsx';
import { HeadToHeadPage } from './pages/HeadToHeadPage.tsx';
import { LoginPage } from './pages/LoginPage.tsx';

export function App() {
  const [token, setToken] = useState<string | null>(() => tokenStore.get());
  const route = useHashRoute();

  function handleLogin(newToken: string) {
    tokenStore.set(newToken);
    setToken(newToken);
  }

  function handleSessionEnd() {
    tokenStore.clear();
    setToken(null);
  }

  async function handleLogout() {
    await api.logout().catch(() => undefined);
    handleSessionEnd();
  }

  if (!token) return <LoginPage onLogin={handleLogin} />;

  return (
    <div className="dashboard">
      <NavBar active={route} onLogout={handleLogout} />
      <main className="content">
        {route === 'head-to-head' ? (
          <HeadToHeadPage key="head-to-head" onUnauthorized={handleSessionEnd} />
        ) : (
          <DashboardPage key="team" onUnauthorized={handleSessionEnd} />
        )}
      </main>
    </div>
  );
}
