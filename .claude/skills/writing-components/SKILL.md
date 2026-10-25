---
name: writing-components
description: How to write React components in app/client (where files go, props, data loading, formatting, shared UI, CSS). Use when adding or changing any .tsx file.
---

# Writing components

## Where a component goes

| It is used by | It lives in | Example |
| --- | --- | --- |
| One page | `src/features/<feature>/`, next to the page | `features/transfers/OptionCard.tsx` |
| Two or more features | `src/components/` | `ProjectionTable`, `FixtureChip` |
| The app shell | `src/components/` | `NavBar`, `PageToolbar` |

ESLint enforces it: a feature never imports another feature, and `components/`, `hooks/`, `lib/` never import a
feature. Needed in a second feature? Move it to `components/` (with `git mv`) first.

## Rules

1. **One exported component per file**, named like the file. A small private helper used only there (under ~30
   lines, e.g. `PlayerLine` in `OptionCard.tsx`) may stay in the same file. Split a file once it passes ~150 lines or
   holds several page sections: one section = one component (`LineupSummary`, `LineupChanges`, …).
2. **A one-line doc comment** above each exported component: what it shows, not how.
3. **Props:** `interface Props` above the component when there are 3+ props; inline for 1–2
   (`{ data }: { data: TransfersResponse }`). Pages take `PageProps` from `src/routes.ts`. Optional props get defaults
   in the destructuring (`best = false`).
4. **Data:** only pages load data, with `useApiResource(api.getX, onUnauthorized)`; children get it via props. A
   self-contained widget with its own endpoint (e.g. `DraftPlan`, `PlayerScout`) may load its own, and must pass
   `UnauthorizedError` to `onUnauthorized`. Never call `fetch` (lint error): add a method to `src/api.ts`.
5. **No business logic.** The server sends values ready to show (prices in £m, chances 0–1, sorted lists, reason
   phrases). If a component needs to compute a rule, it belongs on the server.
6. **Formatting** only through `src/lib/format.ts`: `pts`, `fixed`, `signed`, `money`, `pct`, `time`, `deadline`,
   `gameweekRange`, `fetchedAt`, `POSITIONS`, `CHIP_NAMES`. No inline `toFixed` or `toLocale…`. Add a formatter there
   when a new kind of value appears.
7. **Shared UI first:** `ErrorMessage` (any error, `role="alert"`), `PageToolbar` (title + Refresh),
   `StatTiles` (headline numbers), `Segmented` (pick one of a few options), `FixtureChip`, `ProjectionTable`.
8. **Hooks:** `react-hooks/exhaustive-deps` is on, so list every dependency. Callbacks passed down from `App`
   (`onUnauthorized`) are stable. To keep a value without re-running an effect, use a ref as `useApiResource` does.
9. **Lists** get stable keys from ids (`key={p.id}`), never the index unless the list never reorders.
10. **Accessibility:** buttons for actions (never clickable `div`s), `aria-label` on button groups and icon-only
    buttons, `title` for abbreviations in table headers.

## Styling

Plain CSS in `src/styles.css` (no UI framework, no inline styles except computed widths). Reuse the existing classes
before adding new ones: `muted`, `intro`, `next-note`, `gain` / `loss`, `section` blocks with an `h2`, `table-wrap` +
`table.players` + `num` cells, `h2h-controls`, `transfer-list` / `transfer-option`, `formation-list`. New classes go in
the page's block of `styles.css` (each page has a `/* Page name */` header).

## Skeleton

```tsx
import { pts, signed } from '../../lib/format.ts';
import type { TransferOption } from '../../types.ts';

/** One transfer option: the moves and what they add over the horizon. */
export function OptionSummary({ option }: { option: TransferOption }) {
  return (
    <div className="transfer-detail">
      <strong>{signed(option.netGain)}</strong> <span className="muted">({pts(option.gain)} before hits)</span>
    </div>
  );
}
```

Then `npm run check` (lint, typecheck, tests). There are no client tests; check the page in `npm run dev`.
