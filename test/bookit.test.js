// BookIt automated tests. Run with the server already running:  node --test
// They call the real API over HTTP, exactly like the browser does.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

const BASE = process.env.BASE_URL || 'http://localhost:3000';

// Small helper: send a request, keep the session cookie, return status + JSON.
async function call(path, { method = 'GET', body, cookie } = {}) {
  const res = await fetch(BASE + '/api' + path, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const set = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
  const data = await res.json().catch(() => ({}));
  return { status: res.status, data, cookie: set.length ? set.map((c) => c.split(';')[0]).join('; ') : cookie };
}

// A free day well in the future, different for every test so they never collide.
const rand = Math.floor(Math.random() * 300);
const day = (n) => new Date(Date.now() + (30 + rand + n) * 864e5).toISOString().slice(0, 10);
const slot = (d, from, to) => ({ start_time: `${d}T${from}:00Z`, end_time: `${d}T${to}:00Z` });

let admin, memberA, memberB, printer;
const created = []; // booking ids we make, cleaned up at the end

async function signup(name) {
  const email = `test-${name}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@bookit.test`;
  const r = await call('/auth/signup', { method: 'POST', body: { name, email, password: 'TestPass123!' } });
  assert.equal(r.status, 201);
  return r.cookie;
}
async function book(cookie, resource_id, times) {
  const r = await call('/bookings', { method: 'POST', cookie, body: { resource_id, ...times } });
  if (r.status === 201) created.push(r.data.id);
  return r;
}

before(async () => {
  const a = await call('/auth/login', { method: 'POST', body: { email: 'admin@bookit.demo', password: 'AdminDemo123!' } });
  assert.equal(a.status, 200, 'demo admin must exist (run node seed.js)');
  admin = a.cookie;
  memberA = await signup('A');
  memberB = await signup('B');
  const list = await call('/resources', { cookie: memberA });
  printer = list.data.find((r) => r.name === '3D Printer');
  assert.ok(printer, 'seed data must include the 3D Printer');
});

after(async () => {
  for (const id of created) await call('/bookings/' + id, { method: 'DELETE', cookie: admin });
});

test('overlapping booking is rejected (409)', async () => {
  const d = day(1);
  assert.equal((await book(memberA, printer.id, slot(d, '09:00', '11:00'))).status, 201);
  const clash = await book(memberB, printer.id, slot(d, '10:00', '12:00'));
  assert.equal(clash.status, 409);
});

test('back-to-back booking is accepted', async () => {
  const d = day(2);
  assert.equal((await book(memberA, printer.id, slot(d, '09:00', '11:00'))).status, 201);
  assert.equal((await book(memberA, printer.id, slot(d, '11:00', '12:00'))).status, 201);
});

test('booking longer than the resource maximum is rejected (400)', async () => {
  const r = await book(memberA, printer.id, slot(day(3), '09:00', '14:00')); // 5h > 240 min
  assert.equal(r.status, 400);
});

test('booking outside available hours is rejected (400)', async () => {
  const r = await book(memberA, printer.id, slot(day(4), '05:00', '06:00'));
  assert.equal(r.status, 400);
});

test('member cannot use admin routes (403)', async () => {
  assert.equal((await call('/admin/bookings', { cookie: memberA })).status, 403);
  const add = await call('/resources', { method: 'POST', cookie: memberA, body: { name: 'X', category: 'X', max_booking_minutes: 60, available_from: '09:00', available_to: '17:00' } });
  assert.equal(add.status, 403);
});

test('logged-out visitor is rejected (401)', async () => {
  assert.equal((await call('/bookings/mine')).status, 401);
});

test("member cannot cancel another member's booking", async () => {
  const b = await book(memberA, printer.id, slot(day(5), '09:00', '10:00'));
  assert.equal(b.status, 201);
  const attempt = await call('/bookings/' + b.data.id, { method: 'DELETE', cookie: memberB });
  assert.equal(attempt.status, 404); // same answer as "doesn't exist", so ids can't be probed
  const mine = await call('/bookings/mine', { cookie: memberA });
  assert.equal(mine.data.find((x) => x.id === b.data.id).status, 'active'); // still booked
  assert.equal((await call('/bookings/' + b.data.id, { method: 'DELETE', cookie: memberA })).status, 200); // owner can
});

test('two simultaneous requests for the same slot: exactly one wins', async () => {
  const times = slot(day(6), '13:00', '14:00');
  const [r1, r2] = await Promise.all([book(memberA, printer.id, times), book(memberB, printer.id, times)]);
  assert.deepEqual([r1.status, r2.status].sort(), [201, 409]);
});