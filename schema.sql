-- BookIt database schema (PostgreSQL)
-- Run this once in your database's SQL editor, then run: node seed.js

CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE users (
  id            SERIAL PRIMARY KEY,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'member'
                CHECK (role IN ('member', 'admin')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE resources (
  id                  SERIAL PRIMARY KEY,
  name                TEXT NOT NULL,
  description         TEXT,
  category            TEXT NOT NULL,
  max_booking_minutes INT NOT NULL CHECK (max_booking_minutes > 0),
  available_from      TIME NOT NULL DEFAULT '09:00',
  available_to        TIME NOT NULL DEFAULT '17:00',
  is_active           BOOLEAN NOT NULL DEFAULT true,
  CHECK (available_from < available_to)
);

CREATE TABLE bookings (
  id          SERIAL PRIMARY KEY,
  resource_id INT NOT NULL REFERENCES resources(id),
  user_id     INT NOT NULL REFERENCES users(id),
  start_time  TIMESTAMPTZ NOT NULL,
  end_time    TIMESTAMPTZ NOT NULL,
  status      TEXT NOT NULL DEFAULT 'active'
              CHECK (status IN ('active', 'cancelled')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (end_time > start_time),
  -- The anti-double-booking rule: no two active bookings for the same
  -- resource may have overlapping time ranges.
  EXCLUDE USING gist (
    resource_id WITH =,
    tstzrange(start_time, end_time) WITH &&
  ) WHERE (status = 'active')
);