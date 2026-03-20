import React, { useState, useEffect, useCallback } from 'react';
import LeagueConnector from './components/LeagueConnector.jsx';
import LeagueList from './components/LeagueList.jsx';
import MatchupView from './components/MatchupView.jsx';
import CrossReference from './components/CrossReference.jsx';
import { fetchLeague, fetchLeagues } from './api/espn.js';

const STORAGE_KEY = 'fflt_league_configs';

export default function App() {
  const [leagues, setLeagues] = useState([]);
  const [leagueConfigs, setLeagueConfigs] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    } catch {
      return [];
    }
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const loadLeagues = useCallback(async (configs) => {
    if (configs.length === 0) { setLeagues([]); return; }
    setLoading(true);
    setError(null);
    try {
      if (configs.length === 1) {
        const data = await fetchLeague(configs[0]);
        setLeagues([data]);
      } else {
        const data = await fetchLeagues(configs);
        setLeagues(data.leagues || []);
      }
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Failed to load leagues');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadLeagues(leagueConfigs);
  }, []);

  const addLeague = useCallback(async (config) => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchLeague(config);
      const newConfigs = [...leagueConfigs, config];
      setLeagueConfigs(newConfigs);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newConfigs));
      setLeagues((prev) => [...prev, data]);
    } catch (err) {
      throw err;
    } finally {
      setLoading(false);
    }
  }, [leagueConfigs]);

  const removeLeague = useCallback((leagueId) => {
    const newConfigs = leagueConfigs.filter((c) => String(c.leagueId) !== String(leagueId));
    setLeagueConfigs(newConfigs);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newConfigs));
    setLeagues((prev) => prev.filter((l) => String(l.leagueId) !== String(leagueId)));
  }, [leagueConfigs]);

  const refreshLeagues = useCallback(() => {
    loadLeagues(leagueConfigs);
  }, [leagueConfigs, loadLeagues]);

  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      <header className="bg-gray-900 border-b border-gray-800 px-6 py-4 flex items-center gap-3">
        <span className="text-2xl">🏈</span>
        <div>
          <h1 className="text-xl font-bold text-white">Fantasy Football League Tracker</h1>
          <p className="text-xs text-gray-400">Track multiple ESPN leagues & cross-reference players</p>
        </div>
        {leagues.length > 0 && (
          <button
            onClick={refreshLeagues}
            disabled={loading}
            className="ml-auto px-3 py-1.5 text-sm bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg transition"
          >
            {loading ? 'Refreshing…' : '↻ Refresh'}
          </button>
        )}
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8 space-y-8">
        {error && (
          <div className="bg-red-900/40 border border-red-700 rounded-lg px-4 py-3 text-red-300 text-sm">
            {error}
          </div>
        )}

        <LeagueConnector onAdd={addLeague} existingIds={leagueConfigs.map((c) => c.leagueId)} />

        {leagues.length > 0 && (
          <>
            <LeagueList leagues={leagues} onRemove={removeLeague} onRefresh={refreshLeagues} loading={loading} />
            <MatchupView leagues={leagues} />
            <CrossReference leagues={leagues} />
          </>
        )}

        {!loading && leagues.length === 0 && leagueConfigs.length === 0 && (
          <div className="text-center py-20 text-gray-500">
            <div className="text-5xl mb-4">🏈</div>
            <p className="text-lg font-medium">No leagues connected yet</p>
            <p className="text-sm mt-1">Add your ESPN fantasy league above to get started.</p>
          </div>
        )}
      </main>
    </div>
  );
}
