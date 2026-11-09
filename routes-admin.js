const express = require('express');
const pool = require('./db');
const { requireAdmin } = require('./auth-middleware');

const router = express.Router();
router.use(requireAdmin); // every route in this file is admin-only

router.get('/summary', async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT
         (SELECT count(*) FROM users)::int AS users,
         (SELECT count(*) FROM resources WHERE is_active)::int AS resources,
         (SELECT count(*) FROM bookings WHERE status = 'active')::int AS active,
         (SELECT count(*) FROM bookings WHERE status = 'active' AND start_time > now())::int AS upcoming`
    );
    res.json(r.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

router.get('/bookings', async (req, res) => {
  try {
    const r = await pool.query(
      `SELECT b.id, b.start_time, b.end_time, b.status,
              r.name AS resource_name, u.name AS user_name, u.email AS user_email
       FROM bookings b
       JOIN resources r ON r.id = b.resource_id
       JOIN users u ON u.id = b.user_id
       ORDER BY b.start_time DESC
       LIMIT 200`
    );
    res.json(r.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

module.exports = router;
