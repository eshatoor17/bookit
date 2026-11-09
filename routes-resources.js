const express = require('express');
const { z } = require('zod');
const pool = require('./db');
const { requireLogin, requireAdmin } = require('./auth-middleware');

const router = express.Router();

const timeRe = /^([01]\d|2[0-3]):[0-5]\d$/;

const resourceSchema = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(500).optional().default(''),
  category: z.string().trim().min(1).max(50),
  max_booking_minutes: z.number().int().min(15).max(1440),
  available_from: z.string().regex(timeRe),
  available_to: z.string().regex(timeRe),
}).refine((r) => r.available_from < r.available_to, {
  message: 'Opening time must be before closing time.',
});

const idSchema = z.coerce.number().int().positive();

// List active resources (any logged-in user)
router.get('/', requireLogin, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, name, description, category, max_booking_minutes,
              to_char(available_from, 'HH24:MI') AS available_from,
              to_char(available_to, 'HH24:MI') AS available_to
       FROM resources WHERE is_active = true ORDER BY name`
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

// Add (admin only)
router.post('/', requireAdmin, async (req, res) => {
  const parsed = resourceSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Please check the resource details.' });
  }
  const r = parsed.data;
  try {
    const result = await pool.query(
      `INSERT INTO resources (name, description, category, max_booking_minutes, available_from, available_to)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [r.name, r.description, r.category, r.max_booking_minutes, r.available_from, r.available_to]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

// Edit (admin only)
router.put('/:id', requireAdmin, async (req, res) => {
  const id = idSchema.safeParse(req.params.id);
  const parsed = resourceSchema.safeParse(req.body);
  if (!id.success || !parsed.success) {
    return res.status(400).json({ error: 'Please check the resource details.' });
  }
  const r = parsed.data;
  try {
    const result = await pool.query(
      `UPDATE resources
       SET name=$1, description=$2, category=$3, max_booking_minutes=$4,
           available_from=$5, available_to=$6
       WHERE id=$7 RETURNING *`,
      [r.name, r.description, r.category, r.max_booking_minutes, r.available_from, r.available_to, id.data]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Resource not found.' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

// Retire (admin only). We hide it instead of deleting, so booking history stays intact.
router.delete('/:id', requireAdmin, async (req, res) => {
  const id = idSchema.safeParse(req.params.id);
  if (!id.success) return res.status(400).json({ error: 'Invalid resource id.' });
  try {
    const result = await pool.query(
      'UPDATE resources SET is_active = false WHERE id = $1 RETURNING id',
      [id.data]
    );
    if (!result.rows[0]) return res.status(404).json({ error: 'Resource not found.' });
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

module.exports = router;