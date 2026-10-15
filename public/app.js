// ==========================================================================
// HostelHub — Mobile-First Community Management Platform Client
// Clean Mobile App + Desktop Hybrid with SVG Icons & Adaptive Navigation
// ==========================================================================

const $ = s => document.querySelector(s);
const E = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let me = null, view = null;

async function api(p, m = 'GET', b) {
  const r = await fetch('/api/' + p, {
    method: m,
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'hostelhub' },
    body: b ? JSON.stringify(b) : undefined
  });
  const d = await r.json().catch(() => ({}));
  if (r.status === 401 && me) {
    me = null;
    loginPage('Your session ended. Please sign in again.');
    throw new Error('Signed out');
  }
  if (!r.ok) throw new Error(d.error || 'Something went wrong');
  return d;
}

const logout = async () => {
  try {
    await fetch('/api/logout', { method: 'POST', headers: { 'X-Requested-With': 'hostelhub' } });
  } catch {}
  location.reload();
};

// --- Navigation Destinations per Role (Preserving ALL Original Names & Buttons)
const NAV = {
  student: ['Home', 'Gate Pass', 'Complaints', 'Leave', 'Visitors', 'Alerts'],
  warden: ['Overview', 'Campus', 'Gate Passes', 'Complaints', 'Leave', 'Visitors', 'Rooms', 'People', 'Announce', 'Alerts'],
  admin: ['Overview', 'Campus', 'Gate Passes', 'Monitor', 'Complaints', 'Leave', 'Visitors', 'Rooms', 'People', 'Announce', 'Alerts'],
  maintenance: ['Tasks', 'Alerts'],
  security: ['Gate', 'Alerts']
};
Object.values(NAV).forEach(a => a.push('Account'));

// Primary mobile tabs per role
const PRIMARY_TABS = {
  student: ['Home', 'Gate Pass', 'Complaints', 'Leave'],
  warden: ['Overview', 'Campus', 'Gate Passes', 'Complaints'],
  admin: ['Overview', 'Campus', 'Gate Passes', 'Monitor'],
  maintenance: ['Tasks', 'Alerts', 'Account'],
  security: ['Gate', 'Alerts', 'Account']
};

// Navigation groups for desktop sidebar & mobile drawer
const NAV_GROUPS = [
  { title: 'Manage', items: ['Overview', 'Home', 'Campus', 'Monitor', 'Tasks'] },
  { title: 'Operations', items: ['Gate Pass', 'Gate Passes', 'Gate', 'Complaints', 'Leave', 'Visitors'] },
  { title: 'Publish & Setup', items: ['Announce', 'Rooms', 'People'] },
  { title: 'Account & System', items: ['Alerts', 'Account'] }
];

// --- 24px Inline SVG Icon Generator (2px rounded stroke)
function ic(name) {
  const p = {
    home: '<path d="M3 10.5L12 3l9 7.5v9.5a1.5 1.5 0 0 1-1.5 1.5h-5a1 1 0 0 1-1-1v-4.5h-5v4.5a1 1 0 0 1-1 1h-5A1.5 1.5 0 0 1 3 20z"/>',
    overview: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
    gatepass: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 8h10M7 12h7M7 16h4M16 14l2 2 3-3"/>',
    gate: '<path d="M3 21h18M5 21V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16M9 9h.01M9 13h.01M9 17h.01M15 9h.01M15 13h.01M15 17h.01"/>',
    campus: '<path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>',
    monitor: '<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4M7 10l3-3 3 4 4-5"/>',
    complaints: '<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5zM12 8v4M12 16h.01"/>',
    tasks: '<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>',
    leave: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01"/>',
    visitors: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
    rooms: '<path d="M3 21h18M4 21V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v17M14 21V9a1 1 0 0 1 1-1h5a1 1 0 0 1 1 1v12M8 12h.01M17 14h.01"/>',
    people: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
    announce: '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0M2 8C2 4.7 4.7 2 8 2M22 8c0-3.3-2.7-6-6-6"/>',
    alerts: '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0"/>',
    account: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
    more: '<circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/><circle cx="5" cy="12" r="1.5"/>',
    menu: '<line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/>',
    close: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    qr: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="3" height="3"/><rect x="18" y="18" width="3" height="3"/><path d="M7 7h.01M17 7h.01M7 17h.01"/>'
  };
  const key = name.toLowerCase().replace(/\s+/g, '');
  const svg = p[key] || p.overview;
  return `<svg viewBox="0 0 24 24" aria-hidden="true">${svg}</svg>`;
}

// User Initials
function initials(name) {
  return String(name || 'U').trim().split(/\s+/).slice(0, 2).map(n => n[0]?.toUpperCase() || '').join('') || 'U';
}

// Circular gradient logo mark with white glyph (DashboardKit style)
const logoMark = () => `<span class="logo-mark"><svg viewBox="0 0 24 24"><path d="M8 7v10M16 7v10M8 12h8"/></svg></span>`;

// Stat tile: icon circle + value + uppercase label (optional pastel tint: blue/teal/amber/rose/violet)
const statTile = (icon, value, label, tint = '') => `<div class="stat ${tint ? 'stat--' + tint : ''}">${icon ? `<div class="stat-ic">${ic(icon)}</div>` : ''}<div class="stat-info"><b>${value}</b><span class="stat-label">${label}</span></div></div>`;

// Section heading with a "See more" shortcut to the full view
const secHead = (title, view, extra = '') => `<div class="sec-head"><h3>${E(title)}</h3>${view ? `<button class="see-more" data-v="${view}">See more ›</button>` : ''}${extra}</div>`;

// Theme Button HTML
function themeBtnHtml() {
  const t = window.__hh_theme?.get() || 'system';
  const icon = t === 'light'
    ? '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg> Light'
    : t === 'dark'
    ? '<svg viewBox="0 0 24 24"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg> Dark'
    : '<svg viewBox="0 0 24 24"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg> System';
  return `<button class="theme-toggle" type="button" aria-label="Theme: ${t}. Click to cycle.">${icon}</button>`;
}

// Bind every theme button (drawer footer + sidebar footer + login) — a duplicate
// id made querySelector bind only the hidden drawer copy, leaving the visible
// sidebar button dead.
function bindThemeToggle() {
  document.querySelectorAll('.theme-toggle').forEach(b => {
    b.onclick = () => {
      window.__hh_theme?.cycle();
      document.querySelectorAll('.theme-toggle').forEach(nb => { nb.outerHTML = themeBtnHtml(); });
      bindThemeToggle();
    };
  });
}

// Login Screen
function loginPage(err = '') {
  $('#app').innerHTML = `<div class="login">
    <div class="row" style="justify-content:space-between;align-items:center;margin-bottom:8px">
      <div class="brand-title">${logoMark()}Hostel<span>Hub</span></div>
      ${themeBtnHtml()}
    </div>
    <p>One Platform. Every Hostel Operation.</p>
    <form id="lf">
      <label>Email<input name="email" type="email" required autocomplete="username"></label>
      <label>Password<input name="password" type="password" required autocomplete="current-password"></label>
      <div class="err">${E(err)}</div>
      <button class="btn">Sign in</button>
    </form>
    <h3>Demo accounts (password demo123)</h3>
    <div class="row">
      ${['student', 'warden', 'admin', 'security', 'maint'].map(r => `<button class="btn alt sm" data-e="${r}@hostelhub.test">${r}</button>`).join('')}
    </div>
  </div>`;
  bindThemeToggle();
  $('#lf').onsubmit = async e => {
    e.preventDefault();
    const f = new FormData(e.target);
    try {
      const r = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(Object.fromEntries(f))
      });
      const d = await r.json();
      if (!r.ok) throw Error(d.error);
      boot();
    } catch (x) {
      loginPage(x.message);
    }
  };
  document.querySelectorAll('[data-e]').forEach(b => b.onclick = () => {
    $('[name=email]').value = b.dataset.e;
    $('[name=password]').value = 'demo123';
  });
}

async function boot() {
  try {
    me = await api('me');
  } catch {
    if (!$('#lf')) loginPage();
    return;
  }
  view = NAV[me.role][0];
  shell();
}

// Drawer Open/Close Helper
function toggleDrawer(open) {
  const d = $('#drawer'), b = $('#drawerBackdrop');
  if (d && b) {
    const shouldOpen = open !== undefined ? open : !d.classList.contains('open');
    d.classList.toggle('open', shouldOpen);
    b.classList.toggle('open', shouldOpen);
  }
}

// App Shell
function shell() {
  const roleNav = NAV[me.role];
  const primeTabs = PRIMARY_TABS[me.role] || roleNav.slice(0, 4);

  // Grouped Navigation for Drawer and Sidebar
  const navBtn = n => `<button class="${n === view ? 'on' : ''}" data-v="${n}">${ic(n)} <span>${n}</span>${n === view ? '<span class="chev">›</span>' : ''}</button>`;
  const groupedDesktop = NAV_GROUPS.map(g => {
    const matched = g.items.filter(item => roleNav.includes(item));
    if (!matched.length) return '';
    return `<div class="nav-group-title">${E(g.title)}</div>` + matched.map(navBtn).join('');
  }).join('');

  // Fallback if some role items were not grouped
  const groupedFlat = NAV_GROUPS.flatMap(g => g.items);
  const remaining = roleNav.filter(n => !groupedFlat.includes(n));
  const desktopRemaining = remaining.length
    ? `<div class="nav-group-title">More</div>` + remaining.map(navBtn).join('')
    : '';

  $('#app').innerHTML = `
    <!-- Mobile Slide-In Side Drawer -->
    <div id="drawerBackdrop"></div>
    <aside id="drawer" aria-label="Navigation drawer">
      <div class="drawer-header">
        <button class="icon-btn drawer-close" id="drawerClose" aria-label="Close menu">${ic('close')}</button>
        <div class="drawer-user">
          <div class="drawer-avatar">${initials(me.name)}</div>
          <div>
            <b style="font-size:16px;display:block">${E(me.name)}</b>
            <span class="tag ${me.role}">${E(me.role)}</span>
          </div>
        </div>
      </div>
      <nav class="drawer-nav">
        ${groupedDesktop + desktopRemaining}
      </nav>
      <div class="drawer-footer">
        ${themeBtnHtml()}
        <button class="btn alt sm" id="drawerLo" style="color:var(--bad);border-color:var(--bad-border)">Sign out</button>
      </div>
    </aside>

    <!-- Desktop Sidebar + Content Column -->
    <div class="shell">
      <nav aria-label="Sidebar">
        <div class="brand-title">${logoMark()}Hostel<span>Hub</span></div>
        ${groupedDesktop + desktopRemaining}
        <span class="sp"></span>
        <div class="nav-footer">
          <div class="row" style="align-items:center;gap:10px;padding:4px 10px">
            <div class="avatar-chip">${initials(me.name)}</div>
            <div style="overflow:hidden">
              <b style="font-size:13px;display:block;white-space:nowrap;text-overflow:ellipsis">${E(me.name)}</b>
              <span class="mut" style="font-size:11px">${E(me.role)}</span>
            </div>
          </div>
          ${themeBtnHtml()}
          <button id="lo">Sign out</button>
        </div>
      </nav>

      <div class="content-col">
        <header class="topbar">
          <button class="icon-btn" id="navToggle" aria-label="Toggle menu">${ic('menu')}</button>
          <div class="brand-title">${logoMark()}Hostel<span>Hub</span></div>
          <span class="crumb">${E(view)}</span>
          <span class="sp"></span>
          <div class="topbar-actions">
            <div class="bell-wrap">
              <button class="icon-btn" id="bellBtn" aria-label="Notifications" aria-haspopup="true" aria-expanded="false">
                ${ic('alerts')}
                <span class="badge-dot" id="unreadBadge" style="display:none">0</span>
              </button>
              <div class="notif-panel" id="notifPanel" hidden>
                <div class="notif-head"><b>Notifications</b><button class="see-more" data-v="Alerts">View all ›</button></div>
                <div class="notif-list" id="notifList"><p class="mut">Loading…</p></div>
              </div>
            </div>
            <div class="user-chip" data-v="Account" title="${E(me.name)}">
              <div class="avatar-chip">${initials(me.name)}</div>
              <div class="hdr-user"><b>${E(me.name)}</b><span>${E(me.role)}</span></div>
            </div>
          </div>
        </header>

        <main id="main"></main>
      </div>
    </div>

    <!-- Mobile Bottom Tab Bar -->
    <nav class="tabbar" aria-label="Mobile navigation">
      ${primeTabs.map(n => `<button class="tab-btn ${n === view ? 'on' : ''}" data-v="${n}">${ic(n)}<span>${n}</span></button>`).join('')}
      <button class="tab-btn" id="moreTabBtn">${ic('more')}<span>More</span></button>
    </nav>
  `;

  bindThemeToggle();

  // Navigation handlers are delegated once at startup (see bottom of file) so
  // [data-v] elements rendered later inside #main — e.g. home quick functions —
  // also navigate. Binding here only covered shell chrome rendered before render().

  // Hamburger: opens drawer on mobile, collapses sidebar on desktop
  const navToggle = $('#navToggle');
  if (navToggle) navToggle.onclick = () => {
    if (window.matchMedia('(max-width: 900px)').matches) toggleDrawer(true);
    else document.querySelector('.shell')?.classList.toggle('nav-collapsed');
  };
  const dClose = $('#drawerClose');
  if (dClose) dClose.onclick = () => toggleDrawer(false);
  const dBackdrop = $('#drawerBackdrop');
  if (dBackdrop) dBackdrop.onclick = () => toggleDrawer(false);
  const moreTab = $('#moreTabBtn');
  if (moreTab) moreTab.onclick = () => toggleDrawer(true);

  // Logout handlers
  const lo = $('#lo');
  if (lo) lo.onclick = logout;
  const dLo = $('#drawerLo');
  if (dLo) dLo.onclick = logout;

  // Notification bell: inline dropdown of the latest notifications
  const bellBtn = $('#bellBtn'), notifPanel = $('#notifPanel');
  if (bellBtn && notifPanel) {
    bellBtn.onclick = e => {
      e.stopPropagation();
      const opening = notifPanel.hidden;
      notifPanel.hidden = !opening;
      bellBtn.setAttribute('aria-expanded', String(opening));
      if (opening) loadNotifList();
    };
    // Stop background clicks from closing the panel — but let [data-v] buttons
    // (View all ›) bubble so the delegated navigator handles them.
    notifPanel.onclick = e => { if (!e.target.closest('[data-v]')) e.stopPropagation(); };
  }

  // Update notification badge
  updateBadge();
  render();
}

// Render latest notifications into the bell dropdown
async function loadNotifList() {
  const list = $('#notifList');
  if (!list) return;
  try {
    const n = await api('notifications');
    list.innerHTML = n.length
      ? n.slice(0, 8).map(x => `<div class="notif-item"><span class="notif-dot"></span><div><div class="notif-text">${E(x.text)}</div><span class="notif-time">${E(x.created)}</span></div></div>`).join('')
      : '<p class="mut">You are all caught up 🎉</p>';
  } catch {
    list.innerHTML = '<p class="mut">Could not load notifications.</p>';
  }
}

// Update Unread Alerts Count Badge
async function updateBadge() {
  try {
    const list = await api('notifications');
    const badge = $('#unreadBadge');
    if (badge && list && list.length > 0) {
      badge.textContent = list.length > 9 ? '9+' : String(list.length);
      badge.style.display = 'flex';
    }
  } catch {}
}

const tag = s => `<span class="tag ${s}">${E(String(s).replace('_', ' '))}</span>`;
const form = (id, html, btn) => `<form id="${id}" class="card">${html}<div class="err" id="${id}e"></div><button class="btn">${btn}</button></form>`;

function onForm(id, fn) {
  const f = $('#' + id);
  if (f) {
    f.onsubmit = async e => {
      e.preventDefault();
      try {
        await fn(Object.fromEntries(new FormData(f)));
        render();
      } catch (x) {
        $('#' + id + 'e').textContent = x.message;
      }
    };
  }
}

const act = (sel, fn) => document.querySelectorAll(sel).forEach(b => b.onclick = async () => {
  try {
    await fn(b.dataset);
    render();
  } catch (x) {
    alert(x.message);
  }
});

async function render() {
  const m = $('#main');
  const V = {
    Home: home,
    Overview: home,
    Complaints: complaints,
    Tasks: complaints,
    Leave: leave,
    Visitors: visitors,
    Gate: gate,
    Rooms: rooms,
    People: people,
    Announce: announce,
    Alerts: alerts,
    Account: account,
    Monitor: monitor,
    Campus: campusView,
    'Gate Pass': gatepass,
    'Gate Passes': gpAdmin
  };
  clearInterval(window.gpt);
  clearInterval(window.gpcd);
  m.innerHTML = '<div class="skeleton-shimmer" role="status"><p class="mut sr-only">Loading…</p><div class="sk-bar"></div><div class="sk-grid"><div class="sk-card"></div><div class="sk-card"></div><div class="sk-card"></div></div></div>';
  try {
    m.innerHTML = await V[view]();
    bind();
  } catch (x) {
    m.innerHTML = `<p class="err">${E(x.message)}</p>`;
  }
}

// Time-based greeting helper
function timeGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

// Progress Ring SVG Generator
function progressRingSvg(pct, valText, colorClass = '') {
  const r = 36, circ = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, pct || 0));
  const offset = circ - (clamped / 100) * circ;
  return `
    <div class="ring-svg-wrap">
      <svg viewBox="0 0 90 90">
        <circle class="ring-track" cx="45" cy="45" r="${r}" />
        <circle class="ring-progress ${colorClass}" cx="45" cy="45" r="${r}" stroke-dasharray="${circ}" stroke-dashoffset="${offset}" />
      </svg>
      <div class="ring-value">${valText}</div>
    </div>
  `;
}

// Client-side Filter Chip Row Helper
function filterRow(chips) {
  return `
    <div class="filter-row">
      ${chips.map((c, i) => `<button class="filter-chip ${i === 0 ? 'active' : ''}" type="button" data-filter="${c.val}">${c.label} (${c.count})</button>`).join('')}
    </div>
  `;
}

function bindFilterChips(cardSelector, getItemStatus) {
  document.querySelectorAll('.filter-chip').forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll('.filter-chip').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const val = btn.dataset.filter;
      document.querySelectorAll(cardSelector).forEach(card => {
        const st = getItemStatus(card);
        if (val === 'all' || st === val) {
          card.style.display = '';
        } else {
          card.style.display = 'none';
        }
      });
    };
  });
}

const bar = (rows) => {
  const mx = Math.max(1, ...rows.map(r => r.n));
  return rows.map(r => `
    <div class="row">
      <span style="width:110px">${E(r.label)}</span>
      <div class="grow"><div class="bar" style="width:${(r.n / mx) * 100}%"></div></div>
      <b>${r.n}</b>
    </div>
  `).join('') || '<p class="mut">No data yet.</p>';
};

// ==========================================================================
// Signature Home Dashboard per Role
// ==========================================================================
async function home() {
  const an = await api('announcements');
  const ann = an.map(a => `<div class="card"><b>${E(a.title)}</b><p class="mut">${E(a.body)} — ${E(a.author)}</p></div>`).join('') || '<p class="mut">No announcements.</p>';

  // --- Student Dashboard ---
  if (me.role === 'student') {
    const [gs, passes, compList] = await Promise.all([
      api('gatepass').catch(() => ({ status: 'in' })),
      api('gatepasses').catch(() => []),
      api('complaints').catch(() => [])
    ]);
    const isOut = gs.status === 'out';
    const activePass = passes.find(p => ['approved', 'active'].includes(p.status));
    const openComplaints = compList.filter(c => c.status === 'open');

    return `
      <div class="greeting-hero">
        <div class="greeting-text">
          <h2>${timeGreeting()}, ${E(me.name.split(' ')[0])}</h2>
          <div class="greeting-subtitle">
            Room <b>${E(me.room || 'not assigned')}</b> ${me.block ? `· Block ${E(me.block)}` : ''} · ${E(me.hostel || 'HostelHub')}
          </div>
        </div>
        <div class="avatar-chip" style="width:48px;height:48px;font-size:16px">${initials(me.name)}</div>
      </div>

      <!-- Campus Status Hero Card -->
      <div class="card" style="display:flex;align-items:center;justify-content:space-between;gap:14px;padding:20px;border-left:5px solid ${isOut ? 'var(--warn)' : 'var(--ok)'}">
        <div>
          <span style="font-size:12px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:0.04em">Current Status</span>
          <h3 style="margin:4px 0 6px;font-size:19px;color:${isOut ? 'var(--warn)' : 'var(--ok)'}">
            ${isOut ? 'Outside Campus' : 'On Campus'}
          </h3>
          <p class="mut" style="margin:0;font-size:13px">
            ${activePass ? `Pass valid until ${activePass.valid_to.replace('T', ' ')}` : (isOut ? 'Please scan back at gate when returning' : 'Safe and registered on campus')}
          </p>
        </div>
        <button class="btn sm" data-v="Gate Pass" style="white-space:nowrap;display:flex;align-items:center;gap:6px">
          ${ic('qr')} Show QR
        </button>
      </div>

      <!-- Quick Functions Grid -->
      <h3>Quick functions</h3>
      <div class="quick-grid">
        <div class="quick-btn" data-v="Gate Pass">
          <div class="quick-icon-wrap">${ic('gatepass')}</div>
          <span>Gate Pass</span>
        </div>
        <div class="quick-btn" data-v="Complaints">
          <div class="quick-icon-wrap">${ic('complaints')}</div>
          <span>Complaints</span>
        </div>
        <div class="quick-btn" data-v="Leave">
          <div class="quick-icon-wrap">${ic('leave')}</div>
          <span>Leave</span>
        </div>
        <div class="quick-btn" data-v="Visitors">
          <div class="quick-icon-wrap">${ic('visitors')}</div>
          <span>Visitors</span>
        </div>
      </div>

      <!-- Active Requests Summary -->
      ${openComplaints.length ? `
        <div class="card" style="border-color:var(--warn-border);background:var(--warn-bg)">
          <div class="row">
            <span style="color:var(--warn);font-weight:700" class="grow">You have ${openComplaints.length} open complaint${openComplaints.length > 1 ? 's' : ''} in progress</span>
            <button class="btn sm alt" data-v="Complaints">View</button>
          </div>
        </div>
      ` : ''}

      <h3>Announcements</h3>
      ${ann}
    `;
  }

  // --- Maintenance Dashboard ---
  if (me.role === 'maintenance') {
    const list = await api('complaints').catch(() => []);
    const pending = list.filter(c => c.status === 'open');
    const inProg = list.filter(c => c.status === 'in_progress');

    return `
      <div class="greeting-hero">
        <div class="greeting-text">
          <h2>${timeGreeting()}, ${E(me.name.split(' ')[0])}</h2>
          <div class="greeting-subtitle">Maintenance Team · Fast Resident Service</div>
        </div>
        <div class="avatar-chip" style="width:48px;height:48px;font-size:16px">${initials(me.name)}</div>
      </div>

      <div class="grid">
        ${statTile('campus', `${pending.length}`, 'New / unaccepted tasks')}
        ${statTile('tasks', inProg.length, 'In progress now')}
        ${statTile('gatepass', list.filter(c => c.status === 'resolved').length, 'Resolved tasks')}
      </div>

      <div class="row" style="margin-bottom:16px">
        <button class="btn grow" data-v="Tasks">Open My Tasks (${list.length})</button>
      </div>

      <h3>Announcements</h3>
      ${ann}
    `;
  }

  // --- Gate Security Dashboard ---
  if (me.role === 'security') {
    const [l, g] = await Promise.all([api('visitors'), api('gate/summary')]);
    const ins = l.filter(v => v.status === 'inside');

    return `
      <div class="greeting-hero">
        <div class="greeting-text">
          <h2>${timeGreeting()}, ${E(me.name.split(' ')[0])}</h2>
          <div class="greeting-subtitle">Campus Gate Security Guard Station</div>
        </div>
        <div class="avatar-chip" style="width:48px;height:48px;font-size:16px">${initials(me.name)}</div>
      </div>

      <div class="row" style="margin-bottom:18px">
        <button class="btn grow" data-v="Gate" style="font-size:16px;padding:14px">
          ${ic('gate')} Open Gate Scanner & Pass Verification
        </button>
      </div>

      <div class="grid">
        ${statTile('campus', `${g.onCampus}/${g.total}`, 'Students on campus')}
        ${statTile('gate', g.outside, 'Students outside now')}
        ${statTile('visitors', ins.length, 'Visitors inside')}
      </div>

      <h3>Recent movements</h3>
      <div class="card">
        ${g.recent.slice(0, 6).map(x => `
          <div class="mut">${E(x.at)} · <b>${E(x.name)}</b> · ${x.direction === 'out' ? 'Left campus' : 'Returned'}</div>
        `).join('') || '<span class="mut">No movements yet.</span>'}
      </div>
    `;
  }

  // --- Admin and Warden Dashboard (Signature Screen) ---
  const s = await api('stats');
  const occPct = s.beds ? Math.round((s.occupied / s.beds) * 100) : 0;
  const campusPct = s.students ? Math.round((s.onCampus / s.students) * 100) : 0;  return `

    <div class="greeting-hero">
      <div class="greeting-text">
        <h2>${timeGreeting()}, ${E(me.name.split(' ')[0])}</h2>
        <div class="greeting-subtitle">
          HostelHub Management · ${E(me.role.toUpperCase())} · ${new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}
        </div>
      </div>
      <div class="avatar-chip" style="width:48px;height:48px;font-size:16px">${initials(me.name)}</div>
    </div>

    <h2>Hostel overview</h2>

    ${me.role === 'admin' && s.escalated ? `
      <div class="card" style="border-color:var(--bad)">
        <div class="row">
          <b class="err grow">${s.escalated} complaint${s.escalated > 1 ? 's' : ''} need attention (missed response or resolution targets)</b>
          <button class="btn sm" data-a="gomon">Open monitor</button>
        </div>
      </div>
    ` : ''}

    ${secHead('Occupancy & campus', 'Rooms')}
    <div class="rings-card">
      <div class="ring-item">
        ${progressRingSvg(occPct, occPct + '%')}
        <div class="ring-meta">
          <b>${s.occupied}/${s.beds}</b>
          <span>Beds occupied (${occPct}%)</span>
        </div>
      </div>
      <div class="ring-item">
        ${progressRingSvg(campusPct, campusPct + '%', 'teal')}
        <div class="ring-meta">
          <b>${s.onCampus}/${s.students}</b>
          <span>Students on campus (${campusPct}%)</span>
        </div>
      </div>
    </div>

    ${secHead('Today at a glance')}
    <div class="grid">
      ${statTile('campus', `${s.onCampus}/${s.students}`, 'Students on campus', 'blue')}
      ${statTile('rooms', `${s.occupied}/${s.beds}`, 'Beds occupied', 'violet')}
      ${statTile('gatepass', s.pendingPasses, 'Gate passes to review', 'amber')}
      ${statTile('complaints', s.openComplaints, 'Open complaints', 'rose')}
      ${statTile('leave', s.pendingLeaves, 'Pending leaves', 'teal')}
      ${statTile('visitors', s.visitorsInside, 'Visitors inside', 'green')}
    </div>

    ${secHead('Quick functions')}
    <div class="quick-grid">
      <div class="quick-btn" data-v="Complaints">
        <div class="quick-icon-wrap">${ic('complaints')}</div>
        <span>Complaints</span>
      </div>
      <div class="quick-btn" data-v="Leave">
        <div class="quick-icon-wrap">${ic('leave')}</div>
        <span>Leave</span>
      </div>
      <div class="quick-btn" data-v="Visitors">
        <div class="quick-icon-wrap">${ic('visitors')}</div>
        <span>Visitors</span>
      </div>
      <div class="quick-btn" data-v="Gate Passes">
        <div class="quick-icon-wrap">${ic('gatepass')}</div>
        <span>Gate Passes</span>
      </div>
      <div class="quick-btn" data-v="Campus">
        <div class="quick-icon-wrap">${ic('campus')}</div>
        <span>Campus</span>
      </div>
      <div class="quick-btn" data-v="Rooms">
        <div class="quick-icon-wrap">${ic('rooms')}</div>
        <span>Rooms</span>
      </div>
      <div class="quick-btn" data-v="People">
        <div class="quick-icon-wrap">${ic('people')}</div>
        <span>People</span>
      </div>
      <div class="quick-btn" data-v="Announce">
        <div class="quick-icon-wrap">${ic('announce')}</div>
        <span>Announce</span>
      </div>
      ${me.role === 'admin' ? `
        <div class="quick-btn" data-v="Monitor">
          <div class="quick-icon-wrap">${ic('monitor')}</div>
          <span>Monitor</span>
        </div>
      ` : ''}
    </div>

    ${secHead('Complaints trend · last 14 days', me.role === 'admin' ? 'Monitor' : 'Complaints')}
    <div class="card">${dailySvg(s.days)}</div>

    <div class="two-col">
      <div>
        ${secHead('By category')}
        <div class="card">${bar(s.byCategory)}</div>
      </div>
      <div>
        ${secHead('By status')}
        <div class="card">${donut(s.byStatus)}</div>
      </div>
    </div>

    ${secHead('Recent activity')}
    <div class="card">${s.activity.map(a => `<div class="mut">${E(a.created)} · ${E(a.name || '—')} · ${E(a.action)}</div>`).join('')}</div>

    ${secHead('Announcements', 'Announce')}
    ${ann}
  `;
}

// Complaints Screen
async function complaints() {
  const l = await api('complaints'), st = me.role === 'student', mt = me.role === 'maintenance', staff = !st && !mt;
  const f = st ? form('cf', '<label>Title<input name="title" required></label><label>What is wrong?<textarea name="description" rows="3" required></textarea></label><div class="mut" id="ai">AI will set category and priority when you submit.</div>', 'Submit complaint') : '';

  // Filter chips
  const total = l.length;
  const cOpen = l.filter(c => c.status === 'open').length;
  const cProg = l.filter(c => c.status === 'in_progress').length;
  const cRes = l.filter(c => c.status === 'resolved').length;
  const filterChips = filterRow([
    { label: 'All', val: 'all', count: total },
    { label: 'Open', val: 'open', count: cOpen },
    { label: 'In Progress', val: 'in_progress', count: cProg },
    { label: 'Resolved', val: 'resolved', count: cRes }
  ]);

  return `
    <h2>${mt ? 'My tasks' : 'Complaints'}</h2>
    ${f}
    ${filterChips}
    <div id="complaintsList">
      ${l.map(c => `
        <div class="card complaint-card" data-status="${c.status}">
          <div class="row">
            <b class="grow">${E(c.title)}</b>
            ${tag(c.priority)}${tag(c.status)}
            ${staff && !c.ack_at && !['resolved', 'cancelled'].includes(c.status) ? `<button class="btn sm" data-a="ack" data-id="${c.id}">Acknowledge</button>` : ''}
            ${cxBtn('complaints', c.id, st && c.status === 'open')}
            ${delBtn('complaints', c.id)}
          </div>
          <div class="mut">${E(c.category)} · ${E(c.student)}${c.assignee ? ' · assigned to ' + E(c.assignee) : ''}${c.acker ? ' · reviewed by ' + E(c.acker) : ''}</div>
          <p>${E(c.description)}</p>
          ${c.evidence ? `<div class="mut">Resolution: ${E(c.evidence)}</div>` : ''}
          ${c.photo ? `<a href="${E(c.photo)}" target="_blank" rel="noopener"><img src="${E(c.photo)}" alt="Resolution evidence" style="max-width:220px;border-radius:6px"></a>` : ''}
          ${mt && !['resolved', 'cancelled'].includes(c.status) ? `
            <div class="row" style="margin-top:10px">
              ${c.status === 'open' ? `<button class="btn sm" data-a="st" data-id="${c.id}" data-s="accepted">Accept</button>` : ''}
              ${c.status !== 'in_progress' ? `<button class="btn sm alt" data-a="st" data-id="${c.id}" data-s="in_progress">Start work</button>` : ''}
              <button class="btn sm" data-a="res" data-id="${c.id}">Resolve with photo or note</button>
            </div>
          ` : ''}
        </div>
      `).join('') || '<p class="mut">Nothing here yet.</p>'}
    </div>
  `;
}

// Leave Screen
async function leave() {
  const l = await api('leaves'), st = me.role === 'student';
  const total = l.length;
  const cPend = l.filter(x => x.status === 'pending').length;
  const cAppr = l.filter(x => x.status === 'approved').length;
  const cRej = l.filter(x => x.status === 'rejected').length;
  const filterChips = filterRow([
    { label: 'All', val: 'all', count: total },
    { label: 'Pending', val: 'pending', count: cPend },
    { label: 'Approved', val: 'approved', count: cAppr },
    { label: 'Rejected', val: 'rejected', count: cRej }
  ]);

  return `
    <h2>Leave</h2>
    ${st ? form('lf2', '<div class="row"><label class="grow">From<input type="date" name="from_date" required></label><label class="grow">To<input type="date" name="to_date" required></label></div><label>Reason<input name="reason"></label>', 'Request leave') : ''}
    ${filterChips}
    <div id="leavesList">
      ${l.map(x => `
        <div class="card leave-card" data-status="${x.status}">
          <div class="row">
            <b class="grow">${E(x.student || '')} ${E(x.from_date)} → ${E(x.to_date)}</b>
            ${tag(x.status)}
            ${cxBtn('leaves', x.id, st && ['pending', 'approved'].includes(x.status))}
            ${delBtn('leaves', x.id)}
          </div>
          <div class="mut">${E(x.reason)}</div>
          ${!st && x.status === 'pending' ? `
            <div class="row" style="margin-top:10px">
              <button class="btn sm" data-a="lv" data-id="${x.id}" data-s="approved">Approve</button>
              <button class="btn sm alt" data-a="lv" data-id="${x.id}" data-s="rejected">Reject</button>
            </div>
          ` : ''}
        </div>
      `).join('') || '<p class="mut">No requests.</p>'}
    </div>
  `;
}

// Visitors Screen
async function visitors() {
  const l = await api('visitors'), st = me.role === 'student';
  const total = l.length;
  const cPend = l.filter(v => v.status === 'pending').length;
  const cAppr = l.filter(v => ['approved', 'inside'].includes(v.status)).length;
  const filterChips = filterRow([
    { label: 'All', val: 'all', count: total },
    { label: 'Pending', val: 'pending', count: cPend },
    { label: 'Approved / Inside', val: 'approved', count: cAppr }
  ]);

  return `
    <h2>Visitors</h2>
    ${st ? form('vf', '<label>Visitor name<input name="name" required></label><label>Visit date<input type="date" name="visit_date" required></label><label>Purpose<input name="purpose"></label>', 'Request pass') : ''}
    ${filterChips}
    <div id="visitorsList">
      ${l.map(v => `
        <div class="card visitor-card" data-status="${v.status}">
          <div class="row">
            <b class="grow">${E(v.name)} · ${E(v.visit_date)}</b>
            ${tag(v.status)}
            ${cxBtn('visitors', v.id, st && ['pending', 'approved'].includes(v.status))}
            ${delBtn('visitors', v.id)}
          </div>
          <div class="mut">${E(v.purpose)} · ${E(v.student)}</div>
          ${v.qr ? `<div style="text-align:center;margin:12px 0"><img src="${v.qr}" width="160" alt="Visitor QR pass for ${E(v.name)}" style="background:#fff;padding:8px;border-radius:12px;border:1px solid var(--border)"></div>` : ''}
          ${!st && v.status === 'pending' ? `
            <div class="row" style="margin-top:10px">
              <button class="btn sm" data-a="vs" data-id="${v.id}" data-s="approved">Approve</button>
              <button class="btn sm alt" data-a="vs" data-id="${v.id}" data-s="rejected">Reject</button>
            </div>
          ` : ''}
        </div>
      `).join('') || '<p class="mut">No visitors.</p>'}
    </div>
  `;
}

const campus = g => `
  <div class="grid">
    ${statTile('campus', `${g.onCampus}/${g.total}`, 'Students on campus')}
    ${statTile('gate', g.outside, 'Outside now')}
  </div>
  <h3>Outside now</h3>
  ${g.outList.map(x => `
    <div class="card row">
      <b class="grow">${E(x.name)}</b>
      ${x.overdue ? '<span class="tag high">Overdue</span>' : ''}
      <span class="mut">Room ${E(x.room || '—')} · left ${E(x.since)}${x.due ? ' · due back ' + E(x.due.replace('T', ' ')) : ''}</span>
    </div>
  `).join('') || '<p class="mut">Everyone is on campus.</p>'}
  <h3>Recent gate activity</h3>
  <div class="card">
    ${g.recent.map(x => `<div class="mut">${E(x.at)} · ${E(x.name)} · ${x.direction === 'out' ? 'left campus' : 'returned'}</div>`).join('') || '<span class="mut">No movements yet.</span>'}
  </div>
`;

async function gate() {
  const [l, g] = await Promise.all([api('visitors'), api('gate/summary')]), ins = l.filter(v => v.status === 'inside');
  return `
    <h2>Gate</h2>
    ${form('sf', '<label>Pass code<input name="token" autocomplete="off" autofocus placeholder="Scan QR or enter code (GP... or HH-...)" required></label>', 'Verify pass')}
    <div class="row"><button class="btn alt" id="cam" type="button">Scan with camera</button></div>
    <video id="vid" hidden playsinline muted style="width:100%;max-width:420px;border-radius:12px;margin-top:10px"></video>
    <div id="res"></div>
    <p class="mut">Scan a student gate pass or a visitor pass. A student\'s first scan records exit, the next records return.</p>
    ${campus(g)}
    <h3>Visitors inside (${ins.length})</h3>
    ${ins.map(v => `<div class="card"><b>${E(v.name)}</b> <span class="mut">visiting ${E(v.student)} since ${E(v.entry_at)}</span></div>`).join('') || '<p class="mut">No visitors inside.</p>'}
  `;
}

const campusView = async () => '<h2>Campus</h2>' + campus(await api('gate/summary'));

const gpstat = g => `
  <span class="tag ${g.status === 'out' ? 'pending' : 'approved'}">${g.status === 'out' ? 'Outside campus' : 'On campus'}</span>
  ${g.pass ? `<span class="mut">${g.status === 'out' ? 'Return by ' + E(g.pass.valid_to.replace('T', ' ')) : 'Valid ' + E(g.pass.valid_from.replace('T', ' ')) + ' to ' + E(g.pass.valid_to.replace('T', ' '))}</span>` : ''}
`;

async function gatepass() {
  const [g, l] = await Promise.all([api('gatepass'), api('gatepasses')]), open = l.some(x => ['pending', 'approved', 'active'].includes(x.status));
  return `
    <h2>Gate pass</h2>
    ${g.qr ? `
      <div class="card" style="text-align:center">
        <div style="background:#ffffff;padding:16px;border-radius:16px;display:inline-block;margin:0 auto 12px;box-shadow:0 4px 16px rgba(0,0,0,0.08);border:1px solid rgba(0,0,0,0.06)">
          <img id="gpqr" src="${g.qr}" width="240" height="240" alt="Your gate pass QR code" style="display:block;border-radius:8px">
        </div>
        <div id="gpCountdown" style="font-size:12px;font-weight:700;color:var(--muted);margin-bottom:10px">Refreshes in 25s</div>
        <div id="gps" class="row" style="justify-content:center">${gpstat(g)}</div>
        <p class="mut" style="max-width:440px;margin:12px auto 0">Show this code to security when you leave and again when you return. It refreshes every 25 seconds, so a screenshot will not work.</p>
      </div>
    ` : `
      <div class="card"><div class="row">${gpstat(g)}</div><p class="mut">${E(g.message)}</p></div>
    `}
    ${open ? '' : form('gf', '<label>Destination<input name="destination" required></label><label>Reason<input name="reason"></label><div class="row"><label class="grow">Leave at<input type="datetime-local" name="valid_from" required></label><label class="grow">Return by<input type="datetime-local" name="valid_to" required></label></div>', 'Apply for gate pass')}
    <h3>My gate passes</h3>
    ${l.map(x => `
      <div class="card">
        <div class="row"><b class="grow">${E(x.destination)}</b>${tag(x.status)}${cxBtn('gatepasses', x.id, ['pending', 'approved'].includes(x.status))}</div>
        <div class="mut">${E(x.valid_from.replace('T', ' '))} → ${E(x.valid_to.replace('T', ' '))}${x.note ? ' · ' + E(x.note) : ''}</div>
      </div>
    `).join('') || '<p class="mut">No gate passes yet.</p>'}
  `;
}

async function gpAdmin() {
  const l = await api('gatepasses');
  const total = l.length;
  const cPend = l.filter(x => x.status === 'pending').length;
  const cAppr = l.filter(x => ['approved', 'active'].includes(x.status)).length;
  const filterChips = filterRow([
    { label: 'All', val: 'all', count: total },
    { label: 'Pending', val: 'pending', count: cPend },
    { label: 'Approved / Active', val: 'approved', count: cAppr }
  ]);

  return `
    <h2>Gate passes</h2>
    ${filterChips}
    <div id="gpAdminList">
      ${l.map(x => `
        <div class="card gp-card" data-status="${x.status}">
          <div class="row"><b class="grow">${E(x.student)} → ${E(x.destination)}</b>${tag(x.status)}</div>
          <div class="mut">Room ${E(x.room || '—')} · ${E(x.valid_from.replace('T', ' '))} → ${E(x.valid_to.replace('T', ' '))}${x.reason ? ' · ' + E(x.reason) : ''}${x.note ? ' · ' + E(x.note) : ''}</div>
          ${x.status === 'pending' ? `
            <div class="row" style="margin-top:10px">
              <button class="btn sm" data-a="gpd" data-id="${x.id}" data-s="approved">Approve</button>
              <button class="btn sm alt" data-a="gpd" data-id="${x.id}" data-s="rejected">Reject</button>
            </div>
          ` : ''}
        </div>
      `).join('') || '<p class="mut">No gate pass requests.</p>'}
    </div>
  `;
}

const PAL = { open: 'var(--warn)', accepted: 'var(--info)', in_progress: 'var(--accent)', resolved: 'var(--ok)', cancelled: 'var(--neutral)' };

function dailySvg(days) {
  const W = 640, H = 180, mx = Math.max(1, ...days.flatMap(d => [d.created, d.resolved])), bw = W / days.length;
  return `
    <svg viewBox="0 0 ${W} ${H + 22}" width="100%" role="img" aria-label="Complaints created and resolved per day, last 14 days">
      ${days.map((d, i) => {
        const x = i * bw, a = (d.created / mx) * H, b = (d.resolved / mx) * H;
        return `
          <rect x="${x + 4}" y="${H - a}" width="${bw / 2 - 5}" height="${a}" rx="4" style="fill:var(--primary)"><title>${d.d}: ${d.created} created</title></rect>
          <rect x="${x + bw / 2}" y="${H - b}" width="${bw / 2 - 5}" height="${b}" rx="4" style="fill:var(--ok)"><title>${d.d}: ${d.resolved} resolved</title></rect>
          <text x="${x + bw / 2}" y="${H + 15}" text-anchor="middle" font-size="10" style="fill:var(--muted)">${d.d.slice(8)}</text>
        `;
      }).join('')}
      <line x1="0" x2="${W}" y1="${H}" y2="${H}" style="stroke:var(--border)"/>
    </svg>
    <div class="mut"><span class="tag medium">created</span> <span class="tag low">resolved</span> · peak ${mx}/day</div>
  `;
}

function donut(rows) {
  const T = rows.reduce((a, r) => a + r.n, 0) || 1, C = 2 * Math.PI * 40;
  let off = 0;
  return `
    <div class="row">
      <svg viewBox="0 0 100 100" width="130" role="img" aria-label="Complaints by status">
        ${rows.map(r => {
          const l = (r.n / T) * C;
          const o = `<circle cx="50" cy="50" r="40" fill="none" stroke-width="16" style="stroke:${PAL[r.label] || 'var(--muted)'}" stroke-dasharray="${l} ${C - l}" stroke-dashoffset="${-off}" transform="rotate(-90 50 50)"/>`;
          off += l;
          return o;
        }).join('')}
      </svg>
      <div>${rows.map(r => `<div>${tag(r.label)} ${r.n}</div>`).join('') || '<span class="mut">No data</span>'}</div>
    </div>
  `;
}

async function monitor() {
  const m = await api('monitor'), k = m.kpi, v = x => x == null ? '—' : x, st = (n, l, icon = 'alerts') => statTile(icon, n, l);
  return `
    <h2>Complaint monitor</h2>
    <div class="grid">
      ${st(k.open, 'open', 'complaints')}
      ${st(`<span class="${k.awaitingWarden ? 'err' : ''}">${k.awaitingWarden}</span>`, 'awaiting warden past target')}
      ${st(`<span class="${k.overdue ? 'err' : ''}">${k.overdue}</span>`, 'overdue', 'clock')}
      ${st(v(k.avgAckH) + 'h', 'avg first response', 'clock')}
      ${st(v(k.avgResolveH) + 'h', 'avg resolution', 'clock')}
      ${st(k.slaPct == null ? '—' : k.slaPct + '%', 'resolved within target', 'tasks')}
    </div>
    <p class="mut">Targets (hours, first response / resolution): high ${m.sla.high.map(x => x * m.sla.scale).join(' / ')} · medium ${m.sla.medium.map(x => x * m.sla.scale).join(' / ')} · low ${m.sla.low.map(x => x * m.sla.scale).join(' / ')}. Admins are alerted automatically when a target is missed.</p>
    <h3>Needs attention (${m.flagged.length})</h3>
    ${m.flagged.map(f => `
      <div class="card">
        <div class="row">
          <b class="grow">${E(f.title)}</b>${tag(f.priority)}
          ${f.flags.includes('unack') ? '<span class="tag high">Warden has not responded</span>' : ''}
          ${f.flags.includes('overdue') ? '<span class="tag high">Overdue</span>' : ''}
        </div>
        <div class="mut">Open ${f.ageH}h · ${E(f.status.replace('_', ' '))} · ${f.assignee ? 'assigned to ' + E(f.assignee) : 'unassigned'}</div>
        <div class="row" style="margin-top:8px"><button class="btn sm" data-a="nudge" data-id="${f.id}">Remind warden</button></div>
      </div>
    `).join('') || '<p class="okmsg">Nothing is behind target.</p>'}
    <h3>Created vs resolved, last 14 days</h3>
    <div class="card">${dailySvg(m.days)}</div>
    <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(280px,1fr))">
      <div><h3>By status</h3><div class="card">${donut(m.byStatus)}</div></div>
      <div><h3>Open complaint age</h3><div class="card">${bar(m.ageing)}</div></div>
      <div><h3>By category</h3><div class="card">${bar(m.byCategory)}</div></div>
      <div><h3>By priority</h3><div class="card">${bar(m.byPriority)}</div></div>
    </div>
    <h3>Warden responsiveness</h3>
    ${m.wardens.map(w => `<div class="card row"><b class="grow">${E(w.name)}</b><span class="mut">${w.acknowledged} reviewed · avg ${v(w.avgAckH)}h · ${w.slaMissed} late</span></div>`).join('') || '<p class="mut">No wardens.</p>'}
  `;
}

const account = async () => `
  <h2>Account</h2>
  <div class="card">
    <div class="row" style="align-items:center;gap:14px">
      <div class="drawer-avatar">${initials(me.name)}</div>
      <div>
        <b style="font-size:18px">${E(me.name)}</b>
        <div class="mut">${E(me.role)}</div>
      </div>
    </div>
  </div>
  <h3>Change password</h3>
  ${form('pf', '<label>Current password<input type="password" name="current" required autocomplete="current-password"></label><label>New password (8+ characters)<input type="password" name="next" minlength="8" required autocomplete="new-password"></label>', 'Change password')}
`;

const cxBtn = (t, id, show) => show ? `<button class="btn sm alt" data-a="cx" data-t="${t}" data-id="${id}">Cancel</button>` : '';
const delBtn = (t, id) => me.role === 'admin' ? `<button class="btn sm alt" data-a="del" data-t="${t}" data-id="${id}">Delete</button>` : '';

let ROOMS = [], USERS = [], ANN = [];

function modal(title, fields, save, del) {
  const d = document.createElement('dialog');
  d.innerHTML = `
    <form>
      <h3 style="margin-top:0">${E(title)}</h3>
      ${fields.map(f => `<label>${E(f.l)}${f.o ? `<select name="${f.n}">${f.o.map(o => `<option value="${E(o[0])}" ${String(o[0]) === String(f.v ?? '') ? 'selected' : ''}>${E(o[1])}</option>`).join('')}</select>` : `<input name="${f.n}" type="${f.t || 'text'}" value="${E(f.v ?? '')}" ${f.r ? 'required' : ''} ${f.t === 'password' ? 'autocomplete="new-password"' : ''}>`}</label>`).join('')}
      <div class="err"></div>
      <div class="row">
        <button class="btn">Save</button>
        <button class="btn alt" type="button" data-x>Cancel</button>
        ${del ? '<button class="btn alt" type="button" data-d style="color:var(--bad)">Delete</button>' : ''}
      </div>
    </form>
  `;
  document.body.appendChild(d);
  d.showModal();
  const er = d.querySelector('.err'), close = () => { d.close(); d.remove(); };
  d.onclose = () => d.remove();
  d.querySelector('[data-x]').onclick = close;
  d.querySelector('form').onsubmit = async e => {
    e.preventDefault();
    try {
      await save(Object.fromEntries(new FormData(e.target)));
      close();
      render();
    } catch (x) {
      er.textContent = x.message;
    }
  };
  const b = d.querySelector('[data-d]');
  if (b) b.onclick = async () => {
    if (!confirm('Delete permanently?')) return;
    try {
      await del();
      close();
      render();
    } catch (x) {
      er.textContent = x.message;
    }
  };
}

async function rooms() {
  const [r, hs] = await Promise.all([api('rooms'), api('hostels')]);
  ROOMS = r;
  const adm = me.role === 'admin', bo = hs.flatMap(x => x.blocks.map(b => [x.name + '|' + b.name, `${x.name} · Block ${b.name}`]));
  let h = '<h2>Rooms</h2>';
  if (adm) {
    h += `
      <h3>Hostels and blocks</h3>
      ${hs.map(x => `
        <div class="card">
          <div class="row">
            <b class="grow">${E(x.name)}</b>
            <button class="btn sm alt" data-a="ab" data-h="${E(x.name)}">Add block</button>
            <button class="btn sm alt" data-a="dh" data-id="${x.id}">Delete</button>
          </div>
          <div class="row" style="margin-top:8px">
            ${x.blocks.map(b => `<span class="tag">Block ${E(b.name)} · ${b.rooms} rooms<button data-a="db" data-id="${b.id}" aria-label="Delete block ${E(b.name)}">×</button></span>`).join('') || '<span class="mut">No blocks yet.</span>'}
          </div>
        </div>
      `).join('')}
      <button class="btn alt" data-a="ah">Add hostel</button>
      <h3>Add room</h3>
      ${form('rf', `<div class="row"><label class="grow">Block<select name="blk">${bo.map(o => `<option value="${E(o[0])}">${E(o[1])}</option>`).join('')}</select></label><label class="grow">Floor<input type="number" name="floor" value="1"></label><label class="grow">Room<input name="number" required></label><label class="grow">Beds<input type="number" name="beds" value="3" min="1" max="12"></label></div>`, 'Add room')}
      <h3>All rooms</h3>
      <p class="mut">Select a room to edit or delete it.</p>
    `;
  }
  return h + `<div class="rooms">${r.map(x => `<div class="room ${x.occupied >= x.beds ? 'full' : x.occupied ? 'part' : ''}" ${adm ? `role="button" tabindex="0" data-a="er" data-id="${x.id}"` : ''} title="${E(x.residents || 'Empty')}"><b>${E(x.number)}</b><br>${E(x.block)} · ${x.occupied}/${x.beds} beds</div>`).join('')}</div>`;
}

async function people() {
  const [u, r] = await Promise.all([api('users'), me.role === 'admin' ? api('rooms') : []]);
  USERS = u;
  ROOMS = r;
  const adm = me.role === 'admin', ro = [['', 'No room'], ...r.map(x => [x.id, `${x.number} (${x.occupied}/${x.beds})`])];
  let h = '<h2>People</h2>';
  if (adm) {
    h += form('uf', `<div class="row"><label class="grow">Name<input name="name" required></label><label class="grow">Email<input type="email" name="email" required></label></div><div class="row"><label class="grow">Role<select name="role">${['student', 'warden', 'security', 'maintenance', 'admin'].map(x => `<option>${x}</option>`).join('')}</select></label><label class="grow">Room<select name="room_id">${ro.map(o => `<option value="${o[0]}">${E(o[1])}</option>`).join('')}</select></label><label class="grow">Password<input name="password" type="password" minlength="8" required></label></div>`, 'Add person');
  }
  return h + u.map(x => `<div class="card row"><b class="grow">${E(x.name)}</b><span class="mut">${E(x.email)}</span>${tag(x.role)}${x.room ? `<span class="mut">Room ${E(x.room)}</span>` : ''}${adm ? `<button class="btn sm alt" data-a="eu" data-id="${x.id}">Edit</button>` : ''}</div>`).join('');
}

async function announce() {
  ANN = await api('announcements');
  return `
    <h2>Announcements</h2>
    ${form('af', '<label>Title<input name="title" required></label><label>Message<textarea name="body" rows="3"></textarea></label>', 'Publish announcement')}
    ${ANN.map(a => `<div class="card"><div class="row"><b class="grow">${E(a.title)}</b><button class="btn sm alt" data-a="ea" data-id="${a.id}">Edit</button></div><p class="mut">${E(a.body)}</p></div>`).join('')}
  `;
}

function bindAdmin() {
  // Gate Pass Realtime Polling & 25s Countdown Timer
  if (view === 'Gate Pass') {
    let countdown = 25;
    window.gpcd = setInterval(() => {
      countdown = countdown > 1 ? countdown - 1 : 25;
      const el = $('#gpCountdown');
      if (el) el.textContent = `Refreshes in ${countdown}s`;
    }, 1000);

    window.gpt = setInterval(async () => {
      try {
        const g = await api('gatepass');
        if ($('#gpqr') && g.qr) {
          $('#gpqr').src = g.qr;
          countdown = 25;
          const s = $('#gps');
          if (s) s.innerHTML = gpstat(g);
        } else {
          render();
        }
      } catch {}
    }, 15000);
  }

  // Bind filter chips on lists
  bindFilterChips('.complaint-card', c => c.dataset.status);
  bindFilterChips('.leave-card', l => l.dataset.status);
  bindFilterChips('.visitor-card', v => ['approved', 'inside'].includes(v.dataset.status) ? 'approved' : v.dataset.status);
  bindFilterChips('.gp-card', g => ['approved', 'active'].includes(g.dataset.status) ? 'approved' : g.dataset.status);

  act('[data-a=gpd]', async d => {
    const note = d.s === 'rejected' ? (prompt('Reason for rejecting (optional)') || '') : '';
    await api('gatepasses/' + d.id, 'PATCH', { status: d.s, note });
  });
  act('[data-a=ack]', d => api('complaints/' + d.id + '/ack', 'POST'));
  act('[data-a=nudge]', async d => {
    await api('complaints/' + d.id + '/nudge', 'POST');
    alert('Reminder sent to wardens');
  });
  act('[data-a=gomon]', async () => {
    view = 'Monitor';
    shell();
  });
  act('[data-a=cx]', async d => {
    if (confirm('Cancel this request? This cannot be undone.')) await api(d.t + '/' + d.id + '/cancel', 'POST');
  });
  act('[data-a=del]', async d => {
    if (!confirm('Delete permanently?')) return;
    await api(d.t + '/' + d.id, 'DELETE');
  });
  act('[data-a=ah]', async () => modal('Add hostel', [{ n: 'name', l: 'Hostel name', r: 1 }], d => api('hostels', 'POST', d)));
  act('[data-a=ab]', async d => modal('Add block to ' + d.h, [{ n: 'name', l: 'Block name', r: 1 }], x => api('blocks', 'POST', { hostel: d.h, name: x.name })));
  act('[data-a=dh]', async d => {
    if (confirm('Delete this hostel?')) await api('hostels/' + d.id, 'DELETE');
  });
  act('[data-a=db]', async d => {
    if (confirm('Delete this block?')) await api('blocks/' + d.id, 'DELETE');
  });
  document.querySelectorAll('[data-a=er]').forEach(el => el.onkeydown = e => e.key === 'Enter' && el.click());
  act('[data-a=er]', async d => {
    const r = ROOMS.find(x => x.id == d.id);
    modal('Room ' + r.number, [{ n: 'number', l: 'Room number', v: r.number, r: 1 }, { n: 'floor', l: 'Floor', t: 'number', v: r.floor }, { n: 'beds', l: 'Beds', t: 'number', v: r.beds }], x => api('rooms/' + r.id, 'PATCH', x), () => api('rooms/' + r.id, 'DELETE'));
  });
  act('[data-a=eu]', async d => {
    const u = USERS.find(x => x.id == d.id), rm = ROOMS.find(x => x.number === u.room);
    modal('Edit ' + u.name, [{ n: 'name', l: 'Name', v: u.name, r: 1 }, { n: 'role', l: 'Role', v: u.role, o: ['student', 'warden', 'security', 'maintenance', 'admin'].map(x => [x, x]) }, { n: 'room_id', l: 'Room', v: rm?.id ?? '', o: [['', 'No room'], ...ROOMS.map(x => [x.id, `${x.number} (${x.occupied}/${x.beds})`])] }, { n: 'password', l: 'New password (leave blank to keep)', t: 'password' }], x => api('users/' + u.id, 'PATCH', x.password ? x : { ...x, password: undefined }), u.id === me.id ? null : () => api('users/' + u.id, 'DELETE'));
  });
  act('[data-a=ea]', async d => {
    const a = ANN.find(x => x.id == d.id);
    modal('Edit announcement', [{ n: 'title', l: 'Title', v: a.title, r: 1 }, { n: 'body', l: 'Message', v: a.body }], x => api('announcements/' + a.id, 'PATCH', x), () => api('announcements/' + a.id, 'DELETE'));
  });
}

const alerts = async () => `
  <h2>Alerts</h2>
  ${(await api('notifications')).map(n => `<div class="card">${E(n.text)}<div class="mut">${E(n.created)}</div></div>`).join('') || '<p class="mut">You are all caught up.</p>'}
`;

function bind() {
  bindAdmin();
  onForm('cf', async d => {
    const r = await api('complaints', 'POST', d);
    alert(`Filed as ${r.category} · ${r.priority} priority`);
  });
  onForm('pf', async d => {
    await api('password', 'POST', d);
    alert('Password changed. Other devices were signed out.');
  });
  onForm('gf', d => api('gatepasses', 'POST', d));
  onForm('lf2', d => api('leaves', 'POST', d));
  onForm('vf', d => api('visitors', 'POST', d));
  onForm('rf', d => {
    const [hostel, block] = d.blk.split('|');
    return api('rooms', 'POST', { hostel, block, floor: +d.floor, number: d.number, beds: +d.beds });
  });
  onForm('uf', d => api('users', 'POST', d));
  onForm('af', d => api('announcements', 'POST', d));

  const sf = $('#sf');
  if (sf) {
    sf.onsubmit = async e => {
      e.preventDefault();
      const r = $('#res');
      try {
        const tk = sf.token.value.trim(), gp = tk.toUpperCase().startsWith('GP.'), d = await api(gp ? 'gate/scan' : 'visitors/scan', 'POST', { token: tk });
        r.innerHTML = gp
          ? `<div class="scan g">✔ ${E(d.action)}: ${E(d.name)} · Room ${E(d.room || '—')}${d.due ? ' · return by ' + E(d.due.replace('T', ' ')) : ''} · on campus ${d.onCampus}/${d.total}</div>`
          : `<div class="scan g">✔ ${E(d.action)}: ${E(d.visitor)} (visiting ${E(d.student)})</div>`;
        sf.token.value = '';
        setTimeout(render, 3000);
      } catch (x) {
        r.innerHTML = `<div class="scan r">✖ ${E(x.message)}</div>`;
      }
    };
  }

  act('[data-a=lv]', d => api('leaves/' + d.id, 'PATCH', { status: d.s }));
  act('[data-a=vs]', d => api('visitors/' + d.id, 'PATCH', { status: d.s }));
  act('[data-a=st]', d => api('complaints/' + d.id, 'PATCH', { status: d.s }));
  act('[data-a=res]', async d => {
    const f = await pickPhoto(), ev = prompt('Describe the fix (optional if you attached a photo)') || '';
    if (!ev && !f) throw Error('Add a note or a photo to resolve');
    const p = f ? (await api('upload', 'POST', { data: f })).url : null;
    await api('complaints/' + d.id, 'PATCH', { status: 'resolved', evidence: ev || null, photo: p });
  });

  const cam = $('#cam');
  if (cam) cam.onclick = () => {
    if (stream) stopCam();
    else startCam();
  };
}

const toData = f => new Promise((ok, no) => {
  const r = new FileReader();
  r.onload = () => ok(r.result);
  r.onerror = no;
  r.readAsDataURL(f);
});

function pickPhoto() {
  return new Promise(res => {
    const i = document.createElement('input');
    i.type = 'file';
    i.accept = 'image/*';
    i.capture = 'environment';
    i.onchange = async () => res(i.files[0] ? await shrink(i.files[0]) : null);
    i.oncancel = () => res(null);
    i.click();
  });
}

async function shrink(file) {
  const img = new Image();
  img.src = await toData(file);
  await img.decode();
  const k = Math.min(1, 1600 / Math.max(img.width, img.height)), c = document.createElement('canvas');
  c.width = img.width * k;
  c.height = img.height * k;
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', .82);
}

let stream;
function stopCam() {
  if (stream) {
    stream.getTracks().forEach(t => t.stop());
    stream = null;
  }
  const v = $('#vid'), c = $('#cam');
  if (v) {
    v.hidden = true;
    v.srcObject = null;
  }
  if (c) c.textContent = 'Scan with camera';
}

async function startCam() {
  const v = $('#vid'), r = $('#res'), c = $('#cam');
  if (!navigator.mediaDevices?.getUserMedia) {
    r.innerHTML = '<div class="scan r">Camera access requires a secure context (HTTPS or localhost). Paste or enter the pass code.</div>';
    return;
  }
  v.hidden = false;
  if (c) c.textContent = 'Stop camera';
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
  } catch {
    r.innerHTML = '<div class="scan r">Camera blocked. Allow camera access, or paste the code.</div>';
    stopCam();
    return;
  }
  v.srcObject = stream;
  await v.play().catch(() => {});
  let det = null;
  try {
    if ('BarcodeDetector' in window) det = new BarcodeDetector({ formats: ['qr_code'] });
  } catch {}
  if (!det) await loadJsQR().catch(() => {});
  const cv = document.createElement('canvas'), cx = cv.getContext('2d', { willReadFrequently: true });
  const tick = async () => {
    if (!stream) return;
    let code = null;
    try {
      if (v.videoWidth) {
        if (det) {
          const b = await det.detect(v).catch(() => []);
          code = b[0]?.rawValue;
        } else if (window.jsQR) {
          cv.width = v.videoWidth;
          cv.height = v.videoHeight;
          cx.drawImage(v, 0, 0);
          code = jsQR(cx.getImageData(0, 0, cv.width, cv.height).data, cv.width, cv.height)?.data;
        }
      }
    } catch {}
    if (code) {
      stopCam();
      $('#sf').token.value = String(code).trim();
      $('#sf').requestSubmit();
      return;
    }
    requestAnimationFrame(tick);
  };
  tick();
}

const loadJsQR = () => window.jsQR ? 0 : new Promise((ok, no) => {
  const s = document.createElement('script');
  s.src = 'https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.js';
  s.onload = ok;
  s.onerror = no;
  document.head.appendChild(s);
});

let lastN = 0;
setInterval(async () => {
  if (!me) return;
  try {
    const n = await api('notifications');
    if (!n.length) return;
    if (lastN && n[0].id > lastN && view !== 'Alerts') {
      const t = document.createElement('div');
      t.setAttribute('role', 'alert');
      t.className = 'toast';
      t.textContent = n[0].text;
      document.body.appendChild(t);
      setTimeout(() => t.remove(), 7000);
      updateBadge();
    }
    lastN = n[0].id;
  } catch {}
}, 30000);

// Delegated navigation — covers shell chrome AND content rendered later into
// #main (quick functions, etc.). Runs once; #app contents are replaced freely.
document.addEventListener('click', e => {
  // Close the notification dropdown on any outside click
  const panel = document.querySelector('#notifPanel');
  if (panel && !panel.hidden && !panel.contains(e.target) && !e.target.closest('#bellBtn')) {
    panel.hidden = true;
    document.querySelector('#bellBtn')?.setAttribute('aria-expanded', 'false');
  }

  const b = e.target.closest('[data-v]');
  if (!b) return;
  stopCam();
  toggleDrawer(false);
  view = b.dataset.v;
  shell();
});

boot();
