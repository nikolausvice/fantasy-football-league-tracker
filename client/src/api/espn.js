import axios from 'axios';

export async function fetchLeague(config) {
  const response = await axios.post('/api/league', config);
  return response.data;
}

export async function fetchLeagues(leagues) {
  const response = await axios.post('/api/leagues/bulk', { leagues });
  return response.data;
}
