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

function findMostRecentMatchup(schedule, teamId) {
  const teamMatchups = schedule.filter(
    (m) => m.home?.teamId === teamId || m.away?.teamId === teamId
  );
  if (teamMatchups.length === 0) return null;
  return teamMatchups.reduce((best, m) =>
    m.matchupPeriodId > best.matchupPeriodId ? m : best
  );
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

function sanitizeCookieValue(value) {
  if (!value || typeof value !== 'string') return '';
  return value.trim().replace(/^["']|["']$/g, '');
}

function sanitizeSWID(value) {
  let cleaned = sanitizeCookieValue(value);
  if (!cleaned) return '';
  // Strip any existing braces, then re-wrap to guarantee exactly one pair
  cleaned = cleaned.replace(/^\{+/, '').replace(/\}+$/, '');
  return `{${cleaned}}`;
}

async function fetchESPNLeague({ leagueId, espnS2, swid, year, teamId }) {
  const url = `https://lm-api-reads.fantasy.espn.com/apis/v3/games/ffl/seasons/${year}/segments/0/leagues/${leagueId}`;
  const params = { view: ['mTeam', 'mRoster', 'mMatchup', 'mMatchupScore'] };
  const headers = {
    'Accept': 'application/json',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  };

  const cleanS2 = sanitizeCookieValue(espnS2);
  const cleanSWID = sanitizeSWID(swid);

  if (cleanS2 && cleanSWID) {
    headers['Cookie'] = `espn_s2=${cleanS2}; SWID=${cleanSWID}`;
  }

  console.log('[ESPN REQUEST]', {
    url,
    year,
    leagueId,
    hasCookies: !!(cleanS2 && cleanSWID),
    cookiePreview: cleanS2 ? `espn_s2=${cleanS2.slice(0, 20)}...; SWID=${cleanSWID}` : 'none',
  });

  let response;
  try {
    response = await axios.get(url, {
      params,
      headers,
      timeout: 15000,
      maxRedirects: 0,
      validateStatus: (status) => status < 400,
      paramsSerializer: (p) => {
        return Object.entries(p)
          .flatMap(([k, v]) => (Array.isArray(v) ? v.map((val) => `${k}=${val}`) : [`${k}=${v}`]))
          .join('&');
      },
    });
  } catch (axiosErr) {
    const status = axiosErr.response?.status;
    if (status === 401 || status === 403) {
      const err = new Error(
        cleanS2 && cleanSWID
          ? 'ESPN rejected the request — your espn_s2/SWID cookies may be expired or invalid. Please copy fresh cookies from your browser.'
          : 'ESPN requires authentication for this league. Click "Show private league cookies" and enter your espn_s2 and SWID cookies.'
      );
      err.status = status;
      throw err;
    }
    if (status === 404) {
      const err = new Error(`League ${leagueId} not found. Please check the league ID and season year.`);
      err.status = 404;
      throw err;
    }
    if (status === 429) {
      const err = new Error('Too many requests to ESPN. Please wait a moment and try again.');
      err.status = 429;
      throw err;
    }
    if (status >= 400) {
      const err = new Error(axiosErr.message || `ESPN returned an error (HTTP ${status}).`);
      err.status = status;
      throw err;
    }
    throw axiosErr;
  }

  console.log('[ESPN RESPONSE]', {
    status: response.status,
    contentType: response.headers?.['content-type'] || 'unknown',
    isHTML: typeof response.data === 'string' && response.data.trimStart().startsWith('<'),
    dataType: typeof response.data,
    topLevelKeys: typeof response.data === 'object' ? Object.keys(response.data).slice(0, 10) : 'not an object',
  });

  const data = response.data;

  // ESPN returns HTML when the request is rejected (private league / bad cookies / redirect)
  if (typeof data === 'string' && data.trimStart().startsWith('<')) {
    const err = new Error(
      cleanS2 && cleanSWID
        ? 'ESPN rejected the request — your espn_s2/SWID cookies may be expired. Please copy fresh cookies from your browser.'
        : 'ESPN requires authentication for this league. Click "Show private league cookies" and enter your espn_s2 and SWID cookies.'
    );
    err.status = 401;
    throw err;
  }

  return data;
}

router.post('/api/debug-league', async (req, res) => {
  try {
    const { leagueId, espnS2, swid, year = 2024, teamId } = req.body;
    if (!leagueId || !teamId) {
      return res.status(400).json({ error: 'leagueId and teamId are required' });
    }
    const data = await fetchESPNLeague({ leagueId, espnS2, swid, year, teamId });
    const myTeamRaw = (data.teams || []).find((t) => t.id === teamId);
    res.json({
      scoringPeriodId: data.scoringPeriodId,
      scheduleLength: (data.schedule || []).length,
      teamCount: (data.teams || []).length,
      myTeamFound: !!myTeamRaw,
      myTeamId: myTeamRaw?.id,
      myTeamRosterEntriesCount: myTeamRaw?.roster?.entries?.length ?? 'NO ROSTER KEY',
      firstEntryKeys: myTeamRaw?.roster?.entries?.[0] ? Object.keys(myTeamRaw.roster.entries[0]) : [],
      firstPlayerPoolEntry: myTeamRaw?.roster?.entries?.[0]?.playerPoolEntry ?? null,
      sampleTeamKeys: myTeamRaw ? Object.keys(myTeamRaw) : [],
    });
  } catch (err) {
    const status = err.response?.status || 500;
    res.status(status).json({ error: err.message, espnBody: err.response?.data });
  }
});

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
    const currentMatchup = findCurrentMatchup(data.schedule || [], scoringPeriodId, teamId)
      || findMostRecentMatchup(data.schedule || [], teamId);

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

    // DEBUG — remove once roster issue is resolved
    console.log('[DEBUG top-level keys]', Object.keys(data));
    console.log('[DEBUG raw snippet]', JSON.stringify(data).slice(0, 1000));
    console.log('[DEBUG parsed]', {
      scoringPeriodId,
      scheduleLength: (data.schedule || []).length,
      teamCount: (data.teams || []).length,
      myTeamFound: !!myTeamRaw,
      opponentId,
      myRosterCount: myRoster.length,
      opponentRosterCount: opponentRoster.length,
    });

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
    const status = err.status || err.response?.status || 500;
    const message = err.message || err.response?.data?.message || 'Failed to fetch league data';
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
      const currentMatchup = findCurrentMatchup(data.schedule || [], scoringPeriodId, teamId)
        || findMostRecentMatchup(data.schedule || [], teamId);

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
module.exports.findMostRecentMatchup = findMostRecentMatchup;
module.exports.extractRosterPlayers = extractRosterPlayers;
module.exports.crossReferencePlayerAcrossLeagues = crossReferencePlayerAcrossLeagues;
module.exports.calculateMarginAnalysis = calculateMarginAnalysis;
module.exports.sanitizeCookieValue = sanitizeCookieValue;
module.exports.sanitizeSWID = sanitizeSWID;
