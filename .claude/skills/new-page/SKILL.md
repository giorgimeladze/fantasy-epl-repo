---
name: new-page
description: Add a new page to the React client (feature folder, route table, nav link, data loading). Use when a new screen or tab is needed.
---

# Adding a page

The endpoint comes first (`new-endpoint` skill), so `api.getX` and the response type exist.

1. **Folder** `app/client/src/features/<feature>/` with `<Name>Page.tsx`:
   ```tsx
   import { api } from '../../api.ts';
   import { ErrorMessage } from '../../components/ErrorMessage.tsx';
   import { PageToolbar } from '../../components/PageToolbar.tsx';
   import { useApiResource } from '../../hooks/useApiResource.ts';
   import { fetchedAt } from '../../lib/format.ts';
   import type { PageProps } from '../../routes.ts';

   export function FixturesPage({ onUnauthorized }: PageProps) {
     const { data, error, loading, reload } = useApiResource(api.getFixtures, onUnauthorized);
     return (
       <>
         <PageToolbar title="Fixtures" loading={loading} onRefresh={() => void reload(true)} />
         {data && <p className="muted intro">{fetchedAt(data.cache)}</p>}
         <ErrorMessage error={error} />
         {!data && loading && <p className="muted">Loading fixtures…</p>}
         {data && <>{/* one component per section, in this folder */}</>}
       </>
     );
   }
   ```
2. **Route:** add one line to `ROUTES` in `src/routes.ts`: `{ hash: '#/fixtures', label: 'Fixtures', Page:
   FixturesPage }`. That gives it a URL, a nav link and a render; nothing else to wire.
3. **Sections** as their own components in the feature folder (see the `writing-components` skill). Saves and other
   changes go through `mutate` from `useApiResource`: `mutate(() => api.saveX(body))` keeps the old data on failure
   and shows the error.
4. **Styles:** a `/* Fixtures page */` block in `src/styles.css`, reusing existing classes where possible.
5. **Docs:** the page in `app/client/src/CLAUDE.md` and the README feature list; `npm run check`; open it with
   `npm run dev`.
