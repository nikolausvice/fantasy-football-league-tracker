import React from 'react';

const POSITION_COLORS = {
  QB: 'bg-red-900/60 text-red-300',
  RB: 'bg-green-900/60 text-green-300',
  WR: 'bg-blue-900/60 text-blue-300',
  TE: 'bg-yellow-900/60 text-yellow-300',
  K: 'bg-purple-900/60 text-purple-300',
  DST: 'bg-gray-700 text-gray-300',
  FLEX: 'bg-gray-700 text-gray-300',
};

function PositionBadge({ position }) {
  const cls = POSITION_COLORS[position] || 'bg-gray-700 text-gray-300';
  return (
    <span className={`inline-block text-[10px] font-bold px-1.5 py-0.5 rounded ${cls}`}>
      {position}
    </span>
  );
}

function PlayerRow({ player }) {
  return (
    <div className="flex items-center gap-3 py-2 border-b border-gray-800 last:border-0">
      <PositionBadge position={player.position} />
      <span className="flex-1 text-sm text-gray-200">{player.name}</span>
      <span className="text-xs text-gray-400 font-mono">
        {typeof player.projectedPoints === 'number' ? player.projectedPoints.toFixed(1) : '—'}
      </span>
    </div>
  );
}

export default function MatchupView({ leagues }) {
  const validLeagues = (leagues || []).filter((l) => !l.error && l.opponentRoster);
  if (validLeagues.length === 0) return null;

  return (
    <div>
      <h2 className="text-lg font-semibold text-white mb-3">Current Matchups</h2>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {validLeagues.map((league) => (
          <div key={league.leagueId} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-sm font-semibold text-white">{league.leagueName}</h3>
                <p className="text-xs text-gray-400">Week {league.scoringPeriodId}</p>
              </div>
              <div className="text-right">
                <div className="text-xs text-gray-500">Score</div>
                <div className="text-sm font-mono">
                  <span className="text-green-400">{league.myScore?.toFixed(2) ?? '—'}</span>
                  <span className="text-gray-600 mx-1">vs</span>
                  <span className="text-red-400">{league.opponentScore?.toFixed(2) ?? '—'}</span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-xs font-medium text-blue-400 mb-2">
                  My Team — {league.myTeam?.name}
                </p>
                {(league.myRoster || []).length === 0 ? (
                  <p className="text-xs text-gray-500 italic">No roster data</p>
                ) : (
                  (league.myRoster || []).map((player) => (
                    <PlayerRow key={player.playerId} player={player} />
                  ))
                )}
              </div>
              <div>
                <p className="text-xs font-medium text-red-400 mb-2">
                  Opponent — {league.opponentTeam?.name}
                </p>
                {(league.opponentRoster || []).length === 0 ? (
                  <p className="text-xs text-gray-500 italic">No roster data</p>
                ) : (
                  (league.opponentRoster || []).map((player) => (
                    <PlayerRow key={player.playerId} player={player} />
                  ))
                )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
