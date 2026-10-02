import type { HeadToHeadMatch, PlayerHeadToHead, Verdict } from '../types.ts';
import { FixtureChip } from './FixtureChip.tsx';

const VERDICT_LABELS: Record<Verdict, string> = {
  good: 'Good record',
  average: 'Average record',
  poor: 'Poor record',
  none: 'No history',
};

const date = (iso: string | null): string =>
  iso ? new Date(iso).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

/** "LIV 2–0 ARS", home side first. */
function scoreline(m: HeadToHeadMatch): string {
  const club = m.teamShortName ?? '?';
  const [home, away] = m.wasHome ? [club, m.opponentShortName] : [m.opponentShortName, club];
  const score = m.teamHScore === null || m.teamAScore === null ? 'v' : `${m.teamHScore}–${m.teamAScore}`;
  return `${home} ${score} ${away}`;
}

const xg = (value: number | null): string => (value === null ? '—' : value.toFixed(2));

interface Props {
  data: PlayerHeadToHead;
  /** Shown next to the name, e.g. "In your squad" for a scouted player. */
  tag?: string;
}

export function HeadToHeadCard({ data, tag }: Props) {
  const { player, nextFixture, matches, summary } = data;

  return (
    <article className="h2h-card">
      <header className="h2h-header">
        <div>
          <h3>
            {player.webName}
            {tag && <span className="tag">{tag}</span>}
          </h3>
          <span className="muted">
            {player.clubShortName} · {player.position}
            {player.pickPosition !== null && !player.isStarter && ' · bench'}
          </span>
        </div>
        <div className="h2h-next">
          {nextFixture ? (
            <>
              <span className="muted">Next · GW{nextFixture.gameweek}</span>
              <FixtureChip fixture={nextFixture} />
            </>
          ) : (
            <span className="muted">No upcoming fixture</span>
          )}
        </div>
      </header>

      <div className="h2h-summary">
        <span className={`verdict verdict-${summary.verdict}`}>{VERDICT_LABELS[summary.verdict]}</span>
        {summary.matches > 0 && (
          <span className="muted">
            {summary.matches} {summary.matches === 1 ? 'match' : 'matches'} · {summary.averagePoints} pts avg ·{' '}
            {summary.goals}G {summary.assists}A · {summary.cleanSheets} CS · {summary.bonus} bonus
            {summary.cards > 0 && ` · ${summary.cards} ${summary.cards === 1 ? 'card' : 'cards'}`}
          </span>
        )}
      </div>

      {matches.length === 0 ? (
        <p className="muted h2h-empty">
          {nextFixture
            ? `Hasn't played against ${nextFixture.opponent} in the seasons covered.`
            : 'Nothing to compare yet.'}
        </p>
      ) : (
        <div className="table-wrap">
          <table className="players h2h-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Match</th>
                <th className="num" title="Minutes">Mins</th>
                <th className="num" title="Goals">G</th>
                <th className="num" title="Assists">A</th>
                <th className="num" title="Clean sheet">CS</th>
                <th className="num" title="Bonus points">Bonus</th>
                <th className="num" title="Expected goals">xG</th>
                <th className="num" title="Expected assists">xA</th>
                <th className="num" title="FPL points">Pts</th>
                <th>What drove the points</th>
              </tr>
            </thead>
            <tbody>
              {matches.map((m) => (
                <tr key={`${m.season}-${m.fixtureId}`}>
                  <td>
                    <div className="cell-player">
                      <span>{date(m.kickoffTime)}</span>
                      <span className="muted">{m.season}</span>
                    </div>
                  </td>
                  <td className="nowrap">
                    {m.result && <span className={`result result-${m.result}`}>{m.result}</span>}
                    {scoreline(m)}
                  </td>
                  <td className="num">{m.minutes}</td>
                  <td className="num">{m.goals}</td>
                  <td className="num">{m.assists}</td>
                  <td className="num">{m.cleanSheets}</td>
                  <td className="num">{m.bonus}</td>
                  <td className="num">{xg(m.expectedGoals)}</td>
                  <td className="num">{xg(m.expectedAssists)}</td>
                  <td className="num">
                    <strong>{m.totalPoints}</strong>
                  </td>
                  <td>
                    <div className="insights">
                      {m.insights.map((i) => (
                        <span key={i.label} className={`insight insight-${i.tone}`}>
                          {i.label}
                        </span>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </article>
  );
}
