const express = require('express');
const cors = require('cors');
const espnRoutes = require('./routes/espn');

const app = express();
const PORT = process.env.PORT || 3002;

app.use(cors({ origin: 'http://localhost:5174' }));
app.use(express.json());
app.use(espnRoutes);

if (require.main === module) {
  const server = app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`Port ${PORT} is already in use. Kill the existing process and retry.`);
      process.exit(1);
    } else {
      throw err;
    }
  });
}

module.exports = app;
