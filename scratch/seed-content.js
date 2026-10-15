/* Seed demo content into hostelhub.db:
   complaints, gate passes, leaves, visitors, announcements (+ audit & notifications).
   Idempotent: each table is skipped if it already has rows. */
const Database = require('better-sqlite3');
const crypto = require('crypto');

const db = new Database('hostelhub.db');
db.pragma('busy_timeout = 5000');

// Deterministic PRNG so re-seeds are reproducible
let seed = 20261014;
const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
const pick = a => a[Math.floor(rnd() * a.length)];
const between = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));

// UTC 'YYYY-MM-DD HH:MM:SS' (complaints/audit timestamps; server parses as UTC with Z)
const utcAgo = (days, extraH = 0) => {
  const d = new Date(Date.now() - days * 864e5 - extraH * 36e5);
  return d.toISOString().slice(0, 19).replace('T', ' ');
};
// Local 'YYYY-MM-DDTHH:MM' (gate pass windows) and 'YYYY-MM-DD' (leave/visit dates)
const localMin = (days = 0, hours = 0) => {
  const d = new Date(Date.now() + days * 864e5 + hours * 36e5);
  return new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 16);
};
const localDay = (days = 0) => localMin(days).slice(0, 10);

const students = db.prepare("SELECT id, name FROM users WHERE role='student' ORDER BY id").all();
const warden = db.prepare("SELECT id FROM users WHERE role='warden' LIMIT 1").get();
const maint = db.prepare("SELECT id FROM users WHERE role='maintenance' LIMIT 1").get();
if (!students.length || !warden || !maint) { console.error('Run the app + student seed first.'); process.exit(1); }

const audit = db.prepare('INSERT INTO audit(user_id, action, created) VALUES (?,?,?)');
const notify = db.prepare('INSERT INTO notifications(user_id, text, created) VALUES (?,?,?)');
let seeded = {};

// ---------------- Complaints ----------------
if (db.prepare('SELECT COUNT(*) n FROM complaints').get().n === 0) {
  const CATS = {
    electrical: [['Fan not working in room', 'The ceiling fan in my room has stopped rotating since morning.'],
      ['Bulb fused in bathroom', 'Bathroom bulb fused, it is too dark at night.'],
      ['Spark from socket', 'There is a spark from the power socket near the study table.']],
    plumbing: [['Tap leaking continuously', 'The washroom tap drips all night, wasting water.'],
      ['Water not flowing on 3rd floor', 'Very low water pressure on the third floor since two days.'],
      ['Toilet blocked', 'The common toilet on our floor is blocked and overflowing.']],
    internet: [['WiFi down in Block A', 'WiFi has been down since last evening, assignments are pending.'],
      ['Slow network at night', 'Network is unusably slow after 10 PM.']],
    furniture: [['Broken chair in room', 'One chair in our room has a broken leg.'],
      ['Cupboard door loose', 'The cupboard door hinge is loose and about to fall off.']],
    cleaning: [['Garbage not cleared', 'The garbage bin near the mess has not been cleared for three days.'],
      ['Mosquito menace in rooms', 'Mosquitoes are unbearable in the rooms, need spraying.']],
    security: [['Main gate lock loose', 'The side gate lock is loose, it can be pushed open.']]
  };
  const pri = { electrical: 'high', security: 'high', plumbing: 'medium', internet: 'low', furniture: 'low', cleaning: 'medium' };
  const ins = db.prepare('INSERT INTO complaints(student_id,title,description,category,priority,status,assigned_to,evidence,created,ack_at,ack_by,resolved_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)');
  const plan = [
    ...Array.from({ length: 3 }, () => 'open'),
    ...Array.from({ length: 3 }, () => 'in_progress'),
    ...Array.from({ length: 7 }, () => 'resolved'),
    'cancelled'
  ];
  plan.forEach((status, i) => {
    const category = pick(Object.keys(CATS));
    const [title, desc] = pick(CATS[category]);
    const student = pick(students);
    const ageD = between(0, 10);
    const created = utcAgo(ageD, between(0, 20));
    const acknowledged = status !== 'open' || rnd() < 0.4;
    const ack_at = acknowledged ? utcAgo(Math.max(0, ageD - 1), between(0, 20)) : null;
    const resolved_at = status === 'resolved' ? utcAgo(Math.max(0, ageD - 1), between(0, 12)) : null;
    const evidence = status === 'resolved' ? pick(['Replaced the spare part and tested — working fine.',
      'Fixed and cross-checked with the resident.', 'Cleaned, repaired and confirmed by the room mates.']) : null;
    ins.run(student.id, title, desc, category, pri[category], status, maint.id, evidence, created, ack_at, acknowledged ? warden.id : null, resolved_at);
    audit.run(student.id, 'complaint:' + (db.prepare('SELECT last_insert_rowid() id').get().id), created);
  });
  seeded.complaints = db.prepare('SELECT COUNT(*) n FROM complaints').get().n;
} else seeded.complaints = '(skipped — already has rows)';

// ---------------- Gate passes (top up to 14 total) ----------------
{
  const have = db.prepare('SELECT COUNT(*) n FROM gatepasses').get().n;
  const ins = db.prepare('INSERT INTO gatepasses(student_id,destination,reason,valid_from,valid_to,status,note,decided_by,decided_at,exit_at,return_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)');
  const dest = ['Home', 'Relatives place', 'City hospital', 'Bank work', 'Coaching class', 'Market', 'Airport'];
  const plan = [
    { s: 'pending' }, { s: 'pending' }, { s: 'pending' },
    { s: 'rejected', note: 'Exams week — please apply after the paper.' },
    { s: 'approved', out: false }, { s: 'approved', out: false }, { s: 'approved', out: false },
    { s: 'active', out: true }, { s: 'active', out: true }, { s: 'active', out: true },
    { s: 'completed' }, { s: 'completed' }, { s: 'completed' },
    { s: 'expired' }
  ];
  const setOut = db.prepare("INSERT INTO gate_state(student_id,status,updated) VALUES (?,'out',CURRENT_TIMESTAMP) ON CONFLICT(student_id) DO UPDATE SET status='out'");
  plan.slice(have).forEach(p => {
    const student = pick(students);
    const d = pick(dest);
    const vf = p.s === 'pending' || p.s === 'approved' ? localMin(rnd() < 0.5 ? 0 : 1, between(1, 6)) : localMin(-between(1, 4), 0);
    const vt = p.s === 'pending' || p.s === 'approved' ? localMin(rnd() < 0.5 ? 0 : 1, between(8, 20)) : localMin(-between(0, 3), 0);
    const decided = ['approved', 'rejected', 'active', 'completed', 'expired'].includes(p.s);
    ins.run(student.id, d, pick(['Family function', 'Personal work', 'Medical', 'Shopping', '']), vf, vt, p.s,
      p.note || null, decided ? warden.id : null, decided ? utcAgo(between(0, 2)) : null,
      ['active', 'completed'].includes(p.s) ? utcAgo(between(0, 1), between(0, 12)) : null,
      p.s === 'completed' ? utcAgo(between(0, 1), between(0, 6)) : null);
    if (p.out) setOut.run(student.id);
  });
  seeded.gatepasses = `${db.prepare('SELECT COUNT(*) n FROM gatepasses').get().n} total (added ${Math.max(0, plan.length - have)})`;
}

// ---------------- Leaves ----------------
if (db.prepare('SELECT COUNT(*) n FROM leaves').get().n === 0) {
  const ins = db.prepare('INSERT INTO leaves(student_id,from_date,to_date,reason,status) VALUES (?,?,?,?,?)');
  const reasons = ['Family function at native place', 'Medical checkup', 'Home for the weekend', 'Sibling wedding', 'Festival at home'];
  const plan = ['pending', 'pending', 'pending', 'pending',
    'approved', 'approved', 'approved', 'approved', 'approved',
    'rejected', 'rejected', 'cancelled'];
  plan.forEach(status => {
    const start = between(-8, 10);
    ins.run(pick(students).id, localDay(start), localDay(start + between(1, 4)), pick(reasons), status);
  });
  seeded.leaves = db.prepare('SELECT COUNT(*) n FROM leaves').get().n;
} else seeded.leaves = '(skipped — already has rows)';

// ---------------- Visitors (top up to 12 total) ----------------
{
  const have = db.prepare('SELECT COUNT(*) n FROM visitors').get().n;
  const ins = db.prepare('INSERT INTO visitors(student_id,name,purpose,visit_date,token,status,entry_at,exit_at) VALUES (?,?,?,?,?,?,?,?)');
  const vname = ['Ramesh Kumar', 'Sunita Devi', 'Anil Sharma', 'Priya Menon', 'Joseph Mathew', 'Farida Begum', 'Venkat Rao', 'Meena Iyer', 'Suresh Babu', 'Kavita Joshi', 'David Dsouza', 'Nanda Kumar'];
  const purposes = ['Parent meeting', 'Drop luggage', 'Birthday celebration', 'Medical help', 'Local guardian visit'];
  const plan = ['pending', 'pending', 'pending', 'rejected',
    'approved', 'approved', 'approved', 'approved',
    'inside', 'inside', 'exited', 'exited'];
  plan.slice(have).forEach(status => {
    const entry = ['inside', 'exited'].includes(status) ? utcAgo(0, between(0, 6)).replace(' ', 'T') + '.000Z' : null;
    const exit = status === 'exited' ? utcAgo(0, between(0, 2)).replace(' ', 'T') + '.000Z' : null;
    ins.run(pick(students).id, pick(vname), pick(purposes), localDay(status === 'pending' ? between(0, 3) : 0),
      'HH-' + crypto.randomBytes(12).toString('hex'), status, entry || (status === 'approved' ? null : entry), exit);
  });
  seeded.visitors = `${db.prepare('SELECT COUNT(*) n FROM visitors').get().n} total (added ${Math.max(0, plan.length - have)})`;
}

// ---------------- Announcements (top up to 6 total) ----------------
{
  const have = db.prepare('SELECT COUNT(*) n FROM announcements').get().n;
  const ins = db.prepare('INSERT INTO announcements(title,body,author,created) VALUES (?,?,?,?)');
  [['Water tanker schedule', 'A water tanker will be stationed near Block B on Saturday 8–10 AM. Store water in advance.', 'Warden Rao', 3], // eslint-disable-line
   ['Diwali celebrations in mess', 'Join the Diwali get-together in the mess hall this Friday at 7 PM. All residents welcome.', 'Warden Rao', 2],
   ['Mess menu revision', 'From next week the mess menu includes a live counter on Sundays. Share feedback with your room representative.', 'Admin', 5],
   ['Fire safety drill', 'A fire safety drill will be conducted on Block A this weekend. Please assemble at the ground within 5 minutes of the alarm.', 'Admin', 1],
   ['Library hours extended', 'The central library is now open until 11 PM during exam season.', 'Admin', 6]].slice(have).forEach(([t, b, a, daysAgo]) =>
    ins.run(t, b, a, utcAgo(daysAgo, between(0, 12))));
  seeded.announcements = `${db.prepare('SELECT COUNT(*) n FROM announcements').get().n} total (added ${Math.max(0, 5 - have)})`;
}

// ---------------- Recent-activity feed + a few notifications ----------------
if (db.prepare("SELECT COUNT(*) n FROM audit WHERE action LIKE 'leave:%'").get().n === 0) {
  const leaves = db.prepare('SELECT l.id, l.status, l.student_id FROM leaves l').all();
  leaves.slice(0, 8).forEach(l => audit.run(l.student_id, `leave:${l.id}:${l.status}`, utcAgo(between(0, 3), between(0, 20))));
  const passes = db.prepare('SELECT id, student_id, status FROM gatepasses').all();
  passes.forEach(p => {
    if (p.status === 'approved' || p.status === 'rejected') audit.run(p.student_id, `gatepass:${p.id}:${p.status}`, utcAgo(between(0, 2), between(0, 20)));
    if (p.status === 'completed' || p.status === 'active') { audit.run(p.student_id, 'gatepass:apply', utcAgo(between(1, 3), 0)); audit.run(p.student_id, 'gate:' + p.student_id + ':out', utcAgo(between(0, 1), 0)); }
    if (p.status === 'completed') audit.run(p.student_id, 'gate:' + p.student_id + ':in', utcAgo(between(0, 1), 0));
  });
  seeded.audit = db.prepare('SELECT COUNT(*) n FROM audit').get().n;
} else seeded.audit = '(skipped)';

if (db.prepare('SELECT COUNT(*) n FROM notifications').get().n === 0) {
  students.slice(0, 12).forEach(s => notify.run(s.id, 'Announcement: Diwali celebrations in mess', utcAgo(2, 1)));
  db.prepare("SELECT student_id, id FROM complaints WHERE status='resolved'").all()
    .forEach(c => notify.run(c.student_id, 'Your complaint is now resolved', utcAgo(0, between(1, 8))));
  seeded.notifications = db.prepare('SELECT COUNT(*) n FROM notifications').get().n;
} else seeded.notifications = '(skipped)';

console.log(JSON.stringify(seeded, null, 2));

// Final sanity: status mix per table
const mix = t => db.prepare(`SELECT status, COUNT(*) n FROM ${t} GROUP BY status`).all().map(r => `${r.status}:${r.n}`).join(' ');
for (const t of ['complaints', 'gatepasses', 'leaves', 'visitors']) console.log(`${t} → ${mix(t)}`);
console.log('announcements →', db.prepare('SELECT COUNT(*) n FROM announcements').get().n);
console.log('students currently out →', db.prepare("SELECT COUNT(*) n FROM gate_state WHERE status='out'").get().n);
