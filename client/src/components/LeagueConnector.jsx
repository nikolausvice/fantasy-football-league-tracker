import React, { useState } from 'react';

export default function LeagueConnector({ onAdd, existingIds = [], errorIds = [] }) {
  const [form, setForm] = useState({
    leagueId: '',
    teamId: '',
    espnS2: '',
    swid: '',
    year: 2024,
  });
  const [showPrivate, setShowPrivate] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    const leagueId = parseInt(form.leagueId, 10);
    const teamId = parseInt(form.teamId, 10);

    if (!leagueId || !teamId) {
      setError('League ID and Team ID are required.');
      return;
    }
    if (existingIds.includes(leagueId) && !errorIds.includes(leagueId)) {
      setError('This league is already connected.');
      return;
    }

    setLoading(true);
    try {
      await onAdd({ leagueId, teamId, year: parseInt(form.year, 10), espnS2: form.espnS2, swid: form.swid });
      setForm({ leagueId: '', teamId: '', espnS2: '', swid: '', year: 2024 });
      setShowPrivate(false);
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Failed to connect league.');
    } finally {
      setLoading(false);
    }
  };

  const inputCls = 'w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500 transition';

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
      <h2 className="text-lg font-semibold text-white mb-4">Connect ESPN League</h2>

      {error && (
        <div className="mb-4 bg-red-900/40 border border-red-700 rounded-lg px-4 py-2 text-red-300 text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs text-gray-400 mb-1">League ID *</label>
            <input
              type="number"
              name="leagueId"
              value={form.leagueId}
              onChange={handleChange}
              placeholder="e.g. 1234567"
              className={inputCls}
              required
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Your Team ID *</label>
            <input
              type="number"
              name="teamId"
              value={form.teamId}
              onChange={handleChange}
              placeholder="e.g. 1"
              className={inputCls}
              required
              min="1"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Season Year</label>
            <input
              type="number"
              name="year"
              value={form.year}
              onChange={handleChange}
              className={inputCls}
              min="2018"
              max="2030"
            />
          </div>
        </div>

        <div>
          <button
            type="button"
            onClick={() => setShowPrivate((v) => !v)}
            className="text-xs text-blue-400 hover:text-blue-300 transition"
          >
            {showPrivate ? '▼ Hide' : '▶ Show'} private league cookies (optional)
          </button>
        </div>

        {showPrivate && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 bg-gray-800/50 rounded-lg">
            <div>
              <label className="block text-xs text-gray-400 mb-1">ESPN S2 Cookie</label>
              <input
                type="text"
                name="espnS2"
                value={form.espnS2}
                onChange={handleChange}
                placeholder="espn_s2 value"
                className={inputCls}
              />
            </div>
            <div>
              <label className="block text-xs text-gray-400 mb-1">SWID Cookie</label>
              <input
                type="text"
                name="swid"
                value={form.swid}
                onChange={handleChange}
                placeholder="{XXXXXXXX-...}"
                className={inputCls}
              />
            </div>
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full sm:w-auto px-6 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded-lg text-sm font-medium transition"
        >
          {loading ? 'Connecting…' : '+ Add League'}
        </button>
      </form>
    </div>
  );
}
