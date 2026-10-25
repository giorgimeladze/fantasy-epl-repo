import { useState } from 'react';
import { api, tokenStore } from './api.ts';
import { NavBar } from './components/NavBar.tsx';
import { useHashRoute } from './hooks/useHashRoute.ts';
import { DashboardPage } from './pages/DashboardPage.tsx';
import { HeadToHeadPage } from './pages/HeadToHeadPage.tsx';
import { LoginPage } from './pages/LoginPage.tsx';
import { NextGameweekPage } from './pages/NextGameweekPage.tsx';
import { PredictionsPage } from './pages/PredictionsPage.tsx';
import { TransfersPage } from './pages/TransfersPage.tsx';

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
        ) : route === 'next-gameweek' ? (
          <NextGameweekPage key="next-gameweek" onUnauthorized={handleSessionEnd} />
        ) : route === 'transfers' ? (
          <TransfersPage key="transfers" onUnauthorized={handleSessionEnd} />
        ) : route === 'predictions' ? (
          <PredictionsPage key="predictions" onUnauthorized={handleSessionEnd} />
        ) : (
          <DashboardPage key="team" onUnauthorized={handleSessionEnd} />
        )}
      </main>
    </div>
  );
}
