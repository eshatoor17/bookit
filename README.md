# BookIt

A secure booking platform for shared lab equipment. It replaces a WhatsApp group in a university robotics lab, where people double-booked the 3D printer, VR headsets and meeting room. Members book what they need, clashes are impossible, and the lab in-charge can see and manage everything.

**Live site:** https://bookit-orpin.vercel.app/

## Demo accounts (demo data only)

| Role   | Email                | Password         |
|--------|----------------------|------------------|
| Admin  | admin@bookit.demo    | AdminDemo123!    |
| Member | member@bookit.demo   | MemberDemo123!   |

These are demo accounts with no real data. You can also sign up as a new member.

> The database runs on a free tier and pauses when idle, so the first request after a quiet period can take a few seconds.

## What it does

- **Accounts:** sign up, log in, log out. Passwords are hashed with bcrypt. Sessions are stored in the database and sent as an `httpOnly` cookie.
- **Two roles:**
  - *Members* browse resources, book them, and cancel their own future bookings.
  - *Admins* add, edit and retire resources, see every booking, and cancel any booking.
- **Resources:** each has a name, description, category, maximum booking length and available hours.
- **Bookings:** the system rejects overlapping bookings for the same resource, enforces the resource's rules, and only allows future bookings.
- **Views:** resource list, booking page with time slots, My Bookings (upcoming, past, cancelled), and an admin overview with counts and a filterable table of all bookings.
- **Phone friendly:** the layout adapts to small screens.

## Tech stack

Node.js, Express, PostgreSQL (Neon), `pg`, `bcrypt`, `express-session` with `connect-pg-simple`, `zod` for validation, `helmet` for security headers. Plain HTML, CSS and JavaScript on the front end. Hosted on Vercel.

## Run it locally (about 10 minutes)

1. Clone the repo and install packages:
   ```
   git clone https://github.com/eshatoor17/bookit.git
   cd bookit
   npm install
   ```
2. Create a free Postgres database (for example at neon.tech) and run the schema from the section below in its SQL editor.
3. Create a `.env` file in the project root (see **Environment variables**).
4. Load the demo data:
   ```
   node seed.js
   ```
5. Start the server:
   ```
   npm run dev
   ```
   Open http://localhost:3000.

## Environment variables

Names only. Never commit real values. `.env` is listed in `.gitignore`.

| Name             | Purpose                                              |
|------------------|------------------------------------------------------|
| `DATABASE_URL`   | PostgreSQL connection string                         |
| `SESSION_SECRET` | Long random text used to sign session cookies        |
| `NODE_ENV`       | Set to `production` when deployed (enables secure cookies) |
| `PORT`           | Optional. Defaults to 3000 locally                   |

## Database schema

```
users                      resources                       bookings
-----                      ---------                       --------
id            PK           id                  PK          id           PK
name                       name                            resource_id  FK -> resources.id
email         UNIQUE       description                     user_id      FK -> users.id
password_hash              category                        start_time   timestamptz
role          member|admin max_booking_minutes  > 0        end_time     timestamptz
created_at                 available_from      time        status       active|cancelled
                           available_to        time        created_at
                           is_active
```

Key constraints on `bookings`:

- `CHECK (end_time > start_time)`
- `EXCLUDE USING gist (resource_id WITH =, tstzrange(start_time, end_time) WITH &&) WHERE (status = 'active')`

The `EXCLUDE` constraint makes the database itself refuse two overlapping active bookings for the same resource. Cancelled bookings stay in the table as history and do not block the slot. All times are stored in UTC (`timestamptz`) and shown in the user's local time.

The full `CREATE TABLE` statements are in the project setup notes and are applied before running `seed.js`. The `session` table is created automatically by `connect-pg-simple`.

## Design questions

**What stops two people booking the same slot at the same moment?**
The app never checks for a clash in JavaScript and then inserts, because two simultaneous requests could both pass that check. It simply tries the `INSERT`. The `EXCLUDE` constraint is enforced atomically by PostgreSQL, so exactly one request succeeds and the other fails with error `23P01`, which the API turns into a friendly "That time slot is already booked." (HTTP 409). Back-to-back bookings are allowed because time ranges are half-open.

**What can a logged-in member do by editing a URL or request body?**
Nothing useful. The booking's `user_id` always comes from the server-side session, never from the request. Cancelling checks that the booking belongs to the current user (or that the user is an admin). A member trying someone else's booking id gets the same "not found" answer as for an id that doesn't exist, so ids can't be probed. A member cannot set their own role: signup always creates a `member`. Every admin route checks the role on the server.

**What do we store, and what would hurt if the database leaked?**
We store names, emails, bcrypt password hashes, resources and booking records. Passwords are never stored in plain text, so a leak would expose emails and booking history but not usable passwords. Secrets live in environment variables, not in the code or the repository.

## Security notes

- Input is validated on the server with `zod`, not only in the browser.
- All SQL uses parameterised queries.
- Authorization is checked on every protected route (`requireLogin`, `requireAdmin`).
- Login returns the same message for an unknown email and a wrong password.
- The session id is regenerated on login.
- The front end writes user-supplied text with `textContent`, never `innerHTML`.
- Error responses are friendly and never include stack traces.
- Security headers come from `helmet`.

## Tests

The automated tests call the real API over HTTP. Start the server first, then in a second terminal:

```
node --test test/bookit.test.js
```

They cover:

1. Overlapping booking is rejected
2. Back-to-back booking is accepted
3. Booking longer than the resource maximum is rejected
4. Booking outside available hours is rejected
5. A member cannot use admin routes
6. A logged-out visitor is rejected
7. A member cannot cancel another member's booking
8. Two simultaneous requests for the same slot: exactly one wins

The tests create temporary users and cancel their own bookings afterwards. Running `node seed.js` removes any leftover test users. To test another deployment, set `BASE_URL` (for example `BASE_URL=https://bookit-orpin.vercel.app`), but note that this writes test data to that deployment's database.

## Project structure

```
server.js            app setup, sessions, route mounting
db.js                PostgreSQL connection pool
middleware.js        requireLogin and requireAdmin
routes-auth.js       signup, login, logout, current user
routes-resources.js  list, add, edit, retire resources
routes-bookings.js   create, list own, cancel bookings
routes-admin.js      admin summary and all bookings
seed.js              loads demo users and resources
test/                automated tests
public/              front end (index.html, app.js)
```

## Known limitations

- A resource's available hours are checked in UTC on the server.
- Booking slots do not yet show which times are already taken. A clash is caught when you confirm.
- Optional stretch ideas not built: email reminders, recurring bookings, waitlists, usage statistics.