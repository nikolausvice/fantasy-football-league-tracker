import React from 'react';

export default function LeagueList({ leagues, onRemove, onRefresh, loading }) {
  if (!leagues || leagues.length === 0) return null;

  return (
    <div>
      <h2 className="text-lg font-semibold text-white mb-3">Connected Leagues</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {leagues.map((league) => (
          <div key={league.leagueId} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            {league.error ? (
              <div>
                <p className="text-sm font-medium text-red-400">League {league.leagueId}</p>
                <p className="text-xs text-gray-500 mt-1">{league.error}</p>
              </div>
            ) : (
              <>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold text-white truncate">{league.leagueName}</h3>
                    <p className="text-xs text-gray-400 mt-0.5">
                      My team: <span className="text-blue-400">{league.myTeam?.name || '—'}</span>
                    </p>
                  </div>
                  <button
                    onClick={() => onRemove(league.leagueId)}
                    className="text-xs text-gray-500 hover:text-red-400 transition shrink-0"
                    title="Remove league"
                  >
                    ✕
                  </button>
                </div>
                <div className="mt-3 pt-3 border-t border-gray-800 text-xs text-gray-400 space-y-1">
                  <div className="flex justify-between">
                    <span>Week {league.scoringPeriodId}</span>
                    <span className="text-gray-500">vs {league.opponentTeam?.name || 'TBD'}</span>
                  </div>
                  {league.myScore != null && (
                    <div className="flex justify-between font-medium">
                      <span className="text-green-400">{league.myScore?.toFixed(2)}</span>
                      <span className="text-red-400">{league.opponentScore?.toFixed(2)}</span>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
