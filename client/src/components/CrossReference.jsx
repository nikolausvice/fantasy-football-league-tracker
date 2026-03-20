import React, { useMemo } from 'react';

function crossReferencePlayerAcrossLeagues(leaguesData, focusLeagueId) {
  const focusLeague = leaguesData.find((l) => String(l.leagueId) === String(focusLeagueId));
  if (!focusLeague || !focusLeague.opponentRoster) return [];

  const otherLeagues = leaguesData.filter((l) => String(l.leagueId) !== String(focusLeagueId));

  return focusLeague.opponentRoster.map((opponentPlayer) => {
    const crossRefs = [];
    for (const league of otherLeagues) {
      const myRoster = league.myRoster || [];
      const found = myRoster.find((p) => p.playerId === opponentPlayer.playerId);
      if (found) {
        crossRefs.push({ leagueId: league.leagueId, leagueName: league.leagueName });
      }
    }
    return { player: opponentPlayer, focusLeagueId, crossReferencedIn: crossRefs };
  });
}

function calculateMarginAnalysis(crossRefData) {
  return crossRefData.map((item) => {
    const benefit = item.crossReferencedIn.length;
    const harm = 1;
    const net = benefit - harm;
    return {
      ...item,
      benefit,
      harm,
      net,
      recommendation: net > 0 ? 'Root for: High score' : net < 0 ? 'Root for: Low score' : 'Neutral',
    };
  });
}

function NetBadge({ net }) {
  if (net > 0) return <span className="px-2 py-0.5 text-xs rounded-full bg-green-900/60 text-green-300 font-semibold">+{net} Net</span>;
  if (net < 0) return <span className="px-2 py-0.5 text-xs rounded-full bg-red-900/60 text-red-300 font-semibold">{net} Net</span>;
  return <span className="px-2 py-0.5 text-xs rounded-full bg-gray-700 text-gray-400 font-semibold">0 Net</span>;
}

function RecommendationBadge({ recommendation }) {
  if (recommendation === 'Root for: High score')
    return <span className="text-xs font-semibold text-green-400">📈 Root for: High Score</span>;
  if (recommendation === 'Root for: Low score')
    return <span className="text-xs font-semibold text-red-400">📉 Root for: Low Score</span>;
  return <span className="text-xs font-semibold text-gray-400">⚖️ Neutral</span>;
}

export default function CrossReference({ leagues }) {
  const validLeagues = useMemo(
    () => (leagues || []).filter((l) => !l.error && l.opponentRoster && l.myRoster),
    [leagues]
  );

  const crossRefData = useMemo(() => {
    if (validLeagues.length < 2) return [];
    const all = [];
    for (const league of validLeagues) {
      const raw = crossReferencePlayerAcrossLeagues(validLeagues, league.leagueId);
      const withMargin = calculateMarginAnalysis(raw);
      const interesting = withMargin.filter((x) => x.crossReferencedIn.length > 0);
      if (interesting.length > 0) {
        all.push({ league, players: interesting });
      }
    }
    return all;
  }, [validLeagues]);

  if (validLeagues.length < 2) {
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 text-center text-gray-500 text-sm">
        <p className="font-medium">Cross-Reference Analysis</p>
        <p className="text-xs mt-1">Connect at least 2 leagues to see player cross-reference analysis.</p>
      </div>
    );
  }

  if (crossRefData.length === 0) {
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 text-center text-gray-500 text-sm">
        <p className="font-medium">No shared players found</p>
        <p className="text-xs mt-1">None of your opponents' players appear on your rosters in other leagues.</p>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-lg font-semibold text-white mb-3">Cross-Reference Analysis</h2>
      <p className="text-xs text-gray-400 mb-4">
        Shows opponent players who also appear on your rosters in other leagues, and whether you should root for them to score high or low.
      </p>
      <div className="space-y-6">
        {crossRefData.map(({ league, players }) => (
          <div key={league.leagueId} className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
            <div className="px-4 py-3 bg-gray-800/60 border-b border-gray-800">
              <h3 className="text-sm font-semibold text-white">
                {league.leagueName}
                <span className="ml-2 text-gray-400 font-normal text-xs">— opponent: {league.opponentTeam?.name}</span>
              </h3>
            </div>
            <div className="divide-y divide-gray-800">
              {players.map(({ player, crossReferencedIn, net, recommendation }) => (
                <div
                  key={player.playerId}
                  className={`px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-2 ${
                    net > 0 ? 'bg-green-950/20' : net < 0 ? 'bg-red-950/20' : ''
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-gray-100">{player.name}</span>
                      <span className="text-xs text-gray-500">{player.position}</span>
                      <NetBadge net={net} />
                    </div>
                    <div className="mt-1 text-xs text-gray-400">
                      Also on your roster in:{' '}
                      {crossReferencedIn.map((ref, i) => (
                        <span key={ref.leagueId} className="text-blue-400">
                          {ref.leagueName}{i < crossReferencedIn.length - 1 ? ', ' : ''}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-gray-500 shrink-0">
                    <span>Benefit: <span className="text-green-400 font-medium">{crossReferencedIn.length}</span></span>
                    <span>Harm: <span className="text-red-400 font-medium">1</span></span>
                    <RecommendationBadge recommendation={recommendation} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
