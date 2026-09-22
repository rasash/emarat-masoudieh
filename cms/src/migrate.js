const bcrypt = require("bcryptjs");
const fs = require("fs");
const path = require("path");
const { setSetting, getSettingsMap, UPLOAD_DIR } = require("./db");
const { processImageFile } = require("./images");

function hasColumn(db, table, col) {
  return db.prepare(`PRAGMA table_info(${table})`).all().some((row) => row.name === col);
}

function now() {
  return new Date().toISOString();
}

function mid(db, filename) {
  const row = db.prepare("SELECT id FROM media WHERE filename=?").get(filename);
  return row ? row.id : null;
}

async function migrate(db) {
  if (!hasColumn(db, "media", "variants")) {
    db.exec("ALTER TABLE media ADD COLUMN variants TEXT DEFAULT '{}'");
  }
  if (!hasColumn(db, "media", "category")) {
    db.exec("ALTER TABLE media ADD COLUMN category TEXT DEFAULT ''");
  }
  if (!hasColumn(db, "pages", "seo_description")) {
    db.exec("ALTER TABLE pages ADD COLUMN seo_description TEXT DEFAULT ''");
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      pass_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'editor',
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS news (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      date TEXT DEFAULT '',
      category TEXT DEFAULT 'رویداد',
      excerpt TEXT DEFAULT '',
      body TEXT DEFAULT '',
      media_id INTEGER,
      published INTEGER DEFAULT 1,
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS spaces (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      body TEXT DEFAULT '',
      media_id INTEGER,
      x REAL DEFAULT 50,
      y REAL DEFAULT 50,
      sort_order INTEGER DEFAULT 0
    );
  `);

  const s = getSettingsMap(db);
  const userCount = db.prepare("SELECT COUNT(*) AS c FROM users").get().c;
  if (userCount === 0) {
    const username = s.admin_user || process.env.ADMIN_USER || "admin";
    const hash = s.admin_pass_hash || bcrypt.hashSync(process.env.ADMIN_PASSWORD || "Masoudieh@1405", 10);
    db.prepare("INSERT INTO users(username, pass_hash, role, created_at) VALUES(?,?,?,?)")
      .run(username, hash, "admin", now());
  }

  const visitKeys = {
    visit_hours: "۹ تا ۱۶",
    visit_days: "همه روزه به‌جز دوشنبه‌ها",
    ticket_info: "ورود با تهیه بلیت از دبیرخانه مجموعه",
    metro_info: "نزدیک‌ترین ایستگاه‌ها: ملت و بهارستان. ورودی در خیابان اکباتان."
  };
  for (const [k, v] of Object.entries(visitKeys)) {
    if (!s[k]) setSetting(db, k, v);
  }

  if (db.prepare("SELECT COUNT(*) AS c FROM news").get().c === 0) {
    const items = [
      ["shab-orsi", "تور روایی «شب ارسی‌ها» در دیوان‌خانه", "۱۵ شهریور ۱۴۰۵", "بازدید", "بازدید شبانگاهی با روایت معماری قاجار و گفت‌وگو با مرمت‌گران.", "interior.jpg"],
      ["stucco-doc", "آغاز فاز مستندنگاری گچ‌بری‌های فرشته", "۲ شهریور ۱۴۰۵", "مرمت", "تیم حفاظت تزئینات نفیس دیوارها را عکس‌برداری و طبقه‌بندی می‌کند.", "stucco.jpg"],
      ["photo-garden", "عکس‌خانه بهارستان؛ نمایش آثار تاریخی باغ", "۲۰ مرداد ۱۴۰۵", "نمایشگاه", "نمایشگاه عکس در سفره‌خانه با تمرکز بر حیاط‌ها و حوض.", "garden.jpg"],
      ["workshop-kids", "کارگاه دانش‌آموزی «معماری را لمس کن»", "۵ مرداد ۱۴۰۵", "آموزش", "دانش‌آموزان با نقشه حیاط‌ها، کاشی و ارسی آشنا می‌شوند.", "windows.jpg"]
    ];
    const ins = db.prepare(
      "INSERT INTO news(slug, title, date, category, excerpt, body, media_id, published, created_at) VALUES(?,?,?,?,?,?,?,?,?)"
    );
    for (const item of items) {
      ins.run(item[0], item[1], item[2], item[3], item[4], item[4], mid(db, item[5]), 1, now());
    }
  }

  if (db.prepare("SELECT COUNT(*) AS c FROM spaces").get().c === 0) {
    const spaces = [
      ["divan", "دیوان‌خانه", "قلب تشریفاتی مجموعه و محل پذیرایی رسمی.", "hall.jpg", 52, 38],
      ["sofreh", "سفره‌خانه", "تالار مهمانی‌های بزرگ در جنوب مجموعه.", "arcade.jpg", 48, 72],
      ["howz", "حوض‌خانه", "انعکاس طاق و شیشه رنگی در آب حوض.", "windows.jpg", 28, 78],
      ["moshiri", "عمارت مشیری", "اقامتگاه مباشران ظل‌السلطان.", "portal.jpg", 78, 42],
      ["sardar", "سردر و کتیبه‌ها", "هفت کتیبه ارزشمند هویت نوشتاری مجموعه.", "stucco.jpg", 50, 12],
      ["javadi", "عمارت سید جوادی", "یادمان قدردانی از حکیم شکارگاه.", "garden.jpg", 22, 36]
    ];
    const ins = db.prepare(
      "INSERT INTO spaces(slug, title, body, media_id, x, y, sort_order) VALUES(?,?,?,?,?,?,?)"
    );
    spaces.forEach((sp, i) => ins.run(sp[0], sp[1], sp[2], mid(db, sp[3]), sp[4], sp[5], i));
  }

  db.prepare("UPDATE pages SET template='news' WHERE slug='news' AND template='page'").run();
  db.prepare("UPDATE pages SET seo_description=? WHERE slug='home' AND (seo_description IS NULL OR seo_description='')")
    .run("عمارت مسعودیه در میدان بهارستان تهران؛ باغ‌عمارت قاجاری ظل‌السلطان برای بازدید، تاریخ، رویداد و پژوهش.");

  const visit = db.prepare("SELECT id FROM pages WHERE slug='visit'").get();
  if (!visit) {
    const ts = now();
    db.prepare(`INSERT INTO pages(slug, title, subtitle, excerpt, hero_media_id, is_home, show_in_nav,
      nav_label, nav_sublabel, nav_order, published, template, seo_description, created_at, updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      "visit",
      "بازدید از عمارت",
      "ساعت، مسیر و نقشه فضاها",
      "ساعات بازدید، مسیر مترو و گردش در حیاط‌ها و عمارت‌های مسعودیه.",
      mid(db, "courtyard.jpg"),
      0, 0, "بازدید", "ساعت و مسیر", 7, 1, "visit",
      "ساعات بازدید عمارت مسعودیه، بلیت، مسیر مترو ملت و بهارستان و نقشه فضاهای مجموعه.",
      ts, ts
    );
  }

  const cats = {
    "hero.jpg": "نما",
    "facade.jpg": "نما",
    "courtyard.jpg": "حیاط",
    "garden.jpg": "حیاط",
    "complex.jpg": "نما",
    "interior.jpg": "فضای داخلی",
    "hall.jpg": "فضای داخلی",
    "stucco.jpg": "تزئینات",
    "tiles.jpg": "تزئینات",
    "ornament.jpg": "تزئینات",
    "windows.jpg": "فضای داخلی",
    "arcade.jpg": "فضای داخلی",
    "portal.jpg": "نما",
    "detail.jpg": "تزئینات"
  };
  const upd = db.prepare("UPDATE media SET category=? WHERE filename=? AND (category IS NULL OR category='')");
  for (const [file, cat] of Object.entries(cats)) upd.run(cat, file);
}

async function processMissingVariants(db) {
  const rows = db.prepare("SELECT * FROM media").all();
  const upd = db.prepare("UPDATE media SET variants=? WHERE id=?");
  for (const row of rows) {
    let v = {};
    try { v = JSON.parse(row.variants || "{}"); } catch (_e) { v = {}; }
    if (v.webp && Object.keys(v.webp).length) continue;
    const abs = path.join(UPLOAD_DIR, row.filename);
    if (!fs.existsSync(abs)) continue;
    const variants = await processImageFile(abs, row.filename);
    upd.run(JSON.stringify(variants), row.id);
  }
}

module.exports = { migrate, processMissingVariants };
