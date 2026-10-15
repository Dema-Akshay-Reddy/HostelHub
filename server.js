const express=require('express'),Database=require('better-sqlite3'),bcrypt=require('bcryptjs'),jwt=require('jsonwebtoken'),QR=require('qrcode'),crypto=require('crypto'),fs=require('fs'),path=require('path');
const helmet=require('helmet'),{rateLimit}=require('express-rate-limit');
const PROD=process.env.NODE_ENV==='production',DEMO=process.env.SEED_DEMO?process.env.SEED_DEMO==='1':!PROD,COST=+process.env.BCRYPT_COST||12,COOKIE_SECURE=process.env.COOKIE_SECURE?process.env.COOKIE_SECURE==='1':PROD;
const SECRET=process.env.JWT_SECRET||(PROD?'':'dev-secret-change-me');
if(PROD&&SECRET.length<32){console.error('FATAL: set JWT_SECRET to a random string of 32+ characters (e.g. openssl rand -hex 32).');process.exit(1)}
const db=new Database(process.env.DB||'hostelhub.db'),DUMMY=bcrypt.hashSync('not-a-password',COST);
db.pragma('journal_mode=WAL');db.pragma('busy_timeout=5000');db.pragma('synchronous=NORMAL');
const UP=process.env.UPLOAD_DIR||path.join(__dirname,'uploads');fs.mkdirSync(UP,{recursive:true});
db.exec(`
CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY,name,email UNIQUE,pw,role,room_id INTEGER);
CREATE TABLE IF NOT EXISTS rooms(id INTEGER PRIMARY KEY,hostel,block,floor INTEGER,number,beds INTEGER);
CREATE TABLE IF NOT EXISTS complaints(id INTEGER PRIMARY KEY,student_id INTEGER,title,description,category,priority,status DEFAULT 'open',assigned_to INTEGER,evidence,created DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS leaves(id INTEGER PRIMARY KEY,student_id INTEGER,from_date,to_date,reason,status DEFAULT 'pending',created DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS visitors(id INTEGER PRIMARY KEY,student_id INTEGER,name,purpose,visit_date,token UNIQUE,status DEFAULT 'pending',entry_at,exit_at);
CREATE TABLE IF NOT EXISTS announcements(id INTEGER PRIMARY KEY,title,body,author,created DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS notifications(id INTEGER PRIMARY KEY,user_id INTEGER,text,created DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY,user_id INTEGER,action,created DEFAULT CURRENT_TIMESTAMP);`);
try{db.exec('ALTER TABLE complaints ADD COLUMN photo')}catch{}
try{db.exec('ALTER TABLE users ADD COLUMN tv INTEGER DEFAULT 0')}catch{}
if(!DEMO&&!db.prepare('SELECT 1 FROM users').get()){const e=(process.env.ADMIN_EMAIL||'').toLowerCase().trim(),p=process.env.ADMIN_PASSWORD||'';
 if(!e||p.length<8){console.error('FATAL: first run — set ADMIN_EMAIL and ADMIN_PASSWORD (8+ characters) to create the first administrator.');process.exit(1)}
 db.prepare('INSERT INTO users(name,email,pw,role) VALUES(?,?,?,?)').run('Administrator',e,bcrypt.hashSync(p,COST),'admin')}
if(DEMO&&!db.prepare('SELECT 1 FROM users').get()){
  const u=db.prepare('INSERT INTO users(name,email,pw,role,room_id) VALUES(?,?,?,?,?)'),h=p=>bcrypt.hashSync(p,COST);
  const r=db.prepare('INSERT INTO rooms(hostel,block,floor,number,beds) VALUES(?,?,?,?,?)');
  for(const b of['A','B'])for(let f=1;f<=3;f++)for(let n=1;n<=4;n++)r.run('Kaveri Hostel',b,f,`${b}${f}0${n}`,3);
  [['Admin','admin@hostelhub.test','admin'],['Warden Rao','warden@hostelhub.test','warden'],['Gate Security','security@hostelhub.test','security'],
   ['Maintenance Team','maint@hostelhub.test','maintenance']].forEach(x=>u.run(x[0],x[1],h('demo123'),x[2],null));
  u.run('Student Demo','student@hostelhub.test',h('demo123'),'student',1);
}
db.exec(`CREATE TABLE IF NOT EXISTS hostels(id INTEGER PRIMARY KEY,name TEXT UNIQUE);CREATE TABLE IF NOT EXISTS blocks(id INTEGER PRIMARY KEY,hostel TEXT,name TEXT,UNIQUE(hostel,name));
INSERT OR IGNORE INTO hostels(name) SELECT DISTINCT hostel FROM rooms;INSERT OR IGNORE INTO blocks(hostel,name) SELECT DISTINCT hostel,block FROM rooms;`);
for(const c of['ack_at','ack_by','resolved_at'])try{db.exec(`ALTER TABLE complaints ADD COLUMN ${c}`)}catch{}
db.exec('CREATE TABLE IF NOT EXISTS escalations(id INTEGER PRIMARY KEY,complaint_id INTEGER,kind,created DEFAULT CURRENT_TIMESTAMP,UNIQUE(complaint_id,kind))');
// --- SLA: [warden must acknowledge within h, must be resolved within h]; SLA_SCALE shrinks it for testing
const SLA={high:[2,24],medium:[12,72],low:[24,120]},SC=+process.env.SLA_SCALE||1,ts=t=>new Date(t.replace(' ','T')+'Z').getTime(),hrs=t=>(Date.now()-ts(t))/36e5;
function sweep(){const ins=db.prepare('INSERT OR IGNORE INTO escalations(complaint_id,kind) VALUES(?,?)');
 for(const c of db.prepare("SELECT * FROM complaints WHERE status NOT IN ('resolved','cancelled')").all()){const[a,r]=SLA[c.priority]||SLA.low,age=hrs(c.created),h=age.toFixed(1);
  if(!c.ack_at&&age>a*SC&&ins.run(c.id,'unack').changes){notifyRole('admin',`Warden has not responded to ${c.priority}-priority complaint "${c.title}" (${h}h)`);notifyRole('warden',`Admin alerted: "${c.title}" still needs your acknowledgement`)}
  if(age>r*SC&&ins.run(c.id,'overdue').changes)notifyRole('admin',`Overdue: ${c.priority}-priority complaint "${c.title}" unresolved for ${h}h`)}}
// --- campus gate: each student has a personal QR that rotates every 30 s; every scan flips IN <-> OUT
db.exec(`CREATE TABLE IF NOT EXISTS gate_state(student_id INTEGER PRIMARY KEY,status TEXT DEFAULT 'in',last_window INTEGER DEFAULT 0,updated DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS gatepasses(id INTEGER PRIMARY KEY,student_id INTEGER,destination,reason,valid_from,valid_to,status DEFAULT 'pending',note,decided_by INTEGER,decided_at,exit_at,return_at,overdue_alerted INTEGER DEFAULT 0,created DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE IF NOT EXISTS gate_log(id INTEGER PRIMARY KEY,student_id INTEGER,direction,at DEFAULT CURRENT_TIMESTAMP,by INTEGER);`);
const GW=+process.env.GATE_WINDOW_MS||3e4,REQ=process.env.GATE_REQUIRE_PASS!=='0',todayL=()=>new Date().toLocaleDateString('en-CA');
const gsig=(id,w)=>crypto.createHmac('sha256',SECRET).update(`gp.${id}.${w}`).digest('hex').slice(0,20);
const gtoken=id=>{const w=Math.floor(Date.now()/GW);return`GP.${id}.${w}.${gsig(id,w)}`};
function gparse(t){const p=String(t||'').trim().split('.');if(p.length!==4||p[0].toUpperCase()!=='GP')return null;const[,id,w,sig]=p;if(!sig||!/^\d+$/.test(id)||!/^\d+$/.test(w))return null;const a=Buffer.from(sig.toLowerCase()),b=Buffer.from(gsig(id,w));
 const now=Math.floor(Date.now()/GW);if(a.length!==b.length||!crypto.timingSafeEqual(a,b)||+w>now||now-+w>1)return null;return{id:+id,w:+w}}
function gsum(){const total=db.prepare("SELECT COUNT(*) n FROM users WHERE role='student'").get().n,out=db.prepare("SELECT u.name,r.number room,g.updated since,p.valid_to due,p.destination FROM gate_state g JOIN users u ON u.id=g.student_id LEFT JOIN rooms r ON r.id=u.room_id LEFT JOIN gatepasses p ON p.student_id=g.student_id AND p.status='active' WHERE g.status='out' AND u.role='student' ORDER BY g.updated").all().map(x=>({...x,overdue:!!x.due&&x.due<nowL()}));
 return{total,outside:out.length,onCampus:total-out.length,outList:out,recent:db.prepare("SELECT u.name,l.direction,l.at FROM gate_log l JOIN users u ON u.id=l.student_id ORDER BY l.id DESC LIMIT 15").all()}}
const nowL=(bufMin=0)=>new Date(Date.now()-new Date().getTimezoneOffset()*6e4+bufMin*6e4).toISOString().slice(0,16);
function sweepGate(){db.prepare("UPDATE gatepasses SET status='expired' WHERE status IN ('pending','approved') AND valid_to<?").run(nowL());
 for(const p of db.prepare("SELECT p.*,u.name FROM gatepasses p JOIN users u ON u.id=p.student_id WHERE p.status='active' AND p.overdue_alerted=0 AND p.valid_to<?").all(nowL())){
  db.prepare('UPDATE gatepasses SET overdue_alerted=1 WHERE id=?').run(p.id);const t=`${p.name} has not returned — was due back ${p.valid_to.replace('T',' ')} (${p.destination})`;notifyRole('warden',t);notifyRole('admin',t)}}
function validPass(id){const n=nowL(),nGrace=nowL(60),st=db.prepare('SELECT status FROM gate_state WHERE student_id=?').get(id)?.status||'in';
 return{st,pass:(st==='out'?db.prepare("SELECT * FROM gatepasses WHERE student_id=? AND status='active' ORDER BY id DESC").get(id):db.prepare("SELECT * FROM gatepasses WHERE student_id=? AND status='approved' AND valid_from<=? AND valid_to>=? ORDER BY id DESC").get(id,nGrace,n))||null}}
const approvedLeave=id=>{const t=todayL();return db.prepare("SELECT from_date,to_date,reason FROM leaves WHERE student_id=? AND status='approved' AND from_date<=? AND to_date>=? ORDER BY to_date DESC").get(id,t,t)};
db.exec(`CREATE INDEX IF NOT EXISTS i_c_student ON complaints(student_id);CREATE INDEX IF NOT EXISTS i_c_status ON complaints(status);CREATE INDEX IF NOT EXISTS i_c_assigned ON complaints(assigned_to);
CREATE INDEX IF NOT EXISTS i_l_student ON leaves(student_id);CREATE INDEX IF NOT EXISTS i_v_student ON visitors(student_id);CREATE INDEX IF NOT EXISTS i_n_user ON notifications(user_id,id);
CREATE INDEX IF NOT EXISTS i_gp_student ON gatepasses(student_id,status);CREATE INDEX IF NOT EXISTS i_gl_student ON gate_log(student_id);CREATE INDEX IF NOT EXISTS i_u_role ON users(role);CREATE INDEX IF NOT EXISTS i_u_room ON users(room_id)`);
// --- AI complaint classifier: weighted keyword scoring (swap classify() for an LLM call in production)
const CATS={electrical:['fan','light','bulb','switch','socket','power','wire','ac ','heater','short circuit','spark'],
plumbing:['tap','water','leak','pipe','flush','toilet','drain','geyser','shower','overflow'],
internet:['wifi','wi-fi','internet','network','router','lan'],
furniture:['bed','chair','table','cupboard','door','window','lock','mattress','desk'],
cleaning:['clean','garbage','dust','sweep','smell','mosquito','pest','cockroach','rat'],
security:['theft','stolen','harass','fight','unsafe','intruder']};
const URGENT=['spark','fire','smoke','short circuit','flood','overflow','shock','no water','stolen','harass','unsafe','intruder','gas'];
function classify(t){t=' '+t.toLowerCase()+' ';let best='general',s=0;
 for(const[c,w]of Object.entries(CATS)){const n=w.filter(k=>t.includes(k)).length;if(n>s){s=n;best=c}}
 const urgent=URGENT.some(k=>t.includes(k)),pr=urgent||best==='security'?'high':(/not working|broken|urgent|since \d+ days/.test(t)?'medium':'low');
 return{category:best,priority:pr,confidence:s?Math.min(.95,.55+s*.15):.3}}
const app=express(),tp=process.env.TRUST_PROXY;app.set('trust proxy',/^\d+$/.test(tp||'')?+tp:tp||false);app.disable('x-powered-by');
app.use(helmet({crossOriginEmbedderPolicy:false,contentSecurityPolicy:{useDefaults:false,directives:{defaultSrc:["'self'"],scriptSrc:["'self'",'https://cdn.jsdelivr.net'],styleSrc:["'self'","'unsafe-inline'",'https://fonts.googleapis.com'],fontSrc:['https://fonts.gstatic.com'],imgSrc:["'self'",'data:'],connectSrc:["'self'"],mediaSrc:["'self'",'blob:'],objectSrc:["'none'"],baseUri:["'self'"],frameAncestors:["'none'"],formAction:["'self'"]}}}));
if(process.env.LOG_REQUESTS!=='0')app.use((q,s,n)=>{const t=Date.now();s.on('finish',()=>{if(q.path.startsWith('/api')||s.statusCode>=400)console.log(JSON.stringify({t:new Date().toISOString(),m:q.method,p:q.path,s:s.statusCode,ms:Date.now()-t,ip:q.ip}))});n()});
app.get('/healthz',(q,s)=>{try{db.prepare('SELECT 1').get();s.json({ok:true,uptime:Math.round(process.uptime())})}catch{s.status(503).json({ok:false})}});
app.use('/api/upload',express.json({limit:'8mb'}));app.use(express.json({limit:'100kb'}));
app.use('/api',rateLimit({windowMs:6e4,limit:+process.env.API_RATE_MAX||300,standardHeaders:true,legacyHeaders:false,message:{error:'Too many requests. Slow down.'}}));
app.use('/api',(q,s,n)=>{for(const[k,v]of Object.entries(q.body||{}))if(typeof v==='string'&&k!=='data'&&v.length>2000)return s.status(400).json({error:`"${k}" is too long (max 2000 characters)`});n()});
app.use('/uploads',express.static(UP,{setHeaders:r=>r.setHeader('X-Content-Type-Options','nosniff')}));app.use(express.static(__dirname+'/public'));
const audit=(uid,a)=>db.prepare('INSERT INTO audit(user_id,action) VALUES(?,?)').run(uid,a);
const notify=(uid,t)=>uid&&db.prepare('INSERT INTO notifications(user_id,text) VALUES(?,?)').run(uid,t);
const notifyRole=(role,t)=>db.prepare('SELECT id FROM users WHERE role=?').all(role).forEach(x=>notify(x.id,t));
const parseCookie=h=>Object.fromEntries((h||'').split(';').map(c=>c.trim().split('=')).filter(x=>x[0]).map(([k,...v])=>[k,decodeURIComponent(v.join('='))]));
const auth=(...roles)=>(q,s,n)=>{let t=(q.headers.authorization||'').startsWith('Bearer ')?q.headers.authorization.slice(7):null,viaCookie=false;if(!t){t=parseCookie(q.headers.cookie).hh_token;viaCookie=!!t}
 let p;try{p=jwt.verify(t||'',SECRET)}catch{return s.status(401).json({error:'Sign in required'})}
 const u=db.prepare('SELECT id,role,name,tv FROM users WHERE id=?').get(p.id);if(!u||(u.tv||0)!==(p.tv||0))return s.status(401).json({error:'Session ended — please sign in again'});
 if(viaCookie&&q.method!=='GET'&&q.headers['x-requested-with']!=='hostelhub')return s.status(403).json({error:'Blocked cross-site request'});
 q.user={id:u.id,role:u.role,name:u.name};if(roles.length&&!roles.includes(u.role))return s.status(403).json({error:'Not allowed for your role'});n()};
const A=auth;
const setSession=(s,u)=>s.cookie('hh_token',jwt.sign({id:u.id,tv:u.tv||0},SECRET,{expiresIn:'12h'}),{httpOnly:true,sameSite:'strict',secure:COOKIE_SECURE,maxAge:12*36e5,path:'/'});
app.post('/api/login',rateLimit({windowMs:15*6e4,limit:+process.env.LOGIN_RATE_MAX||10,skipSuccessfulRequests:true,standardHeaders:true,legacyHeaders:false,message:{error:'Too many failed attempts. Try again in 15 minutes.'}}),async(q,s)=>{
 const u=db.prepare('SELECT * FROM users WHERE email=?').get(String(q.body.email||'').toLowerCase().trim()),ok=await bcrypt.compare(String(q.body.password||''),u?u.pw:DUMMY);
 if(!u||!ok)return s.status(401).json({error:'Wrong email or password'});audit(u.id,'login');setSession(s,u);s.json({user:{id:u.id,name:u.name,role:u.role},token:jwt.sign({id:u.id,tv:u.tv||0},SECRET,{expiresIn:'12h'})})});
app.post('/api/logout',(q,s)=>{s.clearCookie('hh_token',{httpOnly:true,sameSite:'strict',secure:COOKIE_SECURE,path:'/'});s.json({ok:1})});
app.post('/api/password',A(),async(q,s)=>{const u=db.prepare('SELECT * FROM users WHERE id=?').get(q.user.id),{current,next}=q.body;
 if(!(await bcrypt.compare(String(current||''),u.pw)))return s.status(400).json({error:'Current password is wrong'});if(String(next||'').length<8)return s.status(400).json({error:'New password needs 8+ characters'});
 db.prepare('UPDATE users SET pw=?,tv=COALESCE(tv,0)+1 WHERE id=?').run(await bcrypt.hash(next,COST),u.id);audit(u.id,'password changed');setSession(s,{id:u.id,tv:(u.tv||0)+1});s.json({ok:1})});
app.get('/api/me',A(),(q,s)=>s.json(db.prepare(`SELECT u.id,u.name,u.email,u.role,r.hostel,r.block,r.number room FROM users u LEFT JOIN rooms r ON r.id=u.room_id WHERE u.id=?`).get(q.user.id)));
// photo upload (base64 data URL, images only, 5 MB max)
app.post('/api/upload',A('maintenance','student','warden','admin'),(q,s)=>{const m=/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/.exec(q.body.data||'');
 if(!m)return s.status(400).json({error:'Upload a PNG, JPEG or WebP image'});const buf=Buffer.from(m[2],'base64');
 const sig=(m[1]==='png'&&buf[0]===0x89&&buf.toString('latin1',1,4)==='PNG')||(m[1]==='jpeg'&&buf[0]===0xFF&&buf[1]===0xD8)||(m[1]==='webp'&&buf.toString('latin1',0,4)==='RIFF'&&buf.toString('latin1',8,12)==='WEBP');
 if(!sig)return s.status(400).json({error:'That file is not a valid image'});
 if(buf.length>5*1024*1024)return s.status(400).json({error:'Image is over 5 MB'});
 const f=crypto.randomBytes(16).toString('hex')+'.'+(m[1]==='jpeg'?'jpg':m[1]);fs.writeFileSync(path.join(UP,f),buf);s.json({url:'/uploads/'+f})});
// gate pass
app.get('/api/gatepass',A('student'),async(q,s)=>{sweepGate();const{st,pass}=validPass(q.user.id);
 const open=db.prepare("SELECT * FROM gatepasses WHERE student_id=? AND status IN ('pending','approved') ORDER BY id DESC").get(q.user.id);
 const approved=open?.status==='approved'&&open.valid_to>=nowL()?open:null;
 let msg='';if(!pass&&st==='in'&&REQ)msg=!open?'Apply for a gate pass below. Your QR appears once the warden approves it.':open.status==='pending'?'Waiting for warden approval. Your QR appears as soon as it is approved.':`Approved. Valid ${open.valid_from.replace('T',' ')} to ${open.valid_to.replace('T',' ')}.`;
 const activePass=pass||approved;
 s.json({qr:activePass||!REQ||st==='out'?await QR.toDataURL(gtoken(q.user.id),{margin:1,width:240}):null,status:st,pass:activePass,message:msg,needPass:REQ})});
app.post('/api/gatepasses',A('student'),(q,s)=>{const{destination,reason,valid_from,valid_to}=q.body,re=/^\d{4}-\d\d-\d\dT\d\d:\d\d$/;sweepGate();
 if(!nm(destination)||!re.test(valid_from||'')||!re.test(valid_to||''))return bad(s,'Add a destination, leave time and return time');
 if(valid_to<=valid_from)return bad(s,'Return time must be after leave time');if(valid_to<=nowL())return bad(s,'That return time has already passed');
 if(db.prepare("SELECT 1 FROM gatepasses WHERE student_id=? AND status IN ('pending','approved','active')").get(q.user.id))return bad(s,'You already have an open gate pass. Cancel it or finish it first');
 db.prepare('INSERT INTO gatepasses(student_id,destination,reason,valid_from,valid_to) VALUES(?,?,?,?,?)').run(q.user.id,nm(destination),nm(reason),valid_from,valid_to);notifyRole('warden',`${q.user.name} applied for a gate pass to ${nm(destination)}`);audit(q.user.id,'gatepass:apply');s.json({ok:1})});
app.get('/api/gatepasses',A('student','warden','admin'),(q,s)=>{sweepGate();const st=q.user.role==='student';
 s.json(db.prepare(`SELECT p.*,u.name student,r.number room FROM gatepasses p JOIN users u ON u.id=p.student_id LEFT JOIN rooms r ON r.id=u.room_id ${st?'WHERE p.student_id=?':''} ORDER BY CASE p.status WHEN 'pending' THEN 0 ELSE 1 END,p.id DESC LIMIT 100`).all(...(st?[q.user.id]:[])))});
app.patch('/api/gatepasses/:id',A('warden','admin'),(q,s)=>{sweepGate();const p=db.prepare('SELECT * FROM gatepasses WHERE id=?').get(q.params.id);if(!p)return s.sendStatus(404);
 if(!['approved','rejected'].includes(q.body.status))return s.sendStatus(400);if(p.status!=='pending')return bad(s,`This pass is already ${p.status}`);
 db.prepare('UPDATE gatepasses SET status=?,note=?,decided_by=?,decided_at=CURRENT_TIMESTAMP WHERE id=?').run(q.body.status,nm(q.body.note)||null,q.user.id,p.id);
 notify(p.student_id,`Your gate pass to ${p.destination} was ${q.body.status}${q.body.note?': '+nm(q.body.note):''}`);audit(q.user.id,`gatepass:${p.id}:${q.body.status}`);s.json({ok:1})});
app.post('/api/gate/scan',A('security'),(q,s)=>{const p=gparse(q.body.token);if(!p)return s.status(400).json({error:'Invalid or expired QR — ask the student to reopen their gate pass'});
 const u=db.prepare("SELECT u.*,r.number room FROM users u LEFT JOIN rooms r ON r.id=u.room_id WHERE u.id=? AND u.role='student'").get(p.id);if(!u)return s.status(404).json({error:'Student not found'});
 const st=db.prepare('SELECT * FROM gate_state WHERE student_id=?').get(u.id)||{status:'in',last_window:0};
 if(p.w<=st.last_window)return s.status(409).json({error:'This QR was already scanned — ask the student to wait for a fresh code'});
 const dir=st.status==='in'?'out':'in';
 const vp=validPass(u.id);if(dir==='out'&&REQ&&!vp.pass)return s.status(403).json({error:`${u.name} has no approved gate pass for this time — do not allow exit`});
 db.transaction(()=>{db.prepare("INSERT INTO gate_state(student_id,status,last_window,updated) VALUES(?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(student_id) DO UPDATE SET status=excluded.status,last_window=excluded.last_window,updated=CURRENT_TIMESTAMP").run(u.id,dir,p.w);
  db.prepare('INSERT INTO gate_log(student_id,direction,by) VALUES(?,?,?)').run(u.id,dir,q.user.id);
  if(vp.pass)db.prepare(dir==='out'?"UPDATE gatepasses SET status='active',exit_at=CURRENT_TIMESTAMP WHERE id=?":"UPDATE gatepasses SET status='completed',return_at=CURRENT_TIMESTAMP WHERE id=?").run(vp.pass.id)})();
 if(dir==='in'&&vp.pass&&vp.pass.valid_to<nowL())notifyRole('warden',`${u.name} returned late (was due ${vp.pass.valid_to.replace('T',' ')})`);
 notify(u.id,dir==='out'?'You left campus':'You returned to campus');audit(q.user.id,`gate:${u.id}:${dir}`);const g=gsum();
 s.json({action:dir==='out'?'EXIT recorded':'ENTRY recorded',name:u.name,room:u.room,onCampus:g.onCampus,total:g.total,due:dir==='out'?vp.pass?.valid_to:null})});
app.get('/api/gate/summary',A('security','warden','admin'),(q,s)=>{sweepGate();s.json(gsum())});
// complaints
const CQ=`SELECT c.*,u.name student,m.name assignee,w.name acker FROM complaints c JOIN users u ON u.id=c.student_id LEFT JOIN users m ON m.id=c.assigned_to LEFT JOIN users w ON w.id=c.ack_by`;
app.post('/api/classify',A(),(q,s)=>s.json(classify((q.body.title||'')+' '+(q.body.description||''))));
app.get('/api/complaints',A(),(q,s)=>{const r=q.user.role;
 s.json(r==='student'?db.prepare(CQ+' WHERE student_id=? ORDER BY c.id DESC').all(q.user.id):r==='maintenance'?db.prepare(CQ+' WHERE assigned_to=? ORDER BY c.id DESC').all(q.user.id):db.prepare(CQ+' ORDER BY c.id DESC').all())});
app.post('/api/complaints',A('student'),(q,s)=>{const{title,description}=q.body;if(!title||!description)return s.status(400).json({error:'Add a title and description'});
 const c=classify(title+' '+description),m=db.prepare("SELECT id FROM users WHERE role='maintenance' LIMIT 1").get();
 const id=db.prepare('INSERT INTO complaints(student_id,title,description,category,priority,assigned_to) VALUES(?,?,?,?,?,?)').run(q.user.id,title,description,c.category,c.priority,m?.id).lastInsertRowid;
 notify(m?.id,`New ${c.priority} ${c.category} task: ${title}`);notifyRole('warden',`New complaint (${c.category}/${c.priority}): ${title}`);audit(q.user.id,'complaint:'+id);s.json({id,...c})});
app.patch('/api/complaints/:id',A('maintenance','warden','admin'),(q,s)=>{const c=db.prepare('SELECT * FROM complaints WHERE id=?').get(q.params.id);if(!c)return s.sendStatus(404);if(c.status==='cancelled')return s.status(400).json({error:'The student cancelled this complaint'});
 if(q.user.role==='maintenance'&&c.assigned_to!==q.user.id)return s.sendStatus(403);
 if(q.user.role!=='maintenance'&&!c.ack_at)db.prepare('UPDATE complaints SET ack_at=CURRENT_TIMESTAMP,ack_by=? WHERE id=?').run(q.user.id,c.id);
 const st=q.body.status&&['open','accepted','in_progress','resolved'].includes(q.body.status)?q.body.status:c.status;
 const photo=/^\/uploads\/[a-f0-9]{32}\.(png|jpg|webp)$/.test(q.body.photo||'')?q.body.photo:null;
 if(st==='resolved'&&!(q.body.evidence||c.evidence||photo||c.photo))return s.status(400).json({error:'Add resolution evidence (note or photo link) before resolving'});
 db.prepare('UPDATE complaints SET status=?,evidence=COALESCE(?,evidence),photo=COALESCE(?,photo),assigned_to=? WHERE id=?').run(st,q.body.evidence||null,photo,q.user.role==='maintenance'?c.assigned_to:(q.body.assigned_to??c.assigned_to),c.id);
 if(st==='resolved')db.prepare('UPDATE complaints SET resolved_at=COALESCE(resolved_at,CURRENT_TIMESTAMP) WHERE id=?').run(c.id);
 notify(c.student_id,`Complaint "${c.title}" is now ${st.replace('_',' ')}`);audit(q.user.id,`complaint:${c.id}:${st}`);s.json({ok:1})});
// leaves
app.get('/api/leaves',A('student','warden','admin'),(q,s)=>s.json(q.user.role==='student'?db.prepare('SELECT * FROM leaves WHERE student_id=? ORDER BY id DESC').all(q.user.id):db.prepare('SELECT l.*,u.name student FROM leaves l JOIN users u ON u.id=l.student_id ORDER BY l.id DESC').all()));
app.post('/api/leaves',A('student'),(q,s)=>{const{from_date,to_date,reason}=q.body;if(!from_date||!to_date||to_date<from_date)return s.status(400).json({error:'Choose a valid date range'});
 db.prepare('INSERT INTO leaves(student_id,from_date,to_date,reason) VALUES(?,?,?,?)').run(q.user.id,from_date,to_date,reason||'');notifyRole('warden',`${q.user.name} requested leave ${from_date} to ${to_date}`);s.json({ok:1})});
app.patch('/api/leaves/:id',A('warden','admin'),(q,s)=>{if(!['approved','rejected'].includes(q.body.status))return s.sendStatus(400);
 const l=db.prepare('SELECT * FROM leaves WHERE id=?').get(q.params.id);if(!l)return s.sendStatus(404);if(l.status!=='pending')return s.status(400).json({error:`This request is already ${l.status}`});db.prepare('UPDATE leaves SET status=? WHERE id=?').run(q.body.status,l.id);notify(l.student_id,`Your leave request was ${q.body.status}`);audit(q.user.id,`leave:${l.id}:${q.body.status}`);s.json({ok:1})});
// visitors + QR
app.get('/api/visitors',A('student','warden','admin','security'),async(q,s)=>{const r=q.user.role;
 let rows=db.prepare('SELECT v.*,u.name student FROM visitors v JOIN users u ON u.id=v.student_id'+(r==='student'?' WHERE student_id=?':'')+' ORDER BY v.id DESC').all(...(r==='student'?[q.user.id]:[]));
 if(r==='security')rows=rows.map(({token,...x})=>x);
 if(r==='student')for(const v of rows)if(['approved','inside'].includes(v.status))v.qr=await QR.toDataURL(v.token,{margin:1,width:220});
 s.json(rows)});
app.post('/api/visitors',A('student'),(q,s)=>{const{name,purpose,visit_date}=q.body;if(!name||!visit_date)return s.status(400).json({error:'Add visitor name and date'});
 db.prepare('INSERT INTO visitors(student_id,name,purpose,visit_date,token) VALUES(?,?,?,?,?)').run(q.user.id,name,purpose||'',visit_date,'HH-'+crypto.randomBytes(12).toString('hex'));notifyRole('warden',`Visitor request from ${q.user.name}: ${name}`);s.json({ok:1})});
app.patch('/api/visitors/:id',A('warden','admin'),(q,s)=>{if(!['approved','rejected'].includes(q.body.status))return s.sendStatus(400);
 const v=db.prepare('SELECT * FROM visitors WHERE id=?').get(q.params.id);if(!v)return s.sendStatus(404);if(v.status!=='pending')return s.status(400).json({error:`This pass is already ${v.status}`});db.prepare('UPDATE visitors SET status=? WHERE id=?').run(q.body.status,v.id);notify(v.student_id,`Visitor ${v.name} ${q.body.status}`);s.json({ok:1})});
app.post('/api/visitors/scan',A('security'),(q,s)=>{const v=db.prepare('SELECT v.*,u.name student FROM visitors v JOIN users u ON u.id=v.student_id WHERE token=?').get((q.body.token||'').trim());
 if(!v)return s.status(404).json({error:'Invalid pass — do not admit'});
 if(v.status==='cancelled')return s.status(403).json({error:'Pass was cancelled — do not admit'});
 if(v.status==='pending'||v.status==='rejected')return s.status(403).json({error:'Pass is '+v.status});
 const today=todayL(),todayUtc=new Date().toISOString().slice(0,10);
 if(v.visit_date!==today&&v.visit_date!==todayUtc&&v.status==='approved')return s.status(403).json({error:`Pass is valid for ${v.visit_date} only`});
 const now=new Date().toISOString();
 if(v.status==='approved'){db.prepare("UPDATE visitors SET status='inside',entry_at=? WHERE id=?").run(now,v.id);audit(q.user.id,'entry:'+v.id);return s.json({action:'ENTRY recorded',visitor:v.name,student:v.student})}
 if(v.status==='inside'){db.prepare("UPDATE visitors SET status='exited',exit_at=? WHERE id=?").run(now,v.id);audit(q.user.id,'exit:'+v.id);return s.json({action:'EXIT recorded',visitor:v.name,student:v.student})}
 s.status(403).json({error:'Pass already used'})});
// announcements, notifications, rooms, users, stats
app.get('/api/announcements',A(),(q,s)=>s.json(db.prepare('SELECT * FROM announcements ORDER BY id DESC LIMIT 20').all()));
app.post('/api/announcements',A('warden','admin'),(q,s)=>{if(!q.body.title)return s.sendStatus(400);db.prepare('INSERT INTO announcements(title,body,author) VALUES(?,?,?)').run(q.body.title,q.body.body||'',q.user.name);
 db.prepare("SELECT id FROM users WHERE role='student'").all().forEach(x=>notify(x.id,'Announcement: '+q.body.title));s.json({ok:1})});
app.get('/api/notifications',A(),(q,s)=>s.json(db.prepare('SELECT * FROM notifications WHERE user_id=? ORDER BY id DESC LIMIT 30').all(q.user.id)));
app.get('/api/rooms',A('warden','admin'),(q,s)=>s.json(db.prepare('SELECT r.*,(SELECT COUNT(*) FROM users WHERE room_id=r.id) occupied,(SELECT group_concat(name,\', \') FROM users WHERE room_id=r.id) residents FROM rooms r ORDER BY block,floor,number').all()));
// (room routes below)
app.get('/api/users',A('warden','admin'),(q,s)=>s.json(db.prepare('SELECT u.id,u.name,u.email,u.role,r.number room FROM users u LEFT JOIN rooms r ON r.id=u.room_id ORDER BY role,name').all()));
app.post('/api/users',A('admin'),(q,s)=>{const{name,email,password,role,room_id}=q.body;if(!name||!email||(password||'').length<8||!['student','warden','security','maintenance','admin'].includes(role))return s.status(400).json({error:'Name, email, role and an 8+ character password are required'});
 const room=room_id?db.prepare('SELECT r.beds,(SELECT COUNT(*) FROM users WHERE room_id=r.id) n FROM rooms r WHERE id=?').get(room_id):null;if(room&&room.n>=room.beds)return s.status(400).json({error:'That room is full'});
 try{db.prepare('INSERT INTO users(name,email,pw,role,room_id) VALUES(?,?,?,?,?)').run(nm(name),String(email).toLowerCase().trim(),bcrypt.hashSync(password,COST),role,room_id||null);s.json({ok:1})}catch{s.status(400).json({error:'Email already in use'})}});
app.get('/api/stats',A('warden','admin'),(q,s)=>{sweep();sweepGate();const c=x=>db.prepare(x).get().n;
 s.json({onCampus:gsum().onCampus,pendingPasses:c("SELECT COUNT(*) n FROM gatepasses WHERE status='pending'"),students:c("SELECT COUNT(*) n FROM users WHERE role='student'"),beds:c('SELECT COALESCE(SUM(beds),0) n FROM rooms'),occupied:c('SELECT COUNT(*) n FROM users WHERE room_id IS NOT NULL'),
 escalated:c("SELECT COUNT(DISTINCT e.complaint_id) n FROM escalations e JOIN complaints k ON k.id=e.complaint_id WHERE k.status NOT IN ('resolved','cancelled')"),openComplaints:c("SELECT COUNT(*) n FROM complaints WHERE status NOT IN ('resolved','cancelled')"),pendingLeaves:c("SELECT COUNT(*) n FROM leaves WHERE status='pending'"),visitorsInside:c("SELECT COUNT(*) n FROM visitors WHERE status='inside'"),
 byCategory:db.prepare('SELECT category label,COUNT(*) n FROM complaints GROUP BY category').all(),byStatus:db.prepare('SELECT status label,COUNT(*) n FROM complaints GROUP BY status').all(),
 days:(()=>{const rows=db.prepare('SELECT created,resolved_at FROM complaints').all(),day=t=>t?t.slice(0,10):null;
  return[...Array(14)].map((_,i)=>{const d=new Date(Date.now()-(13-i)*864e5).toISOString().slice(0,10);
   return{d,created:rows.filter(c=>day(c.created)===d).length,resolved:rows.filter(c=>day(c.resolved_at)===d).length}})})(),
 activity:db.prepare('SELECT a.action,a.created,u.name FROM audit a LEFT JOIN users u ON u.id=a.user_id ORDER BY a.id DESC LIMIT 12').all()})});
// ---- admin: hostels, blocks, rooms, users, records
const ad=A('admin'),nm=x=>String(x||'').trim().slice(0,60),bad=(s,m)=>s.status(400).json({error:m});
app.get('/api/hostels',A('warden','admin'),(q,s)=>s.json(db.prepare('SELECT * FROM hostels ORDER BY name').all().map(h=>({...h,blocks:db.prepare('SELECT b.*,(SELECT COUNT(*) FROM rooms r WHERE r.hostel=b.hostel AND r.block=b.name) rooms FROM blocks b WHERE hostel=? ORDER BY name').all(h.name)}))));
app.post('/api/hostels',ad,(q,s)=>{const n=nm(q.body.name);if(!n)return bad(s,'Enter a hostel name');try{db.prepare('INSERT INTO hostels(name) VALUES(?)').run(n);audit(q.user.id,'hostel+ '+n);s.json({ok:1})}catch{bad(s,'That hostel already exists')}});
app.post('/api/blocks',ad,(q,s)=>{const n=nm(q.body.name),h=nm(q.body.hostel);if(!n||!db.prepare('SELECT 1 FROM hostels WHERE name=?').get(h))return bad(s,'Choose a hostel and enter a block name');
 try{db.prepare('INSERT INTO blocks(hostel,name) VALUES(?,?)').run(h,n);audit(q.user.id,`block+ ${h}/${n}`);s.json({ok:1})}catch{bad(s,'That block already exists')}});
app.delete('/api/hostels/:id',ad,(q,s)=>{const h=db.prepare('SELECT * FROM hostels WHERE id=?').get(q.params.id);if(!h)return s.sendStatus(404);
 if(db.prepare('SELECT 1 FROM rooms WHERE hostel=?').get(h.name))return bad(s,'Delete this hostel\'s rooms first');db.prepare('DELETE FROM blocks WHERE hostel=?').run(h.name);db.prepare('DELETE FROM hostels WHERE id=?').run(h.id);audit(q.user.id,'hostel- '+h.name);s.json({ok:1})});
app.delete('/api/blocks/:id',ad,(q,s)=>{const b=db.prepare('SELECT * FROM blocks WHERE id=?').get(q.params.id);if(!b)return s.sendStatus(404);
 if(db.prepare('SELECT 1 FROM rooms WHERE hostel=? AND block=?').get(b.hostel,b.name))return bad(s,'Delete this block\'s rooms first');db.prepare('DELETE FROM blocks WHERE id=?').run(b.id);audit(q.user.id,`block- ${b.hostel}/${b.name}`);s.json({ok:1})});
const occ=id=>db.prepare('SELECT COUNT(*) n FROM users WHERE room_id=?').get(id).n;
app.post('/api/rooms',ad,(q,s)=>{const{hostel,block,number}=q.body,floor=+q.body.floor,beds=+q.body.beds;
 if(!db.prepare('SELECT 1 FROM blocks WHERE hostel=? AND name=?').get(hostel,block))return bad(s,'Choose an existing block (add it first)');
 if(!nm(number)||!Number.isInteger(floor)||!Number.isInteger(beds)||beds<1||beds>12)return bad(s,'Enter a room number, floor and 1–12 beds');
 if(db.prepare('SELECT 1 FROM rooms WHERE hostel=? AND block=? AND number=?').get(hostel,block,nm(number)))return bad(s,'That room number already exists in this block');
 db.prepare('INSERT INTO rooms(hostel,block,floor,number,beds) VALUES(?,?,?,?,?)').run(hostel,block,floor,nm(number),beds);audit(q.user.id,'room+ '+number);s.json({ok:1})});
app.patch('/api/rooms/:id',ad,(q,s)=>{const r=db.prepare('SELECT * FROM rooms WHERE id=?').get(q.params.id);if(!r)return s.sendStatus(404);
 const number=nm(q.body.number)||r.number,floor=+(q.body.floor??r.floor),beds=+(q.body.beds??r.beds);
 if(!Number.isInteger(floor)||!Number.isInteger(beds)||beds<1||beds>12)return bad(s,'Beds must be 1–12');if(beds<occ(r.id))return bad(s,`${occ(r.id)} students live here — move them before reducing beds`);
 if(number!==r.number&&db.prepare('SELECT 1 FROM rooms WHERE hostel=? AND block=? AND number=?').get(r.hostel,r.block,number))return bad(s,'That room number already exists in this block');
 db.prepare('UPDATE rooms SET number=?,floor=?,beds=? WHERE id=?').run(number,floor,beds,r.id);audit(q.user.id,'room~ '+number);s.json({ok:1})});
app.delete('/api/rooms/:id',ad,(q,s)=>{const r=db.prepare('SELECT * FROM rooms WHERE id=?').get(q.params.id);if(!r)return s.sendStatus(404);
 if(occ(r.id))return bad(s,'Room has residents — move them first');db.prepare('DELETE FROM rooms WHERE id=?').run(r.id);audit(q.user.id,'room- '+r.number);s.json({ok:1})});
app.patch('/api/users/:id',ad,(q,s)=>{const u=db.prepare('SELECT * FROM users WHERE id=?').get(q.params.id);if(!u)return s.sendStatus(404);
 const role=q.body.role||u.role,rid=q.body.room_id===undefined?u.room_id:(q.body.room_id||null);
 if(!['student','warden','security','maintenance','admin'].includes(role))return bad(s,'Unknown role');if(u.id===q.user.id&&role!==u.role)return bad(s,'You cannot change your own role');
 if(rid&&rid!==u.room_id){const r=db.prepare('SELECT beds FROM rooms WHERE id=?').get(rid);if(!r)return bad(s,'Room not found');if(occ(rid)>=r.beds)return bad(s,'That room is full')}
 if(q.body.password&&q.body.password.length<8)return bad(s,'Password needs 8+ characters');
 db.prepare('UPDATE users SET name=?,role=?,room_id=?,pw=?,tv=COALESCE(tv,0)+? WHERE id=?').run(nm(q.body.name)||u.name,role,rid,q.body.password?bcrypt.hashSync(q.body.password,COST):u.pw,q.body.password?1:0,u.id);audit(q.user.id,'user~ '+u.email);s.json({ok:1})});
app.delete('/api/users/:id',ad,(q,s)=>{const id=+q.params.id;if(id===q.user.id)return bad(s,'You cannot delete your own account');if(!db.prepare('SELECT 1 FROM users WHERE id=?').get(id))return s.sendStatus(404);
 db.transaction(()=>{for(const t of['complaints','leaves','visitors'])db.prepare(`DELETE FROM ${t} WHERE student_id=?`).run(id);db.prepare('DELETE FROM notifications WHERE user_id=?').run(id);db.prepare('DELETE FROM gate_state WHERE student_id=?').run(id);db.prepare('DELETE FROM gate_log WHERE student_id=?').run(id);db.prepare('DELETE FROM gatepasses WHERE student_id=?').run(id);
 db.prepare('UPDATE complaints SET assigned_to=NULL WHERE assigned_to=?').run(id);db.prepare('DELETE FROM users WHERE id=?').run(id)})();audit(q.user.id,'user- '+id);s.json({ok:1})});
for(const t of['complaints','leaves','visitors'])app.delete(`/api/${t}/:id`,ad,(q,s)=>{db.prepare(`DELETE FROM ${t} WHERE id=?`).run(q.params.id);audit(q.user.id,`${t}- ${q.params.id}`);s.json({ok:1})});
app.patch('/api/announcements/:id',A('warden','admin'),(q,s)=>{if(!nm(q.body.title))return bad(s,'Add a title');db.prepare('UPDATE announcements SET title=?,body=? WHERE id=?').run(nm(q.body.title),q.body.body||'',q.params.id);s.json({ok:1})});
app.delete('/api/announcements/:id',A('warden','admin'),(q,s)=>{db.prepare('DELETE FROM announcements WHERE id=?').run(q.params.id);s.json({ok:1})});
// student cancels their own request (only while it is still cancellable)
for(const[t,ok,who]of[['leaves',['pending','approved'],'warden'],['gatepasses',['pending','approved'],'warden'],['visitors',['pending','approved'],'warden'],['complaints',['open'],'warden']])
 app.post(`/api/${t}/:id/cancel`,A('student'),(q,s)=>{const r=db.prepare(`SELECT * FROM ${t} WHERE id=? AND student_id=?`).get(q.params.id,q.user.id);if(!r)return s.sendStatus(404);
  if(!ok.includes(r.status))return bad(s,r.status==='cancelled'?'Already cancelled':`This request is ${r.status.replace('_',' ')} and can no longer be cancelled`);
  db.prepare(`UPDATE ${t} SET status='cancelled' WHERE id=?`).run(r.id);notifyRole(who,`${q.user.name} cancelled a ${({leaves:'leave',visitors:'visitor',complaints:'complaint',gatepasses:'gate pass'})[t]} request`);
  if(t==='complaints'&&r.assigned_to)notify(r.assigned_to,`Task cancelled by student: ${r.title}`);audit(q.user.id,`${t}:${r.id}:cancelled`);s.json({ok:1})});
// ---- complaint monitoring, warden accountability
app.post('/api/complaints/:id/ack',A('warden','admin'),(q,s)=>{const c=db.prepare('SELECT * FROM complaints WHERE id=?').get(q.params.id);if(!c)return s.sendStatus(404);
 if(!c.ack_at&&!['resolved','cancelled'].includes(c.status)){db.prepare('UPDATE complaints SET ack_at=CURRENT_TIMESTAMP,ack_by=? WHERE id=?').run(q.user.id,c.id);audit(q.user.id,`complaint:${c.id}:ack`);notify(c.student_id,`Your complaint "${c.title}" was reviewed by the warden`)}s.json({ok:1})});
app.post('/api/complaints/:id/nudge',ad,(q,s)=>{const c=db.prepare('SELECT * FROM complaints WHERE id=?').get(q.params.id);if(!c)return s.sendStatus(404);notifyRole('warden',`Admin reminder: please act on "${c.title}" (${c.priority})`);audit(q.user.id,`nudge:${c.id}`);s.json({ok:1})});
app.get('/api/monitor',ad,(q,s)=>{sweep();const all=db.prepare('SELECT * FROM complaints').all(),open=all.filter(c=>!['resolved','cancelled'].includes(c.status)),res=all.filter(c=>c.status==='resolved'&&c.resolved_at);
 const avg=a=>a.length?+(a.reduce((x,y)=>x+y,0)/a.length).toFixed(1):null,gap=(a,b)=>(ts(a)-ts(b))/36e5,sl=c=>SLA[c.priority]||SLA.low;
 const within=res.filter(c=>gap(c.resolved_at,c.created)<=sl(c)[1]*SC).length;
 const days=[...Array(14)].map((_,i)=>{const d=new Date(Date.now()-(13-i)*864e5).toISOString().slice(0,10);return{d,created:all.filter(c=>c.created.slice(0,10)===d).length,resolved:res.filter(c=>c.resolved_at.slice(0,10)===d).length}});
 const grp=k=>Object.entries(all.reduce((m,c)=>(m[c[k]]=(m[c[k]]||0)+1,m),{})).map(([label,n])=>({label,n}));
 const ageing=[['< 24h',0,24],['1–3 days',24,72],['3–7 days',72,168],['> 7 days',168,1e9]].map(([label,lo,hi])=>({label,n:open.filter(c=>{const a=hrs(c.created);return a>=lo&&a<hi}).length}));
 const rows=db.prepare("SELECT e.kind,c.*,u.name assignee FROM escalations e JOIN complaints c ON c.id=e.complaint_id LEFT JOIN users u ON u.id=c.assigned_to WHERE c.status NOT IN ('resolved','cancelled') ORDER BY e.id DESC").all(),fl={};
 for(const r of rows){(fl[r.id]??={id:r.id,title:r.title,priority:r.priority,status:r.status,assignee:r.assignee,ageH:+hrs(r.created).toFixed(1),flags:[]}).flags.push(r.kind)}
 const wardens=db.prepare("SELECT id,name FROM users WHERE role='warden'").all().map(w=>{const a=all.filter(c=>c.ack_by===w.id&&c.ack_at);return{name:w.name,acknowledged:a.length,avgAckHours:avg(a.map(c=>gap(c.ack_at,c.created))),slaMissed:a.filter(c=>gap(c.ack_at,c.created)>sl(c)[0]*SC).length}});
 s.json({kpi:{total:all.length,open:open.length,resolved:res.length,cancelled:all.filter(c=>c.status==='cancelled').length,awaitingWarden:open.filter(c=>!c.ack_at&&hrs(c.created)>sl(c)[0]*SC).length,overdue:Object.values(fl).filter(f=>f.flags.includes('overdue')).length,avgAckH:avg(all.filter(c=>c.ack_at).map(c=>gap(c.ack_at,c.created))),avgResolveH:avg(res.map(c=>gap(c.resolved_at,c.created))),slaPct:res.length?Math.round(within/res.length*100):null},
 days,byCategory:grp('category'),byPriority:grp('priority'),byStatus:grp('status'),ageing,flagged:Object.values(fl).sort((a,b)=>b.ageH-a.ageH),wardens,sla:{...SLA,scale:SC}})});
setInterval(()=>{sweep();sweepGate()},6e4).unref();
app.use('/api',(q,s)=>s.status(404).json({error:'Not found'}));
app.use((e,q,s,n)=>{const st=e.status||500;if(st>=500)console.error(e);s.status(st).json({error:st>=500?'Something went wrong on our side':(e.type==='entity.too.large'?'Request is too large':'Bad request')})});
function backup(){const dir=process.env.BACKUP_DIR;if(!dir)return;fs.mkdirSync(dir,{recursive:true});
 db.backup(path.join(dir,`hostelhub-${new Date().toISOString().slice(0,10)}.db`)).then(()=>fs.readdirSync(dir).filter(f=>/^hostelhub-.*\.db$/.test(f)).sort().slice(0,-+(process.env.BACKUP_KEEP||7)).forEach(f=>fs.unlinkSync(path.join(dir,f)))).catch(e=>console.error('backup failed',e))}
backup();setInterval(backup,864e5).unref();
const PORT=process.env.PORT||3000,server=app.listen(PORT,()=>console.log(`HostelHub on http://localhost:${PORT} (${PROD?'production':'development'}${DEMO?', demo data':''})`));
const stop=()=>{server.close(()=>{try{db.close()}catch{}process.exit(0)});setTimeout(()=>process.exit(1),1e4).unref()};process.on('SIGTERM',stop);process.on('SIGINT',stop);
process.on('unhandledRejection',e=>{console.error('unhandledRejection',e);process.exit(1)});process.on('uncaughtException',e=>{console.error('uncaughtException',e);process.exit(1)});
