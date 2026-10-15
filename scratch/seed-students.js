/* Seed 50 students: student1@hostelhub.test .. student50@hostelhub.test
   Password for all: 123456789
   Fills EVERY room (round-robin), never exceeding each room's bed capacity. */
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');

const db = new Database('hostelhub.db');
db.pragma('busy_timeout = 5000');

const COUNT = 50;
const PW = '123456789';

const rooms = db.prepare(`
  SELECT r.id, r.number, r.beds, COUNT(u.id) AS taken
  FROM rooms r LEFT JOIN users u ON u.room_id = r.id
  GROUP BY r.id ORDER BY r.id
`).all();
if (!rooms.length) { console.error('No rooms found — run the app once to create them.'); process.exit(1); }

const slots = rooms.map(r => ({ id: r.id, number: r.number, free: r.beds - r.taken }));
const totalFree = slots.reduce((a, s) => a + s.free, 0);
if (COUNT > totalFree) { console.error(`Only ${totalFree} free beds for ${COUNT} students.`); process.exit(1); }

// One hash reused for all (identical password by design) — avoids 50 bcrypt passes.
const hash = bcrypt.hashSync(PW, 12);
const exists = db.prepare('SELECT 1 FROM users WHERE email = ?');
const insert = db.prepare('INSERT INTO users(name, email, pw, role, room_id) VALUES (?, ?, ?, ?, ?)');

let idx = 0, added = 0, skipped = 0;
const nextFreeRoom = () => {
  for (let t = 0; t < slots.length; t++) {
    const s = slots[idx++ % slots.length];
    if (s.free > 0) return s;
  }
  return null;
};

const run = db.transaction(() => {
  for (let i = 1; i <= COUNT; i++) {
    const email = `student${i}@hostelhub.test`;
    if (exists.get(email)) { skipped++; continue; }
    const room = nextFreeRoom();
    if (!room) { console.error(`Ran out of beds at student${i}.`); process.exit(1); }
    room.free--;
    insert.run(`Student ${i}`, email, hash, 'student', room.id);
    added++;
  }
});
run();

const report = db.prepare(`
  SELECT r.number, r.beds, COUNT(u.id) AS taken
  FROM rooms r LEFT JOIN users u ON u.room_id = r.id
  GROUP BY r.id ORDER BY r.id
`).all();
const totalStudents = db.prepare("SELECT COUNT(*) n FROM users WHERE role='student'").get().n;
const empty = report.filter(r => r.taken === 0);
const over = report.filter(r => r.taken > r.beds);

console.log(`Added ${added} students (${skipped} already existed). Total students: ${totalStudents}`);
console.log(`Rooms: ${report.length} · occupied: ${report.length - empty.length} · empty: ${empty.length} · over capacity: ${over.length}`);
console.log('Per-room:', report.map(r => `${r.number}:${r.taken}/${r.beds}`).join(' '));
if (empty.length || over.length) process.exit(1);
console.log('✔ Every room is filled and within bed capacity.');
