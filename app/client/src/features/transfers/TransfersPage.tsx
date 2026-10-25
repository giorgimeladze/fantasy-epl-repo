import { useState } from 'react';
import { api } from '../../api.ts';
import { ErrorMessage } from '../../components/ErrorMessage.tsx';
import { PageToolbar } from '../../components/PageToolbar.tsx';
import { Segmented } from '../../components/Segmented.tsx';
import { StatTiles } from '../../components/StatTiles.tsx';
import { useApiResource } from '../../hooks/useApiResource.ts';
import { fetchedAt, gameweekRange, money, pts, signed } from '../../lib/format.ts';
import type { PageProps } from '../../routes.ts';
import type { TransfersResponse } from '../../types.ts';
import { FreeTransferHistory } from './FreeTransferHistory.tsx';
import { OptionList } from './OptionList.tsx';
import { Recommendation } from './Recommendation.tsx';
import { SellingPrices } from './SellingPrices.tsx';

const COUNTS = [
  { value: 1, label: '1 transfer' },
  { value: 2, label: '2 transfers' },
] as const;

function Summary({ data }: { data: TransfersResponse }) {
  const { recommended } = data;
  return (
    <StatTiles
      tiles={[
        {
          label: 'Free transfers',
          value: (
            <>
              {data.freeTransfers} <span className="muted">of {data.maxFreeTransfers}</span>
            </>
          ),
        },
        { label: 'In the bank', value: money(data.bank) },
        {
          label: `Squad · ${gameweekRange(data.gameweeks)}`,
          value: (
            <>
              {pts(data.squadPoints)} <span className="muted">pts</span>
            </>
          ),
        },
        {
          label: 'Best move',
          value: recommended.moves.length === 0 ? 'Save' : signed(recommended.netGain),
          className: recommended.netGain > 0 ? 'gain' : '',
        },
      ]}
    />
  );
}

export function TransfersPage({ onUnauthorized }: PageProps) {
  const { data, error, loading, reload } = useApiResource(api.getTransfers, onUnauthorized);
  const [count, setCount] = useState<1 | 2>(1);

  return (
    <>
      <PageToolbar
        title={data ? `Transfers for GW${data.gameweek}` : 'Transfers'}
        loading={loading}
        onRefresh={() => void reload(true)}
      />
      {data && (
        <p className="muted intro">
          Predicted over {gameweekRange(data.gameweeks)} · {fetchedAt(data.cache)}
        </p>
      )}

      <ErrorMessage error={error} />
      {!data && loading && <p className="muted">Searching transfers…</p>}

      {data && (
        <>
          <Summary data={data} />
          <p className="muted next-note">
            FPL only shows transfers after each deadline, so moves you've already made for GW{data.gameweek} aren't
            counted.
          </p>

          <Recommendation data={data} />

          <section>
            <div className="h2h-controls">
              <Segmented label="Number of transfers" options={COUNTS} value={count} onChange={setCount} />
            </div>
          </section>
          {count === 1 ? (
            <OptionList
              title="Best single transfers"
              options={data.single}
              data={data}
              empty="No legal single transfer within your budget."
            />
          ) : (
            <OptionList
              title="Best pairs of transfers"
              options={data.double}
              data={data}
              empty="No pair where both moves add points."
            />
          )}

          <SellingPrices data={data} />
          <FreeTransferHistory data={data} />
        </>
      )}
    </>
  );
}
