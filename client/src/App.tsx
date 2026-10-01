import { useState } from 'react';
import { api, tokenStore } from './api.ts';
import { DashboardPage } from './pages/DashboardPage.tsx';
import { LoginPage } from './pages/LoginPage.tsx';

export function App() {
  const [token, setToken] = useState<string | null>(() => tokenStore.get());

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
  return <DashboardPage onLogout={handleLogout} onUnauthorized={handleSessionEnd} />;
}
