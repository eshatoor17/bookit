const path = require('path');
require('dotenv').config();
const express = require('express');
const helmet = require('helmet');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const pool = require('./db');

const app = express();

app.use(helmet());
app.use(express.json());
app.use(express.static('public'));

app.get('/', (req, res) => {
  res.redirect('/index.html');
});

// App runs behind the host's HTTPS proxy
app.set('trust proxy', true);

app.use(
  session({
    store: new pgSession({ pool, createTableIfMissing: true }),
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: false, // host terminates HTTPS at its proxy; see README note
      maxAge: 1000 * 60 * 60 * 8, // 8 hours
    },
  })
);

app.get('/api/health', (req, res) => res.json({ ok: true }));
app.use('/api/auth', require('./routes-auth'));
app.use('/api/resources', require('./routes-resources'));
app.use('/api/bookings', require('./routes-bookings'));
app.use('/api/admin', require('./routes-admin'));

// Last-resort error handler: log details on the server, never leak them to users
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Something went wrong. Please try again.' });
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`BookIt running on http://localhost:${port}`));