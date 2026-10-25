import type { PriceWatch } from '../../types.ts';
import { PriceWatchList } from './PriceWatchList.tsx';

/** FPL's price-change outlook: the squad, then the league's likely risers and fallers. */
export function PriceWatchSection({ priceWatch }: { priceWatch: PriceWatch }) {
  return (
    <section>
      <h2>Price watch</h2>
      {priceWatch.available ? (
        <>
          <p className="muted">
            FPL's own estimate of which prices change at the next few nightly updates (% = progress towards the
            change). Sell a falling player before it drops, or buy a rising one before it goes up.
          </p>
          <div className="price-watch">
            <PriceWatchList
              title="Your squad"
              hints={priceWatch.squad}
              empty="No price changes expected for your players."
            />
            <PriceWatchList title="Likely risers" hints={priceWatch.risers} empty="None expected." markSquad />
            <PriceWatchList title="Likely fallers" hints={priceWatch.fallers} empty="None expected." markSquad />
          </div>
        </>
      ) : (
        <p className="muted">FPL isn't publishing price-change data at the moment.</p>
      )}
    </section>
  );
}
