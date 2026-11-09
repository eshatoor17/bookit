const express = require('express');
const { z } = require('zod');
const pool = require('./db');
const { requireLogin } = require('./auth-middleware');

const router = express.Router();

const idSchema = z.coerce.number().int().positive();

const bookingSchema = z.object({
  resource_id: z.number().int().positive(),
  start_time: z.string().datetime(), // ISO UTC, e.g. 2026-11-10T09:00:00Z
  end_time: z.string().datetime(),
});

// Create a booking
router.post('/', requireLogin, async (req, res) => {
  const parsed = bookingSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Please choose a resource and valid start and end times.' });
  }
  const { resource_id, start_time, end_time } = parsed.data;
  const start = new Date(start_time);
  const end = new Date(end_time);

  if (end <= start) {
    return res.status(400).json({ error: 'End time must be after start time.' });
  }
  if (start <= new Date()) {
    return res.status(400).json({ error: 'You can only book future times.' });
  }

  try {
    const r = await pool.query(
      `SELECT max_booking_minutes,
              to_char(available_from, 'HH24:MI') AS available_from,
              to_char(available_to, 'HH24:MI') AS available_to
       FROM resources WHERE id = $1 AND is_active = true`,
      [resource_id]
    );
    const resource = r.rows[0];
    if (!resource) return res.status(404).json({ error: 'Resource not found.' });

    const minutes = (end - start) / 60000;
    if (minutes > resource.max_booking_minutes) {
      return res.status(400).json({ error: `Bookings for this resource can be at most ${resource.max_booking_minutes} minutes.` });
    }

    // Available hours are checked in UTC for now (see note below)
    const hhmm = (d) => d.toISOString().slice(11, 16);
    const sameDay = start.toISOString().slice(0, 10) === end.toISOString().slice(0, 10);
    if (!sameDay || hhmm(start) < resource.available_from || hhmm(end) > resource.available_to) {
      return res.status(400).json({ error: `This resource can only be booked between ${resource.available_from} and ${resource.available_to}.` });
    }

    // user_id comes from the session, never from the request body
    const result = await pool.query(
      `INSERT INTO bookings (resource_id, user_id, start_time, end_time)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [resource_id, req.session.user.id, start.toISOString(), end.toISOString()]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23P01') { // exclusion_violation: the overlap guard fired
      return res.status(409).json({ error: 'That time slot is already booked.' });
    }
    console.error(err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

// My bookings
router.get('/mine', requireLogin, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT b.id, b.resource_id, r.name AS resource_name, b.start_time, b.end_time, b.status
       FROM bookings b JOIN resources r ON r.id = b.resource_id
       WHERE b.user_id = $1 ORDER BY b.start_time DESC`,
      [req.session.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

// Cancel (own future booking, or any booking if admin)
router.delete('/:id', requireLogin, async (req, res) => {
  const id = idSchema.safeParse(req.params.id);
  if (!id.success) return res.status(400).json({ error: 'Invalid booking id.' });
  try {
    const found = await pool.query('SELECT user_id, start_time, status FROM bookings WHERE id = $1', [id.data]);
    const b = found.rows[0];
    const isAdmin = req.session.user.role === 'admin';

    // same 404 for "doesn't exist" and "not yours", so ids can't be probed
    if (!b || (b.user_id !== req.session.user.id && !isAdmin)) {
      return res.status(404).json({ error: 'Booking not found.' });
    }
    if (b.status === 'cancelled') {
      return res.status(400).json({ error: 'This booking is already cancelled.' });
    }
    if (!isAdmin && new Date(b.start_time) <= new Date()) {
      return res.status(400).json({ error: 'You can only cancel future bookings.' });
    }
    await pool.query("UPDATE bookings SET status = 'cancelled' WHERE id = $1", [id.data]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

module.exports = router;