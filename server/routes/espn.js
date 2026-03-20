const express = require('express');
const axios = require('axios');

const router = express.Router();

const POSITION_MAP = {
  1: 'QB', 2: 'RB', 3: 'WR', 4: 'TE', 5: 'K', 16: 'DST',
};

function findCurrentMatchup(schedule, scoringPeriodId, teamId) {
  return schedule.find(
    (matchup) =>
      matchup.matchupPeriodId === scoringPeriodId &&
      (matchup.home?.teamId === teamId || matchup.away?.teamId === teamId)
  ) || null;
}

function extractRosterPlayers(team) {
  if (!team || !team.roster || !team.roster.entries) return [];
  return team.roster.entries.map((entry) => {
    const player = entry.playerPoolEntry?.player || {};
    return {
      playerId: player.id,
      name: player.fullName || 'Unknown',
      position: POSITION_MAP[player.defaultPositionId] || 'FLEX',
      projectedPoints: entry.playerPoolEntry?.appliedStatTotal || 0,
    };
  });
}

function crossReferencePlayerAcrossLeagues(leaguesData, focusLeagueId) {
  const focusLeague = leaguesData.find((l) => l.leagueId === focusLeagueId);
  if (!focusLeague || !focusLeague.opponentRoster) return [];

  const otherLeagues = leaguesData.filter((l) => l.leagueId !== focusLeagueId);

  return focusLeague.opponentRoster.map((opponentPlayer) => {
    const crossRefs = [];
    for (const league of otherLeagues) {
      const myRoster = league.myRoster || [];
      const found = myRoster.find((p) => p.playerId === opponentPlayer.playerId);
      if (found) {
        crossRefs.push({ leagueId: league.leagueId, leagueName: league.leagueName });
      }
    }
    return {
      player: opponentPlayer,
      focusLeagueId,
      crossReferencedIn: crossRefs,
    };
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

async function fetchESPNLeague({ leagueId, espnS2, swid, year, teamId }) {
  const url = `https://fantasy.espn.com/apis/v3/games/ffl/seasons/${year}/segments/0/leagues/${leagueId}`;
  const params = { view: ['mTeam', 'mRoster', 'mMatchup', 'mMatchupScore'] };
  const headers = { 'Content-Type': 'application/json' };
  if (espnS2 && swid) {
    headers['Cookie'] = `espn_s2=${espnS2}; SWID=${swid}`;
  }

  const response = await axios.get(url, {
    params,
    headers,
    paramsSerializer: (p) => {
      return Object.entries(p)
        .flatMap(([k, v]) => (Array.isArray(v) ? v.map((val) => `${k}=${val}`) : [`${k}=${v}`]))
        .join('&');
    },
  });

  return response.data;
}

router.post('/api/league', async (req, res) => {
  try {
    const { leagueId, espnS2, swid, year = 2024, teamId } = req.body;
    if (!leagueId || !teamId) {
      return res.status(400).json({ error: 'leagueId and teamId are required' });
    }

    const data = await fetchESPNLeague({ leagueId, espnS2, swid, year, teamId });

    const teams = (data.teams || []).map((t) => ({
      id: t.id,
      name: `${t.location || ''} ${t.nickname || ''}`.trim() || t.abbrev,
      abbrev: t.abbrev,
    }));

    const myTeam = teams.find((t) => t.id === teamId);
    const scoringPeriodId = data.scoringPeriodId;
    const currentMatchup = findCurrentMatchup(data.schedule || [], scoringPeriodId, teamId);

    let opponentId = null;
    let opponentScore = null;
    let myScore = null;

    if (currentMatchup) {
      if (currentMatchup.home?.teamId === teamId) {
        opponentId = currentMatchup.away?.teamId;
        myScore = currentMatchup.home?.totalPoints;
        opponentScore = currentMatchup.away?.totalPoints;
      } else {
        opponentId = currentMatchup.home?.teamId;
        myScore = currentMatchup.away?.totalPoints;
        opponentScore = currentMatchup.home?.totalPoints;
      }
    }

    const opponentTeamRaw = (data.teams || []).find((t) => t.id === opponentId);
    const myTeamRaw = (data.teams || []).find((t) => t.id === teamId);

    const opponentRoster = extractRosterPlayers(opponentTeamRaw);
    const myRoster = extractRosterPlayers(myTeamRaw);
    const opponentTeam = teams.find((t) => t.id === opponentId);

    res.json({
      leagueId,
      leagueName: data.settings?.name || `League ${leagueId}`,
      teams,
      scoringPeriodId,
      myTeam,
      myScore,
      opponentTeam,
      opponentScore,
      opponentRoster,
      myRoster,
    });
  } catch (err) {
    const status = err.response?.status || 500;
    const message = err.response?.data?.message || err.message || 'Failed to fetch league data';
    res.status(status).json({ error: message });
  }
});

router.post('/api/leagues/bulk', async (req, res) => {
  try {
    const { leagues } = req.body;
    if (!Array.isArray(leagues) || leagues.length === 0) {
      return res.status(400).json({ error: 'leagues array is required' });
    }

    const results = await Promise.allSettled(
      leagues.map((cfg) => fetchESPNLeague(cfg).then((data) => ({ cfg, data })))
    );

    const leaguesData = results.map((result, i) => {
      if (result.status === 'rejected') {
        return { leagueId: leagues[i].leagueId, error: result.reason?.message || 'Failed' };
      }
      const { cfg, data } = result.value;
      const { leagueId, teamId, year } = cfg;

      const teams = (data.teams || []).map((t) => ({
        id: t.id,
        name: `${t.location || ''} ${t.nickname || ''}`.trim() || t.abbrev,
        abbrev: t.abbrev,
      }));

      const myTeam = teams.find((t) => t.id === teamId);
      const scoringPeriodId = data.scoringPeriodId;
      const currentMatchup = findCurrentMatchup(data.schedule || [], scoringPeriodId, teamId);

      let opponentId = null;
      let myScore = null;
      let opponentScore = null;

      if (currentMatchup) {
        if (currentMatchup.home?.teamId === teamId) {
          opponentId = currentMatchup.away?.teamId;
          myScore = currentMatchup.home?.totalPoints;
          opponentScore = currentMatchup.away?.totalPoints;
        } else {
          opponentId = currentMatchup.home?.teamId;
          myScore = currentMatchup.away?.totalPoints;
          opponentScore = currentMatchup.home?.totalPoints;
        }
      }

      const opponentTeamRaw = (data.teams || []).find((t) => t.id === opponentId);
      const myTeamRaw = (data.teams || []).find((t) => t.id === teamId);

      return {
        leagueId,
        leagueName: data.settings?.name || `League ${leagueId}`,
        teams,
        scoringPeriodId,
        myTeam,
        myScore,
        opponentTeam: teams.find((t) => t.id === opponentId),
        opponentScore,
        opponentRoster: extractRosterPlayers(opponentTeamRaw),
        myRoster: extractRosterPlayers(myTeamRaw),
      };
    });

    res.json({ leagues: leaguesData });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to fetch leagues' });
  }
});

module.exports = router;
module.exports.findCurrentMatchup = findCurrentMatchup;
module.exports.extractRosterPlayers = extractRosterPlayers;
module.exports.crossReferencePlayerAcrossLeagues = crossReferencePlayerAcrossLeagues;
module.exports.calculateMarginAnalysis = calculateMarginAnalysis;
