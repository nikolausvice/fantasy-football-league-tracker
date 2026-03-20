const request = require('supertest');
const axios = require('axios');
const app = require('../index');
const {
  findCurrentMatchup,
  findMostRecentMatchup,
  extractRosterPlayers,
  crossReferencePlayerAcrossLeagues,
  calculateMarginAnalysis,
  sanitizeCookieValue,
  sanitizeSWID,
} = require('../routes/espn');

jest.mock('axios');

// ── Helper data ──────────────────────────────────────────────────────────────

const makePlayer = (id, fullName, defaultPositionId = 2) => ({
  id,
  fullName,
  defaultPositionId,
});

const makeEntry = (player, appliedStatTotal = 10) => ({
  playerPoolEntry: { player, appliedStatTotal },
});

const makeTeam = (id, entries) => ({
  id,
  roster: { entries },
});

const makeMatchup = (matchupPeriodId, homeId, awayId) => ({
  matchupPeriodId,
  home: { teamId: homeId, totalPoints: 100 },
  away: { teamId: awayId, totalPoints: 90 },
});

// ── findCurrentMatchup ───────────────────────────────────────────────────────

describe('findCurrentMatchup', () => {
  const schedule = [
    makeMatchup(1, 1, 2),
    makeMatchup(2, 1, 3),
    makeMatchup(2, 4, 5),
  ];

  test('finds matchup for home team in current period', () => {
    const result = findCurrentMatchup(schedule, 2, 1);
    expect(result).toBeTruthy();
    expect(result.home.teamId).toBe(1);
    expect(result.away.teamId).toBe(3);
  });

  test('finds matchup for away team in current period', () => {
    const result = findCurrentMatchup(schedule, 2, 5);
    expect(result).toBeTruthy();
    expect(result.home.teamId).toBe(4);
  });

  test('returns null when no matchup found', () => {
    const result = findCurrentMatchup(schedule, 3, 1);
    expect(result).toBeNull();
  });

  test('returns null for empty schedule', () => {
    expect(findCurrentMatchup([], 1, 1)).toBeNull();
  });
});

// ── findMostRecentMatchup ────────────────────────────────────────────────────

describe('findMostRecentMatchup', () => {
  const schedule = [
    makeMatchup(1, 1, 2),
    makeMatchup(2, 1, 3),
    makeMatchup(3, 4, 5),
  ];

  test('returns the highest-period matchup for the team', () => {
    const result = findMostRecentMatchup(schedule, 1);
    expect(result).toBeTruthy();
    expect(result.matchupPeriodId).toBe(2);
  });

  test('returns correct matchup when team is away side', () => {
    const result = findMostRecentMatchup(schedule, 5);
    expect(result).toBeTruthy();
    expect(result.matchupPeriodId).toBe(3);
  });

  test('returns null when team has no matchups', () => {
    expect(findMostRecentMatchup(schedule, 99)).toBeNull();
  });

  test('returns null for empty schedule', () => {
    expect(findMostRecentMatchup([], 1)).toBeNull();
  });
});

// ── extractRosterPlayers ─────────────────────────────────────────────────────

describe('extractRosterPlayers', () => {
  test('extracts players from team roster', () => {
    const team = makeTeam(1, [
      makeEntry(makePlayer(101, 'Patrick Mahomes', 1), 30),
      makeEntry(makePlayer(102, 'Davante Adams', 3), 20),
    ]);
    const players = extractRosterPlayers(team);
    expect(players).toHaveLength(2);
    expect(players[0]).toMatchObject({ playerId: 101, name: 'Patrick Mahomes', position: 'QB', projectedPoints: 30 });
    expect(players[1]).toMatchObject({ playerId: 102, name: 'Davante Adams', position: 'WR', projectedPoints: 20 });
  });

  test('returns empty array for team with no roster', () => {
    expect(extractRosterPlayers({ id: 1 })).toEqual([]);
    expect(extractRosterPlayers(null)).toEqual([]);
    expect(extractRosterPlayers(undefined)).toEqual([]);
  });

  test('uses FLEX for unknown position id', () => {
    const team = makeTeam(1, [makeEntry(makePlayer(103, 'John Doe', 99))]);
    const players = extractRosterPlayers(team);
    expect(players[0].position).toBe('FLEX');
  });
});

// ── crossReferencePlayerAcrossLeagues ────────────────────────────────────────

describe('crossReferencePlayerAcrossLeagues', () => {
  const leaguesData = [
    {
      leagueId: 'A',
      leagueName: 'League A',
      opponentRoster: [
        { playerId: 1, name: 'Player One', position: 'RB' },
        { playerId: 2, name: 'Player Two', position: 'WR' },
        { playerId: 3, name: 'Player Three', position: 'QB' },
      ],
      myRoster: [{ playerId: 10, name: 'My Player', position: 'QB' }],
    },
    {
      leagueId: 'B',
      leagueName: 'League B',
      opponentRoster: [{ playerId: 10, name: 'My Player', position: 'QB' }],
      myRoster: [
        { playerId: 1, name: 'Player One', position: 'RB' },
        { playerId: 5, name: 'Player Five', position: 'WR' },
      ],
    },
    {
      leagueId: 'C',
      leagueName: 'League C',
      opponentRoster: [],
      myRoster: [{ playerId: 1, name: 'Player One', position: 'RB' }],
    },
  ];

  test('identifies players shared between opponent and other league rosters', () => {
    const crossRef = crossReferencePlayerAcrossLeagues(leaguesData, 'A');
    const playerOne = crossRef.find((x) => x.player.playerId === 1);
    expect(playerOne).toBeTruthy();
    expect(playerOne.crossReferencedIn).toHaveLength(2);
    expect(playerOne.crossReferencedIn.map((r) => r.leagueId)).toEqual(expect.arrayContaining(['B', 'C']));
  });

  test('returns empty crossReferencedIn for players not on other rosters', () => {
    const crossRef = crossReferencePlayerAcrossLeagues(leaguesData, 'A');
    const playerThree = crossRef.find((x) => x.player.playerId === 3);
    expect(playerThree.crossReferencedIn).toHaveLength(0);
  });

  test('returns empty array when focus league not found', () => {
    expect(crossReferencePlayerAcrossLeagues(leaguesData, 'NONEXISTENT')).toEqual([]);
  });
});

// ── calculateMarginAnalysis ──────────────────────────────────────────────────

describe('calculateMarginAnalysis', () => {
  const crossRefData = [
    {
      player: { playerId: 1, name: 'Player One' },
      focusLeagueId: 'A',
      crossReferencedIn: [{ leagueId: 'B', leagueName: 'League B' }, { leagueId: 'C', leagueName: 'League C' }],
    },
    {
      player: { playerId: 2, name: 'Player Two' },
      focusLeagueId: 'A',
      crossReferencedIn: [],
    },
    {
      player: { playerId: 3, name: 'Player Three' },
      focusLeagueId: 'A',
      crossReferencedIn: [{ leagueId: 'B', leagueName: 'League B' }],
    },
  ];

  test('calculates net benefit correctly', () => {
    const result = calculateMarginAnalysis(crossRefData);
    expect(result[0].net).toBe(1);  // 2 benefits - 1 harm
    expect(result[1].net).toBe(-1); // 0 benefits - 1 harm
    expect(result[2].net).toBe(0);  // 1 benefit - 1 harm
  });

  test('assigns correct recommendation', () => {
    const result = calculateMarginAnalysis(crossRefData);
    expect(result[0].recommendation).toBe('Root for: High score');
    expect(result[1].recommendation).toBe('Root for: Low score');
    expect(result[2].recommendation).toBe('Neutral');
  });

  test('preserves player and league data', () => {
    const result = calculateMarginAnalysis(crossRefData);
    expect(result[0].player.name).toBe('Player One');
    expect(result[0].benefit).toBe(2);
    expect(result[0].harm).toBe(1);
  });
});

// ── API route: POST /api/league ──────────────────────────────────────────────

describe('POST /api/league', () => {
  const mockESPNResponse = {
    settings: { name: 'Test League' },
    scoringPeriodId: 5,
    teams: [
      {
        id: 1,
        location: 'Team',
        nickname: 'One',
        abbrev: 'T1',
        roster: {
          entries: [makeEntry(makePlayer(101, 'My QB', 1), 25)],
        },
      },
      {
        id: 2,
        location: 'Team',
        nickname: 'Two',
        abbrev: 'T2',
        roster: {
          entries: [makeEntry(makePlayer(201, 'Opp RB', 2), 18)],
        },
      },
    ],
    schedule: [makeMatchup(5, 1, 2)],
  };

  beforeEach(() => {
    axios.get.mockResolvedValue({ data: mockESPNResponse, status: 200, headers: { 'content-type': 'application/json' } });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('returns 400 when leagueId or teamId is missing', async () => {
    const res = await request(app).post('/api/league').send({ leagueId: 123 });
    expect(res.status).toBe(400);
    expect(res.body.error).toBeTruthy();
  });

  test('returns league data on success', async () => {
    const res = await request(app)
      .post('/api/league')
      .send({ leagueId: 123, teamId: 1, year: 2024 });
    expect(res.status).toBe(200);
    expect(res.body.leagueName).toBe('Test League');
    expect(res.body.scoringPeriodId).toBe(5);
    expect(res.body.myTeam).toMatchObject({ id: 1 });
    expect(res.body.opponentTeam).toMatchObject({ id: 2 });
    expect(res.body.opponentRoster).toHaveLength(1);
    expect(res.body.opponentRoster[0].name).toBe('Opp RB');
  });

  test('returns 500 on ESPN API error', async () => {
    axios.get.mockRejectedValue(new Error('Network error'));
    const res = await request(app)
      .post('/api/league')
      .send({ leagueId: 123, teamId: 1, year: 2024 });
    expect(res.status).toBe(500);
    expect(res.body.error).toBeTruthy();
  });

  test('passes sanitized cookies for private leagues', async () => {
    await request(app)
      .post('/api/league')
      .send({ leagueId: 123, teamId: 1, year: 2024, espnS2: '  abc  ', swid: '  {xyz}  ' });
    expect(axios.get).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({ Cookie: 'espn_s2=abc; SWID={xyz}' }),
      })
    );
  });

  test('uses lm-api-reads.fantasy.espn.com endpoint', async () => {
    await request(app)
      .post('/api/league')
      .send({ leagueId: 123, teamId: 1, year: 2024 });
    expect(axios.get).toHaveBeenCalledWith(
      expect.stringContaining('lm-api-reads.fantasy.espn.com'),
      expect.any(Object)
    );
  });

  test('returns 401 on ESPN 403 response', async () => {
    const axiosErr = new Error('Forbidden');
    axiosErr.response = { status: 403, data: 'Forbidden' };
    axios.get.mockRejectedValue(axiosErr);
    const res = await request(app)
      .post('/api/league')
      .send({ leagueId: 123, teamId: 1, year: 2024 });
    expect(res.status).toBe(401);
    expect(res.body.error).toMatch(/authentication/i);
  });

  test('returns 404 when league not found', async () => {
    const axiosErr = new Error('Not Found');
    axiosErr.response = { status: 404, data: 'Not Found' };
    axios.get.mockRejectedValue(axiosErr);
    const res = await request(app)
      .post('/api/league')
      .send({ leagueId: 999, teamId: 1, year: 2024 });
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found/i);
  });
});

// ── API route: POST /api/leagues/bulk ────────────────────────────────────────

describe('POST /api/leagues/bulk', () => {
  const mockESPNResponse = {
    settings: { name: 'Bulk League' },
    scoringPeriodId: 3,
    teams: [
      { id: 1, location: 'Alpha', nickname: 'Team', abbrev: 'AT', roster: { entries: [] } },
      { id: 2, location: 'Beta', nickname: 'Team', abbrev: 'BT', roster: { entries: [] } },
    ],
    schedule: [makeMatchup(3, 1, 2)],
  };

  beforeEach(() => {
    axios.get.mockResolvedValue({ data: mockESPNResponse, status: 200, headers: { 'content-type': 'application/json' } });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('returns 400 when leagues array is missing', async () => {
    const res = await request(app).post('/api/leagues/bulk').send({});
    expect(res.status).toBe(400);
  });

  test('returns array of league data', async () => {
    const res = await request(app)
      .post('/api/leagues/bulk')
      .send({ leagues: [{ leagueId: 1, teamId: 1, year: 2024 }, { leagueId: 2, teamId: 2, year: 2024 }] });
    expect(res.status).toBe(200);
    expect(res.body.leagues).toHaveLength(2);
    expect(res.body.leagues[0].leagueName).toBe('Bulk League');
  });

  test('handles partial failures gracefully', async () => {
    axios.get
      .mockResolvedValueOnce({ data: mockESPNResponse, status: 200, headers: { 'content-type': 'application/json' } })
      .mockRejectedValueOnce(new Error('Failed'));
    const res = await request(app)
      .post('/api/leagues/bulk')
      .send({ leagues: [{ leagueId: 1, teamId: 1, year: 2024 }, { leagueId: 2, teamId: 2, year: 2024 }] });
    expect(res.status).toBe(200);
    expect(res.body.leagues[0].leagueName).toBe('Bulk League');
    expect(res.body.leagues[1].error).toBeTruthy();
  });
});

// ── sanitizeCookieValue ──────────────────────────────────────────────────────

describe('sanitizeCookieValue', () => {
  test('trims whitespace', () => {
    expect(sanitizeCookieValue('  abc123  ')).toBe('abc123');
  });

  test('strips surrounding quotes', () => {
    expect(sanitizeCookieValue('"abc123"')).toBe('abc123');
    expect(sanitizeCookieValue("'abc123'")).toBe('abc123');
  });

  test('returns empty string for falsy values', () => {
    expect(sanitizeCookieValue('')).toBe('');
    expect(sanitizeCookieValue(null)).toBe('');
    expect(sanitizeCookieValue(undefined)).toBe('');
  });

  test('handles value with internal whitespace', () => {
    expect(sanitizeCookieValue('  abc def  ')).toBe('abc def');
  });
});

// ── sanitizeSWID ─────────────────────────────────────────────────────────────

describe('sanitizeSWID', () => {
  test('preserves correctly formatted SWID', () => {
    expect(sanitizeSWID('{ABCD-1234}')).toBe('{ABCD-1234}');
  });

  test('adds missing curly braces', () => {
    expect(sanitizeSWID('ABCD-1234')).toBe('{ABCD-1234}');
    expect(sanitizeSWID('{ABCD-1234')).toBe('{ABCD-1234}');
    expect(sanitizeSWID('ABCD-1234}')).toBe('{ABCD-1234}');
  });

  test('trims whitespace and adds braces', () => {
    expect(sanitizeSWID('  ABCD-1234  ')).toBe('{ABCD-1234}');
    expect(sanitizeSWID('  {ABCD-1234}  ')).toBe('{ABCD-1234}');
  });

  test('strips surrounding quotes', () => {
    expect(sanitizeSWID('"{ABCD-1234}"')).toBe('{ABCD-1234}');
  });

  test('returns empty string for falsy values', () => {
    expect(sanitizeSWID('')).toBe('');
    expect(sanitizeSWID(null)).toBe('');
    expect(sanitizeSWID(undefined)).toBe('');
  });
});
