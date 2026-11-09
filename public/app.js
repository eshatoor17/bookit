'use strict';
const $ = (id) => document.getElementById(id);

// Builds DOM nodes with textContent only (never innerHTML), so user text can't inject scripts.
const h = (t, a = {}, ...k) => {
  const e = document.createElement(t);
  for (const [n, v] of Object.entries(a)) {
    if (n === 'class') e.className = v;
    else if (n.startsWith('on')) e.addEventListener(n.slice(2), v);
    else if (v != null && v !== false) e.setAttribute(n, v);
  }
  e.append(...k.flat(9).filter((x) => x != null && x !== false));
  return e;
};

// Every request goes through the existing server routes; the cookie carries the session.
async function api(p, m = 'GET', b) {
  const r = await fetch('/api' + p, {
    method: m, credentials: 'same-origin',
    headers: b ? { 'Content-Type': 'application/json' } : {},
    body: b ? JSON.stringify(b) : undefined,
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || 'Something went wrong. Please try again.');
  return d;
}

let user, resources = [], mine = [], sel = null, slot = null, tab = 'up', mode = 'login';
const iso = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
let dateVal = iso(1);
const tm = (d) => new Date(d).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const dt = (d) => new Date(d).toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });
const kind = (b) => (b.status === 'cancelled' ? 'can' : new Date(b.start_time) > new Date() ? 'up' : 'past');
const LBL = { up: 'Upcoming', past: 'Past', can: 'Cancelled' };
const badge = (k) => h('span', { class: 'badge b-' + k }, LBL[k]);
const openNow = (r) => { const n = new Date().toISOString().slice(11, 16); return n >= r.available_from && n < r.available_to; };
const empty = (t) => h('div', { class: 'empty' }, t);
const head = (t, s) => h('div', { class: 'head' }, h('h1', { class: 'serif' }, t), s && h('p', { class: 'sub' }, s));
const stat = (n, l) => h('div', { class: 'stat' }, h('div', { class: 'num serif' }, String(n)), h('div', { class: 'sub' }, l));
function toast(m, k = 'ok') {
  const t = h('div', { class: 'toast ' + k }, m);
  $('toasts').append(t);
  setTimeout(() => t.remove(), 3500);
}

const ICONS = {
  print: '<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9zM4 7.5l8 4.5 8-4.5M12 12v9"/>',
  vr: '<path d="M3 8h18v8a2 2 0 0 1-2 2h-3l-2-3h-4l-2 3H5a2 2 0 0 1-2-2z"/>',
  room: '<path d="M5 21V4h10v17M15 9h4v12M3 21h18M12 12v1"/>',
  box: '<rect x="4" y="4" width="16" height="16" rx="3"/>',
};

function ico(r) {
  const n = r.name.toLowerCase();
  const p = n.includes('print') ? ICONS.print :
    /vr|headset/.test(n) ? ICONS.vr :
    /room|meeting/.test(n) ? ICONS.room : ICONS.box;

  const s = h('span', { class: 'ico' });
  s.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">' + p + '</svg>';
  return s;
}

/* ---------- AUTH ---------- */

$('toggleAuth').onclick = () => {
  mode = mode === 'login' ? 'signup' : 'login';
  const l = mode === 'login';

  $('authTitle').textContent = l ? 'Welcome back' : 'Create your account';
  $('authBtn').textContent = l ? 'Log in' : 'Sign up';
  $('toggleAuth').textContent = l
    ? 'New here? Create an account'
    : 'Have an account? Log in';

  $('nameWrap').classList.toggle('hidden', l);
  $('authMsg').textContent = '';
};

$('eye').onclick = () => {
  const p = $('password');
  const s = p.type === 'password';
  p.type = s ? 'text' : 'password';
  $('eye').textContent = s ? 'Hide' : 'Show';
};

$('password').addEventListener('keydown', (e) =>
  e.key === 'Enter' && $('authBtn').click()
);

$('authBtn').onclick = async () => {
  try {
    const b = {
      email: $('email').value,
      password: $('password').value
    };

    if (mode === 'signup') b.name = $('name').value;

    const u = await api('/auth/' + mode, 'POST', b);
    $('password').value = '';
    start(u);

  } catch (e) {
    $('authMsg').textContent = e.message;
  }
};

$('logout').onclick = async () => {
  await api('/auth/logout', 'POST').catch(() => {});
  location.reload();
};

/* ---------- APP SHELL ---------- */

const loadResources = async () => {
  resources = await api('/resources');
};

const loadMine = async () => {
  mine = await api('/bookings/mine');
};

async function start(u) {
  user = u;

  $('authView').classList.add('hidden');
  $('shell').classList.remove('hidden');

  $('meName').textContent = u.name;
  $('meRole').textContent = u.role;

  const V = [
    ['dashboard', 'Home'],
    ['resources', 'Resources'],
    ['book', 'Book'],
    ['bookings', 'My bookings']
  ];

  if (u.role === 'admin') {
    V.push(['allbookings', 'Overview'], ['admin', 'Manage']);
  }

  $('nav').replaceChildren(
    ...V.map(([k, l]) =>
      h('button', {
        'data-v': k,
        onclick: () => go(k)
      }, l)
    )
  );

  try {
    await Promise.all([loadResources(), loadMine()]);
  } catch (e) {
    toast(e.message, 'err');
  }

  go('dashboard');
}

function go(v, id) {
  if (id) sel = id;

  document.querySelectorAll('#nav button').forEach((b) =>
    b.classList.toggle('on', b.dataset.v === v)
  );

  document.querySelectorAll('.view').forEach((x) =>
    x.classList.toggle('hidden', x.id !== 'v-' + v)
  );

  ({
    dashboard: rDash,
    resources: rRes,
    book: rBook,
    bookings: rMine,
    admin: rAdmin,
    allbookings: rAll
  })[v]();

  scrollTo(0, 0);
}

/* ---------- DASHBOARD ---------- */

const bRow = (b) => h('div', { class: 'item' },
  h('div', {},
    h('strong', {}, b.resource_name),
    h('small', {}, dt(b.start_time) + ', ' +
      tm(b.start_time) + ' to ' + tm(b.end_time))
  ),
  badge(kind(b))
);

function rDash() {
  const up = mine
    .filter((b) => kind(b) === 'up')
    .sort((a, b) => new Date(a.start_time) - new Date(b.start_time));

  const hr = new Date().getHours();
  const g = hr < 12 ? 'GOOD MORNING' :
    hr < 18 ? 'GOOD AFTERNOON' : 'GOOD EVENING';

  const next = up[0];

  $('v-dashboard').replaceChildren(

    h('section', { class: 'welcome-hero' },

      h('div', { class: 'hero-copy' },

        h('span', { class: 'eyebrow' },
          'BOOKIT / YOUR LAB, YOUR TIME'
        ),

        h('h1', {},
          g + ', ' + user.name.split(' ')[0] + '.'
        ),

        h('p', {},
          'Your next great idea starts with the right equipment. Find it, book it, get building.'
        ),

        h('div', { class: 'hero-actions' },

          h('button', {
            class: 'btn pri',
            onclick: () => go('book')
          }, 'BOOK EQUIPMENT ↗'),

          h('button', {
            class: 'btn ghost',
            onclick: () => go('resources')
          }, 'EXPLORE THE LAB')
        )
      ),

      h('div', { class: 'hero-orbit', 'aria-hidden': 'true' },

        h('div', { class: 'orbit orbit-one' }),
        h('div', { class: 'orbit orbit-two' }),

        h('div', { class: 'orbit-core' },
          h('span', {}, 'B'),
          h('small', {}, 'LAB / 01')
        ),

        h('span', { class: 'orbit-tag' }, 'MAKE IT HAPPEN')
      )
    ),

    h('div', { class: 'section-kicker' },
      h('span', {}, 'THE LAB AT A GLANCE'),
      h('span', {},
        new Date().toLocaleDateString([], {
          weekday: 'long',
          day: 'numeric',
          month: 'long'
        })
      )
    ),

    h('div', { class: 'stats' },
      stat(up.length, 'Upcoming bookings'),
      stat(resources.length, 'Lab resources'),
      stat(resources.filter(openNow).length, 'Available right now')
    ),

    h('div', { class: 'two' },

      h('section', { class: 'panel' },

        h('div', { class: 'row' },

          h('h2', {}, 'YOUR NEXT SESSIONS'),

          h('button', {
            class: 'btn pri sm',
            onclick: () => go('book')
          }, '＋ QUICK BOOK')
        ),

        next
          ? bRow(next)
          : empty('No sessions booked. Your next project is waiting.')
      ),

      h('section', { class: 'panel' },

        h('div', { class: 'row' },
          h('h2', {}, 'RECENT ACTIVITY'),
          h('span', { class: 'live-dot' }, 'LIVE')
        ),

        mine.length
          ? mine.slice(0, 4).map(bRow)
          : empty('Your bookings will show up here.')
      )
    )
  );
}

/* ---------- RESOURCES ---------- */

const rCard = (r, i = 0) => h('article', {
  class: 'card resource-card',
  style: '--card-index:' + i
},

  h('div', { class: 'resource-art' },

    h('span', { class: 'resource-number' }, '0' + (i + 1)),

    ico(r),

    h('span', {
      class: 'badge ' + (openNow(r) ? 'b-up' : '')
    }, openNow(r) ? '● AVAILABLE' : '○ CLOSED')
  ),

  h('small', { class: 'cat' }, r.category),

  h('h3', {}, r.name),

  h('p', { class: 'sub' },
    r.description || 'No description yet.'
  ),

  h('div', { class: 'resource-meta' },

    h('span', {},
      '↗ UP TO ' + r.max_booking_minutes + ' MIN'
    ),

    h('span', {},
      r.available_from + '–' + r.available_to + ' UTC'
    )
  ),

  h('button', {
    class: 'btn pri',
    onclick: () => go('book', r.id)
  }, 'BOOK THIS RESOURCE ↗')
);

function rRes() {
  const v = $('v-resources');

  const cats = [
    'All',
    ...new Set(resources.map(r => r.category).filter(Boolean))
  ];

  let active = 'All';
  let query = '';

  const list = h('div', {
    class: 'grid',
    id: 'resourceGrid'
  });

  const count = h('span', {
    class: 'result-count'
  });

  const drawResources = () => {

    const filtered = resources.filter(r =>
      (active === 'All' || r.category === active) &&
      (r.name + ' ' + r.category + ' ' + (r.description || ''))
        .toLowerCase()
        .includes(query.toLowerCase())
    );

    list.replaceChildren(
      ...filtered.map((r, i) => rCard(r, i))
    );

    count.textContent =
      filtered.length + ' RESOURCE' +
      (filtered.length === 1 ? '' : 'S');

    if (!filtered.length) {
      list.replaceChildren(
        empty('No matching equipment. Try another search or category.')
      );
    }
  };

  const search = h('input', {
    class: 'resource-search',
    type: 'search',
    placeholder: 'Search equipment, rooms, categories…',
    'aria-label': 'Search resources',

    oninput: e => {
      query = e.target.value;
      drawResources();
    }
  });

  const filters = h('div', {
    class: 'tabs resource-filters'
  },

    cats.map(c => h('button', {
      class: c === active ? 'on' : '',

      onclick: () => {
        active = c;

        [...filters.children].forEach(b =>
          b.classList.toggle('on', b.textContent === c)
        );

        drawResources();
      }
    }, c))
  );

  v.replaceChildren(
    head('THE EQUIPMENT',
      'Find the tools that turn your next idea into something real.'
    ),

    h('div', { class: 'resource-toolbar' },
      search,
      count
    ),

    filters,

    resources.length
      ? list
      : empty('No resources yet.')
  );

  drawResources();
}

/* ---------- BOOKING ---------- */

function rBook() {
  const v = $('v-book');

  if (!resources.length) {
    v.replaceChildren(
      head('Book equipment'),
      empty('No resources available yet.')
    );
    return;
  }

  const r = resources.find((x) => x.id === sel) || resources[0];

  sel = r.id;
  slot = null;

  const rs = h('select', {
    id: 'resource',

    onchange: (e) => {
      sel = +e.target.value;
      rBook();
    }
  },

    resources.map((x) =>
      h('option', { value: x.id }, x.name)
    )
  );

  rs.value = r.id;

  const ds = [];

  for (let m = 30; m <= r.max_booking_minutes; m += 30) {
    ds.push(m);
  }

  if (!ds.length) ds.push(r.max_booking_minutes);

  v.replaceChildren(

    head('Book ' + r.name, r.description),

    h('div', { class: 'two' },

      h('section', { class: 'panel' },

        h('label', {}, 'Resource'),
        rs,

        h('label', {}, 'Date'),

        h('input', {
          id: 'date',
          type: 'date',
          min: iso(0),
          value: dateVal,

          onchange: (e) => {
            dateVal = e.target.value;
            draw();
          }
        }),

        h('label', {}, 'Length'),

        h('select', {
          id: 'duration',
          onchange: draw
        },

          ds.map((m) =>
            h('option', { value: m }, m + ' minutes')
          )
        ),

        h('label', {}, 'Start times (your local time)'),

        h('div', {
          id: 'slots',
          class: 'slots'
        })
      ),

      h('section', { class: 'panel' },

        h('h2', {}, 'Summary'),

        h('div', { id: 'summary' }),

        h('button', {
          id: 'bookBtn',
          class: 'btn pri',
          disabled: true,
          onclick: book
        }, 'Confirm booking'),

        h('div', {
          id: 'bookMsg',
          class: 'msg err',
          role: 'alert'
        })
      )
    )
  );

  draw();
}

function draw() {
  const r = resources.find((x) => x.id === sel);
  const m = +$('duration').value;
  const box = $('slots');

  slot = null;
  box.replaceChildren();

  let n = 0;

  if (dateVal) {

    const close = new Date(
      dateVal + 'T' + r.available_to + ':00Z'
    );

    for (
      let s = new Date(dateVal + 'T' + r.available_from + ':00Z');
      +s + m * 6e4 <= +close;
      s = new Date(+s + 30 * 6e4)
    ) {

      if (s <= new Date()) continue;

      const st = s;
      n++;

      box.append(

        h('button', {
          class: 'slot',

          onclick: (e) => {
            slot = st;

            [...box.children].forEach((c) =>
              c.classList.toggle('on', c === e.currentTarget)
            );

            summ();
          }
        }, tm(st))
      );
    }
  }

  if (!n) {
    box.append(
      empty('No start times left on this day. Try another date or a shorter length.')
    );
  }

  summ();
}

function summ() {
  const r = resources.find((x) => x.id === sel);
  const m = +$('duration').value;

  $('bookBtn').disabled = !slot;
  $('bookMsg').textContent = '';

  if (!slot) {
    $('summary').textContent =
      'Choose a start time to see your booking summary.';
    return;
  }

  $('summary').replaceChildren(

    h('strong', {}, r.name),

    h('div', {}, dt(slot)),

    h('div', {},
      tm(slot) + ' to ' +
      tm(+slot + m * 6e4) +
      ' (' + m + ' minutes)'
    )
  );
}

async function book() {
  const m = +$('duration').value;

  try {

    await api('/bookings', 'POST', {
      resource_id: sel,
      start_time: slot.toISOString(),
      end_time: new Date(+slot + m * 6e4).toISOString()
    });

    await loadMine();

    toast('Booking confirmed.');
    go('bookings');

  } catch (e) {

    $('bookMsg').textContent = e.message;
    toast(e.message, 'err');
  }
}

/* ---------- MY BOOKINGS ---------- */

function rMine() {
  const T = [
    ['up', 'Upcoming'],
    ['past', 'Past'],
    ['can', 'Cancelled']
  ];

  const list = mine.filter((b) => kind(b) === tab);

  $('v-bookings').replaceChildren(

    head('My bookings'),

    h('div', { class: 'tabs' },

      T.map(([k, l]) =>
        h('button', {
          class: k === tab ? 'on' : '',

          onclick: () => {
            tab = k;
            rMine();
          }
        },

          l + ' (' +
          mine.filter((b) => kind(b) === k).length +
          ')'
        )
      )
    ),

    h('section', { class: 'panel' },

      list.length

        ? list.map((b) =>

          h('div', { class: 'item' },

            h('div', {},

              h('strong', {}, b.resource_name),

              h('small', {},
                dt(b.start_time) + ', ' +
                tm(b.start_time) + ' to ' +
                tm(b.end_time)
              )
            ),

            h('div', { class: 'row gap' },

              badge(kind(b)),

              kind(b) === 'up' && h('button', {
                class: 'btn sm dng',
                onclick: () => cancel(b.id)
              }, 'Cancel')
            )
          )
        )

        : empty('Nothing here yet.')
    )
  );
}

async function cancel(id) {
  if (!confirm('Cancel this booking?')) return;

  try {

    await api('/bookings/' + id, 'DELETE');

    await loadMine();

    toast('Booking cancelled.');
    rMine();

  } catch (e) {
    toast(e.message, 'err');
  }
}

/* ---------- ADMIN: RESOURCES ---------- */

function rAdmin() {
  $('v-admin').replaceChildren(

    head('Manage resources',
      'Add, edit or retire lab equipment.'
    ),

    h('div', {
      class: 'row',
      style: 'margin-bottom:14px'
    },

      h('span'),

      h('button', {
        class: 'btn pri',
        onclick: () => modal()
      }, 'Add resource')
    ),

    h('section', { class: 'panel scroll' },

      h('table', { class: 'tbl' },

        h('thead', {},

          h('tr', {},

            ['Name', 'Category', 'Max', 'Hours (UTC)', '']
              .map((t) => h('th', {}, t))
          )
        ),

        h('tbody', {},

          resources.map((r) =>

            h('tr', {},

              h('td', {}, r.name),
              h('td', {}, r.category),
              h('td', {}, r.max_booking_minutes + ' min'),

              h('td', {},
                r.available_from + ' to ' + r.available_to
              ),

              h('td', { class: 'act' },

                h('button', {
                  class: 'btn sm',
                  onclick: () => modal(r)
                }, 'Edit'),

                h('button', {
                  class: 'btn sm dng',
                  onclick: () => retire(r)
                }, 'Retire')
              )
            )
          )
        )
      )
    )
  );
}

const closeModal = () =>
  $('modal').classList.add('hidden');

$('modal').onclick = (e) => {
  if (e.target.id === 'modal') closeModal();
};

function modal(r) {

  const f = (id, l, v, t = 'text') => [

    h('label', { for: id }, l),

    h('input', {
      id,
      type: t,
      value: v ?? ''
    })
  ];

  $('modal').classList.remove('hidden');

  $('modal').replaceChildren(

    h('div', { class: 'box' },

      h('h2', { class: 'serif' },
        r ? 'Edit resource' : 'Add resource'
      ),

      f('rName', 'Name', r && r.name),

      f('rDesc', 'Description', r && r.description),

      f('rCat', 'Category', r && r.category),

      f('rMax', 'Max booking (minutes)',
        r ? r.max_booking_minutes : 120, 'number'
      ),

      f('rFrom', 'Opens (UTC)',
        r ? r.available_from : '09:00', 'time'
      ),

      f('rTo', 'Closes (UTC)',
        r ? r.available_to : '17:00', 'time'
      ),

      h('div', {
        id: 'mMsg',
        class: 'msg err'
      }),

      h('div', { class: 'row gap end' },

        h('button', {
          class: 'btn',
          onclick: closeModal
        }, 'Cancel'),

        h('button', {
          class: 'btn pri',
          onclick: () => save(r)
        }, 'Save')
      )
    )
  );
}

async function save(r) {

  const b = {
    name: $('rName').value,
    description: $('rDesc').value,
    category: $('rCat').value,
    max_booking_minutes: +$('rMax').value,
    available_from: $('rFrom').value,
    available_to: $('rTo').value
  };

  try {

    await (
      r
        ? api('/resources/' + r.id, 'PUT', b)
        : api('/resources', 'POST', b)
    );

    await loadResources();

    closeModal();
    toast('Resource saved.');
    rAdmin();

  } catch (e) {
    $('mMsg').textContent = e.message;
  }
}

async function retire(r) {

  if (!confirm('Retire ' + r.name + '? Booking history is kept.')) {
    return;
  }

  try {

    await api('/resources/' + r.id, 'DELETE');

    await loadResources();

    toast('Resource retired.');
    rAdmin();

  } catch (e) {
    toast(e.message, 'err');
  }
}

/* ---------- ADMIN: ALL BOOKINGS ---------- */

async function rAll() {

  const v = $('v-allbookings');

  try {

    const [s, rows] = await Promise.all([
      api('/admin/summary'),
      api('/admin/bookings')
    ]);

    const body = h('tbody');

    const fill = (f) => {

      const list = rows.filter((b) =>
        f === 'all' || kind(b) === f
      );

      body.replaceChildren(

        ...(list.length

          ? list.map((b) =>

            h('tr', {},

              h('td', {},
                b.user_name,
                h('small', {}, b.user_email)
              ),

              h('td', {}, b.resource_name),

              h('td', {},
                dt(b.start_time) + ', ' +
                tm(b.start_time) + ' to ' +
                tm(b.end_time)
              ),

              h('td', {}, badge(kind(b))),

              h('td', { class: 'act' },

                kind(b) === 'up' && h('button', {
                  class: 'btn sm dng',
                  onclick: () => adminCancel(b.id)
                }, 'Cancel')
              )
            )
          )

          : [
            h('tr', {},
              h('td', { colspan: 5 },
                empty('No bookings match this filter.')
              )
            )
          ]
        )
      );
    };

    const flt = h('select', {
      style: 'width:auto',
      onchange: (e) => fill(e.target.value)
    },

      [
        ['all', 'All bookings'],
        ['up', 'Upcoming'],
        ['past', 'Past'],
        ['can', 'Cancelled']
      ].map(([k, l]) =>
        h('option', { value: k }, l)
      )
    );

    v.replaceChildren(

      head('Overview',
        'Everything happening in the lab.'
      ),

      h('div', {
        class: 'stats',
        style: 'grid-template-columns:repeat(auto-fit,minmax(140px,1fr))'
      },

        stat(s.users, 'Users'),
        stat(s.resources, 'Resources'),
        stat(s.active, 'Active bookings'),
        stat(s.upcoming, 'Upcoming')
      ),

      h('div', {
        class: 'row',
        style: 'margin-bottom:14px'
      },

        h('h2', {}, 'All bookings'),
        flt
      ),

      h('section', { class: 'panel scroll' },

        h('table', { class: 'tbl' },

          h('thead', {},

            h('tr', {},

              ['Member', 'Resource', 'When', 'Status', '']
                .map((t) => h('th', {}, t))
            )
          ),

          body
        )
      )
    );

    fill('all');

  } catch (e) {

    v.replaceChildren(
      head('Overview'),
      empty(e.message)
    );
  }
}

async function adminCancel(id) {

  if (!confirm('Cancel this booking for the member?')) {
    return;
  }

  try {

    await api('/bookings/' + id, 'DELETE');

    toast('Booking cancelled.');
    rAll();

  } catch (e) {
    toast(e.message, 'err');
  }
}

// Already logged in? Skip the login screen.
api('/auth/me').then(start).catch(() => {});

/* ---------- INTERACTION POLISH ---------- */

// Close modal with Escape.
document.addEventListener('keydown', (e) => {

  if (
    e.key === 'Escape' &&
    !$('modal').classList.contains('hidden')
  ) {
    closeModal();
  }
});

// Navigation click interaction.
document.addEventListener('click', (e) => {

  const button = e.target.closest('#nav button');

  if (button) {
    button.classList.add('nav-tap');
  }
});

/* =====================================
   BOOKIT — INTERACTION ENGINE
===================================== */

// 1. Interactive 3D equipment cards
document.addEventListener('pointermove', (e) => {
  const card = e.target.closest('.resource-card');

  if (!card || e.pointerType === 'touch') return;

  const rect = card.getBoundingClientRect();

  const x = (e.clientX - rect.left) / rect.width;
  const y = (e.clientY - rect.top) / rect.height;

  const rotateY = (x - 0.5) * 9;
  const rotateX = (0.5 - y) * 9;

  card.style.setProperty('--rx', rotateX + 'deg');
  card.style.setProperty('--ry', rotateY + 'deg');

  card.style.setProperty('--mx', (x * 100) + '%');
  card.style.setProperty('--my', (y * 100) + '%');
});

document.addEventListener('pointerout', (e) => {
  const card = e.target.closest('.resource-card');

  if (!card || card.contains(e.relatedTarget)) return;

  card.style.setProperty('--rx', '0deg');
  card.style.setProperty('--ry', '0deg');
});

// 2. Booking celebration
function celebrateBooking() {
  const symbols = ['✦', '◆', '●', '✧'];

  for (let i = 0; i < 45; i++) {
    const piece = document.createElement('span');

    piece.className = 'confetti-piece';
    piece.textContent = symbols[i % symbols.length];

    piece.style.left = Math.random() * 100 + 'vw';
    piece.style.color = i % 2 ? '#c6ff00' : '#ff6b35';
    piece.style.animationDelay = Math.random() * .7 + 's';
    piece.style.setProperty(
      '--drift',
      (Math.random() - .5) * 220 + 'px'
    );

    document.body.appendChild(piece);

    setTimeout(() => piece.remove(), 3500);
  }
}

// 3. Keyboard shortcuts
document.addEventListener('keydown', (e) => {
  if (
    e.target.matches('input, select, textarea') ||
    e.ctrlKey || e.altKey || e.metaKey
  ) return;

  if (!$('shell').classList.contains('hidden')) {
    if (e.key === '1') go('dashboard');
    if (e.key === '2') go('resources');
    if (e.key === '3') go('book');
    if (e.key === '4') go('bookings');
  }
});

// 4. Interactive dashboard statistics
document.addEventListener('click', (e) => {
  const statCard = e.target.closest('.stat');

  if (!statCard) return;

  const label = statCard.textContent.toLowerCase();

  if (label.includes('upcoming bookings')) {
    go('bookings');
  } else if (label.includes('lab resources')) {
    go('resources');
  } else if (label.includes('available right now')) {
    go('resources');
  }
});
