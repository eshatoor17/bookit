const express = require('express');
const bcrypt = require('bcrypt');
const { z } = require('zod');
const pool = require('./db');
const { requireLogin } = require('./auth-middleware');

const router = express.Router();

const signupSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().toLowerCase().email().max(200),
  password: z.string().min(8).max(100),
});

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1).max(100),
});

router.post('/signup', async (req, res) => {
  const parsed = signupSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Please enter a name, a valid email, and a password of at least 8 characters.' });
  }
  const { name, email, password } = parsed.data;
  try {
    const hash = await bcrypt.hash(password, 10);
    // role is NOT taken from the request: everyone who signs up is a member
    const result = await pool.query(
      `INSERT INTO users (name, email, password_hash, role)
       VALUES ($1, $2, $3, 'member')
       RETURNING id, name, email, role`,
      [name, email, hash]
    );
    req.session.user = result.rows[0];
    res.status(201).json(result.rows[0]);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'That email is already registered.' });
    }
    console.error(err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

router.post('/login', async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Please enter your email and password.' });
  }
  const { email, password } = parsed.data;
  try {
    const result = await pool.query(
      'SELECT id, name, email, role, password_hash FROM users WHERE email = $1',
      [email]
    );
    const user = result.rows[0];
    const ok = user && (await bcrypt.compare(password, user.password_hash));
    if (!ok) {
      // same message for "no such email" and "wrong password"
      return res.status(401).json({ error: 'Incorrect email or password.' });
    }
      req.session.regenerate((err) => {
      if (err) {
        console.error(err);
        return res.status(500).json({ error: 'Something went wrong. Please try again.' });
      }
      req.session.user = { id: user.id, name: user.name, email: user.email, role: user.role };
      res.json(req.session.user);
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('connect.sid');
    res.json({ ok: true });
  });
});

router.get('/me', requireLogin, (req, res) => {
  res.json(req.session.user);
});

module.exports = router;