import { useEffect, useState } from 'react';

/** The current `location.hash` (`#/transfers`), kept up to date. Pages are matched in routes.ts. */
export function useHashRoute(): string {
  const [hash, setHash] = useState(() => window.location.hash);

  useEffect(() => {
    const onChange = () => setHash(window.location.hash);
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);

  return hash;
}
