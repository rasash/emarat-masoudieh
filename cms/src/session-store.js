const session = require("express-session");

class SqliteSessionStore extends session.Store {
  constructor(db) {
    super();
    this.db = db;
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        sid TEXT PRIMARY KEY,
        sess TEXT NOT NULL,
        expire INTEGER NOT NULL
      )
    `);
    this._get = this.db.prepare("SELECT sess, expire FROM sessions WHERE sid=?");
    this._set = this.db.prepare(
      "INSERT INTO sessions(sid, sess, expire) VALUES(?,?,?) ON CONFLICT(sid) DO UPDATE SET sess=excluded.sess, expire=excluded.expire"
    );
    this._del = this.db.prepare("DELETE FROM sessions WHERE sid=?");
    this._touch = this.db.prepare("UPDATE sessions SET expire=? WHERE sid=?");
    this._purge = this.db.prepare("DELETE FROM sessions WHERE expire < ?");
  }

  get(sid, cb) {
    try {
      this._purge.run(Date.now());
      const row = this._get.get(sid);
      if (!row || row.expire < Date.now()) return cb(null, null);
      cb(null, JSON.parse(row.sess));
    } catch (err) {
      cb(err);
    }
  }

  set(sid, sess, cb) {
    try {
      const maxAge = (sess.cookie && sess.cookie.maxAge) || 1000 * 60 * 60 * 12;
      this._set.run(sid, JSON.stringify(sess), Date.now() + maxAge);
      cb && cb(null);
    } catch (err) {
      cb && cb(err);
    }
  }

  destroy(sid, cb) {
    try {
      this._del.run(sid);
      cb && cb(null);
    } catch (err) {
      cb && cb(err);
    }
  }

  touch(sid, sess, cb) {
    try {
      const maxAge = (sess.cookie && sess.cookie.maxAge) || 1000 * 60 * 60 * 12;
      this._touch.run(Date.now() + maxAge, sid);
      cb && cb(null);
    } catch (err) {
      cb && cb(err);
    }
  }
}

module.exports = { SqliteSessionStore };
