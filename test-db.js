const pool = require('./db');

pool.query('SELECT now()')
  .then((r) => {
    console.log('Connected! Server time:', r.rows[0].now);
    return pool.end();
  })
  .catch((err) => {
    console.error('Connection failed:', err.message);
    process.exit(1);
  });