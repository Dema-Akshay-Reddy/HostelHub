# HostelHub — One Platform. Every Hostel Operation.
Node + Express + SQLite (better-sqlite3), JWT auth with role guards, vanilla-JS SPA.

    npm install && npm start      # http://localhost:3000
    JWT_SECRET=<long random> PORT=3000 npm start   # production

Demo logins (password `demo123`): student@, warden@, admin@, security@, maint@ + `hostelhub.test`.
Flow to try: student files "fan sparking in room" -> AI marks electrical/high -> maintenance accepts, resolves with evidence;
student requests visitor -> warden approves -> student gets QR -> security pastes/scans code (entry, then exit).

Docker: `docker build -t hostelhub . && docker run -p 3000:3000 -e JWT_SECRET=<secret> -v hh:/data hostelhub`
(mount `/app/uploads` too if you want evidence photos to persist). Camera scanning needs HTTPS or localhost.
