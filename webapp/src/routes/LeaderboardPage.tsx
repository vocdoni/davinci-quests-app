import type { LeaderboardRow } from '../hooks/useLeaderboard'

type LeaderboardPageProps = {
  errorMessage: string | null
  isLoading: boolean
  rows: LeaderboardRow[]
}

function formatTimestamp(value: string | null) {
  if (!value) {
    return 'Not synced yet'
  }

  const timestamp = new Date(value)

  if (Number.isNaN(timestamp.getTime())) {
    return 'Not synced yet'
  }

  return timestamp.toLocaleString()
}

export function LeaderboardPage({
  errorMessage,
  isLoading,
  rows,
}: LeaderboardPageProps) {
  return (
    <section className="profile-stack">
      <div className="content-panel page-panel">
        <p className="section-eyebrow">Leaderboard</p>
        <h1 className="page-title">See who is leading the quests.</h1>
        <p className="body-copy">
          Rankings come from the backend snapshot, including supporter and builder
          breakdowns.
        </p>
      </div>

      <div className="content-panel page-panel">
        {isLoading ? (
          <p className="body-copy leaderboard-state-copy">Loading leaderboard...</p>
        ) : errorMessage ? (
          <p className="body-copy leaderboard-state-copy">{errorMessage}</p>
        ) : rows.length === 0 ? (
          <p className="body-copy leaderboard-state-copy">
            No ranked wallets yet. Sign in once to join the board.
          </p>
        ) : (
          <div className="leaderboard-table-shell">
            <table className="leaderboard-table">
              <thead>
                <tr>
                  <th scope="col">Rank</th>
                  <th scope="col">Player</th>
                  <th scope="col">Supporters</th>
                  <th scope="col">Builders</th>
                  <th scope="col">Total</th>
                  <th scope="col">Updated</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.walletAddress}>
                    <td>#{row.rank}</td>
                    <td>
                      <div className="leaderboard-player-cell">
                        <span className="leaderboard-player-name">{row.displayName}</span>
                        <span className="leaderboard-player-address">{row.walletAddress}</span>
                      </div>
                    </td>
                    <td>{row.supportersPoints} pts</td>
                    <td>{row.buildersPoints} pts</td>
                    <td className="leaderboard-total-points">{row.totalPoints} pts</td>
                    <td>{formatTimestamp(row.lastComputedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  )
}
