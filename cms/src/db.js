const fs = require("fs");
const path = require("path");
const { DatabaseSync } = require("node:sqlite");

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "..", "..", "data");
const UPLOAD_DIR = path.join(DATA_DIR, "uploads");
const DB_PATH = path.join(DATA_DIR, "masoudieh.db");

function ensureDirs() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

function openDb() {
  ensureDirs();
  const db = new DatabaseSync(DB_PATH);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );
    CREATE TABLE IF NOT EXISTS media (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      filename TEXT NOT NULL,
      original_name TEXT,
      alt TEXT DEFAULT '',
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS pages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      subtitle TEXT DEFAULT '',
      excerpt TEXT DEFAULT '',
      hero_media_id INTEGER,
      is_home INTEGER DEFAULT 0,
      show_in_nav INTEGER DEFAULT 1,
      nav_label TEXT DEFAULT '',
      nav_sublabel TEXT DEFAULT '',
      nav_order INTEGER DEFAULT 0,
      published INTEGER DEFAULT 1,
      template TEXT DEFAULT 'page',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS blocks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      page_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      data_json TEXT DEFAULT '{}',
      sort_order INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      email TEXT,
      topic TEXT,
      body TEXT,
      created_at TEXT NOT NULL,
      is_read INTEGER DEFAULT 0
    );
  `);
  return db;
}

function getSettingsMap(db) {
  const rows = db.prepare("SELECT key, value FROM settings").all();
  const map = {};
  for (const row of rows) map[row.key] = row.value;
  return map;
}

function setSetting(db, key, value) {
  db.prepare(
    "INSERT INTO settings(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value"
  ).run(key, value == null ? "" : String(value));
}

function mediaById(db, id) {
  if (!id) return null;
  return db.prepare("SELECT * FROM media WHERE id=?").get(Number(id)) || null;
}

function mediaUrl(item) {
  if (!item) return "";
  return "/uploads/" + item.filename;
}

module.exports = {
  DATA_DIR,
  UPLOAD_DIR,
  DB_PATH,
  ensureDirs,
  openDb,
  getSettingsMap,
  setSetting,
  mediaById,
  mediaUrl
};
