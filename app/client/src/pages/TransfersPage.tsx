import { useState } from 'react';
import { api } from '../api.ts';
import { PageToolbar } from '../components/PageToolbar.tsx';
import { useApiResource } from '../hooks/useApiResource.ts';
import type { TransferOption, TransferPlayer, TransfersResponse } from '../types.ts';

const pts = (value: number) => value.toFixed(1);
const signed = (value: number) => `${value >= 0 ? '+' : '−'}${Math.abs(value).toFixed(1)}`;
const money = (value: number) => `£${value.toFixed(1)}m`;
const pct = (value: number) => `${Math.round(value * 100)}%`;
const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

const CHIPS: Record<string, string> = {
  wildcard: 'Wildcard',
  freehit: 'Free Hit',
  bboost: 'Bench Boost',
  '3xc': 'Triple Captain',
};

function horizonLabel(gameweeks: number[]): string {
  if (gameweeks.length === 0) return '';
  return gameweeks.length === 1 ? `GW${gameweeks[0]}` : `GW${gameweeks[0]}–${gameweeks.at(-1)}`;
}

function headline(option: TransferOption, data: TransfersResponse): string {
  const weeks = `${data.gameweeks.length} GW${data.gameweeks.length === 1 ? '' : 's'}`;
  if (option.moves.length === 0) {
    return `Save the transfer: ${option.freeTransfersNext} free next week, ${money(option.bankAfter)} in the bank`;
  }
  const moves = option.moves.map((m) => `Sell ${m.out.webName} → buy ${m.in.webName}`).join(', ');
  const hit = option.hitCost > 0 ? ` after a −${option.hitCost}` : '';
  return `${moves}: ${signed(option.netGain)} predicted points over ${weeks}${hit}, ${money(option.bankAfter)} left`;
}

function PlayerLine({ player, label }: { player: TransferPlayer; label: string }) {
  return (
    <div className="transfer-player">
      <div className="transfer-player-head">
        <span className="muted">{label}</span> <strong>{player.webName}</strong>{' '}
        <span className="muted">
          {player.clubShortName} · {player.position} · {money(player.price)} · plays {pct(player.playChance)}
        </span>
      </div>
      <div className="transfer-points">
        {player.gameweekPoints.map((p, i) => (
          <span key={i} className={p === 0 ? 'xp-blank' : ''}>
            {pts(p)}
          </span>
        ))}
        <strong>= {pts(player.horizonPoints)}</strong>
      </div>
      <span className="reasons">{player.reasons.join(' · ')}</span>
    </div>
  );
}

function OptionCard({
  option,
  data,
  best = false,
}: {
  option: TransferOption;
  data: TransfersResponse;
  best?: boolean;
}) {
  return (
    <li className={best ? 'transfer-option best' : 'transfer-option'}>
      <div className="transfer-headline">
        <strong>{headline(option, data)}</strong>
      </div>
      {option.moves.map((m) => (
        <div key={m.out.id} className="transfer-move">
          <PlayerLine player={m.out} label={`Sell (${money(m.sellingPrice)})`} />
          <PlayerLine player={m.in} label="Buy" />
        </div>
      ))}
      {option.moves.length > 0 && (
        <div className="muted transfer-detail">
          <div>
            Squad points per gameweek:{' '}
            {data.gameweeks
              .map((gw, i) => {
                const before = data.squadPerGameweek[i] ?? 0;
                const gain = option.gainPerGameweek[i] ?? 0;
                return `GW${gw} ${pts(before)} → ${pts(before + gain)}`;
              })
              .join(' · ')}
          </div>
          <div>
            {signed(option.gain)} over the horizon
            {option.hitCost > 0 && ` − ${option.hitCost} hit = ${signed(option.netGain)}`}
            {option.score !== option.netGain &&
              ` − ${pts(option.netGain - option.score)} for the banked transfer given up = ${signed(option.score)} vs saving`}{' '}
            · {option.freeTransfersNext} free transfer{option.freeTransfersNext === 1 ? '' : 's'} next week
          </div>
        </div>
      )}
    </li>
  );
}

function OptionList({
  title,
  options,
  data,
  empty,
}: {
  title: string;
  options: TransferOption[];
  data: TransfersResponse;
  empty: string;
}) {
  return (
    <section>
      <h2>{title}</h2>
      {options.length === 0 ? (
        <p className="muted">{empty}</p>
      ) : (
        <ul className="transfer-list">
          {options.map((o) => (
            <OptionCard key={o.moves.map((m) => `${m.out.id}>${m.in.id}`).join()} option={o} data={data} />
          ))}
        </ul>
      )}
    </section>
  );
}

function Recommendation({ data }: { data: TransfersResponse }) {
  const { recommended, save } = data;
  const saving = recommended.moves.length === 0;
  return (
    <section>
      <h2>Recommendation</h2>
      <ul className="transfer-list">
        <OptionCard option={recommended} data={data} best />
      </ul>
      <p className="muted next-note">
        {saving
          ? data.single.length === 0
            ? 'No affordable transfer is allowed (budget, position or 3 per club), or none adds points.'
            : `The best transfer adds ${signed(data.single[0]!.netGain)}, less than the ${pts(data.rules.savedTransferValue)} points a banked free transfer is taken to be worth.`
          : `Beats saving the transfer (${save.freeTransfersNext} free next week) after allowing ${pts(data.rules.savedTransferValue)} points for each banked transfer given up.`}{' '}
        Gains are the squad's best XI each week, with captain and automatic substitutions, against keeping the squad.
      </p>
    </section>
  );
}

function SellingPrices({ data }: { data: TransfersResponse }) {
  return (
    <section>
      <h2>Selling prices</h2>
      <p className="muted">
        Estimated from your transfers: purchase price plus half of any rise, rounded down to £0.1m. Players from your
        first squad are taken at the season's starting price.
      </p>
      <div className="table-wrap">
        <table className="players">
          <thead>
            <tr>
              <th>Player</th>
              <th className="num">Bought</th>
              <th className="num">Now</th>
              <th className="num">Sells for</th>
            </tr>
          </thead>
          <tbody>
            {data.squad.map((s) => (
              <tr key={s.id}>
                <td>
                  <div className="cell-player">
                    <strong>{s.webName}</strong>
                    <span className="muted">
                      {s.clubShortName} · {s.position}
                      {s.boughtInGameweek ? ` · bought GW${s.boughtInGameweek}` : ''}
                    </span>
                  </div>
                </td>
                <td className="num">{money(s.purchasePrice)}</td>
                <td className="num">{money(s.price)}</td>
                <td className="num">
                  <strong>{money(s.sellingPrice)}</strong>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function FreeTransferHistory({ data }: { data: TransfersResponse }) {
  return (
    <section>
      <h2>Free transfers</h2>
      <p className="muted">
        Worked out from your season history: 1 a week, banked up to {data.maxFreeTransfers}; a Wildcard or Free Hit
        keeps what you had.
      </p>
      <div className="formation-list">
        {data.freeTransferHistory.map((w) => (
          <div key={w.gameweek} className="formation">
            <strong>GW{w.gameweek}</strong>
            <span>
              {w.transfers} made{w.chip ? ` · ${CHIPS[w.chip] ?? w.chip}` : ''}
            </span>
            <span className="muted">{w.freeAfter} free after</span>
          </div>
        ))}
      </div>
    </section>
  );
}

interface Props {
  onUnauthorized: () => void;
}

export function TransfersPage({ onUnauthorized }: Props) {
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
          Predicted over {horizonLabel(data.gameweeks)} · fetched at {time(data.cache.fetchedAt)}
          {data.cache.fromCache ? ' (cached)' : ''}
        </p>
      )}

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {!data && loading && <p className="muted">Searching transfers…</p>}

      {data && (
        <>
          <dl className="stat-tiles">
            <div className="stat-tile">
              <dt>Free transfers</dt>
              <dd>
                {data.freeTransfers} <span className="muted">of {data.maxFreeTransfers}</span>
              </dd>
            </div>
            <div className="stat-tile">
              <dt>In the bank</dt>
              <dd>{money(data.bank)}</dd>
            </div>
            <div className="stat-tile">
              <dt>Squad · {horizonLabel(data.gameweeks)}</dt>
              <dd>
                {pts(data.squadPoints)} <span className="muted">pts</span>
              </dd>
            </div>
            <div className="stat-tile">
              <dt>Best move</dt>
              <dd className={data.recommended.netGain > 0 ? 'gain' : ''}>
                {data.recommended.moves.length === 0 ? 'Save' : signed(data.recommended.netGain)}
              </dd>
            </div>
          </dl>
          <p className="muted next-note">
            FPL only shows transfers after each deadline, so moves you've already made for GW{data.gameweek} aren't
            counted.
          </p>

          <Recommendation data={data} />

          <section>
            <div className="h2h-controls">
              <div className="segmented" role="group" aria-label="Number of transfers">
                {([1, 2] as const).map((n) => (
                  <button key={n} className={count === n ? 'active' : ''} onClick={() => setCount(n)}>
                    {n} transfer{n === 1 ? '' : 's'}
                  </button>
                ))}
              </div>
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
