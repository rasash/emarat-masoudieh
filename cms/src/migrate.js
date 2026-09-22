const bcrypt = require("bcryptjs");
const fs = require("fs");
const path = require("path");
const { setSetting, getSettingsMap, UPLOAD_DIR } = require("./db");
const { processImageFile, cropCourtyardRegion } = require("./images");

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
      era TEXT DEFAULT '',
      role TEXT DEFAULT '',
      media_id INTEGER,
      x REAL DEFAULT 50,
      y REAL DEFAULT 50,
      sort_order INTEGER DEFAULT 0
    );
  `);

  if (!hasColumn(db, "spaces", "era")) db.exec("ALTER TABLE spaces ADD COLUMN era TEXT DEFAULT ''");
  if (!hasColumn(db, "spaces", "role")) db.exec("ALTER TABLE spaces ADD COLUMN role TEXT DEFAULT ''");

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

  const spaceCatalog = [
    {
      slug: "divan", title: "دیوان‌خانه", era: "۱۲۹۵ قمری", role: "بارعام و تشریفات",
      file: "hall.jpg", crop: { x: 0.30, y: 0.04, w: 0.40, h: 0.58 }, x: 50, y: 47,
      body: "عمارت روبه‌روی حوض، قلب رسمی مسعودیه است؛ جایی که ظل‌السلطان مهمانان ویژه را می‌پذیرفت.\n\nدو طبقه با ارسی‌های بلند، پیشانی کاشی‌کاری‌شده و سه طاق ورودی، الگوی دیوان‌خانه‌های قاجاری را نشان می‌دهد. در تالارهای داخلی هنوز آینه‌کاری و گچ‌بری ناصری خوانده می‌شود."
    },
    {
      slug: "sofreh", title: "سفره‌خانه", era: "دوره ناصری", role: "ضیافت و پذیرایی",
      file: "arcade.jpg", crop: { x: 0.68, y: 0.16, w: 0.32, h: 0.64 }, x: 88, y: 44,
      body: "جناح ستون‌دار سمت راست این حیاط به فضاهای ضیافت مجموعه پیوسته است، نه میانه‌ی سنگفرش.\n\nسفره‌خانه مسعودیه تالار مهمانی‌های بزرگ بود؛ رواق، ستون و پیوند با آبدارخانه، شکوه سفرهٔ شاهزادگی را می‌ساخت."
    },
    {
      slug: "howz", title: "حوض حیاط", era: "باغ ایرانی", role: "آب‌نما و محور دید",
      file: "courtyard.jpg", crop: { x: 0.22, y: 0.36, w: 0.56, h: 0.40 }, x: 50, y: 58,
      body: "حوض دایره‌ای میان سنگفرش، محور نگاه به دیوان‌خانه را می‌سازد.\n\nنور آسمان و طاق‌ها در آب تکرار می‌شوند. حوض‌خانه در جنوب مجموعه همین نقش آب و انعکاس را در کالبد معماری ادامه می‌دهد."
    },
    {
      slug: "moshiri", title: "عمارت مشیری", era: "وابسته به دیوان", role: "اقامت مباشران",
      file: "portal.jpg", crop: { x: 0.14, y: 0.16, w: 0.28, h: 0.56 }, x: 28, y: 42,
      body: "جناح غربی عمارت اصلی، مقیاسی انسانی‌تر در کنار شکوه تالار رسمی دارد.\n\nعمارت مشیری اقامتگاه مباشران ظل‌السلطان بود؛ نمونه‌ای از خانه‌های اعیانی که به دیوان‌خانه تکیه می‌کنند."
    },
    {
      slug: "sardar", title: "کتیبه‌ها و پیشانی", era: "هویت نوشتاری", role: "کاشی و کتیبه",
      file: "stucco.jpg", crop: { x: 0.34, y: 0.0, w: 0.32, h: 0.36 }, x: 50, y: 30,
      body: "پیشانی فیروزه‌ای دیوان‌خانه بخشی از زبان تزئینی مسعودیه است.\n\nهفت کتیبه در سردر ورودی، دیوان‌خانه و عمارت مشیرالدوله نام و تاریخ مجموعه را بر کاشی و گچ ثبت کرده‌اند."
    },
    {
      slug: "javadi", title: "عمارت سید جوادی", era: "روایت ظل‌السلطان", role: "یادمان قدردانی",
      file: "garden.jpg", crop: { x: 0.0, y: 0.18, w: 0.24, h: 0.58 }, x: 12, y: 48,
      body: "بنای کوچک‌تر گوشهٔ چپ حیاط، یادآور عمارت سید جوادی است.\n\nروایت می‌کنند شاهزاده این گوشه را برای قدردانی از حکیمی ساخت که جان او را در شکارگاه نجات داد."
    }
  ];

  for (const sp of spaceCatalog) {
    if (!sp.crop) continue;
    const cropName = `space-${sp.slug}.jpg`;
    try {
      const made = await cropCourtyardRegion(cropName, sp.crop);
      if (!made) continue;
      const abs = path.join(UPLOAD_DIR, cropName);
      const variants = await processImageFile(abs, cropName);
      const existing = db.prepare("SELECT id FROM media WHERE filename=?").get(cropName);
      if (existing) {
        db.prepare("UPDATE media SET variants=?, alt=? WHERE id=?").run(JSON.stringify(variants), sp.title, existing.id);
      } else {
        db.prepare(
          "INSERT INTO media(filename, original_name, alt, category, variants, created_at) VALUES(?,?,?,?,?,?)"
        ).run(cropName, cropName, sp.title, "حیاط", JSON.stringify(variants), now());
      }
      sp.file = cropName;
    } catch (_e) {
      /* keep fallback file */
    }
  }

  if (db.prepare("SELECT COUNT(*) AS c FROM spaces").get().c === 0) {
    const ins = db.prepare(
      "INSERT INTO spaces(slug, title, body, era, role, media_id, x, y, sort_order) VALUES(?,?,?,?,?,?,?,?,?)"
    );
    spaceCatalog.forEach((sp, i) => {
      ins.run(sp.slug, sp.title, sp.body, sp.era, sp.role, mid(db, sp.file), sp.x, sp.y, i);
    });
  } else {
    const upd = db.prepare("UPDATE spaces SET title=?, body=?, era=?, role=?, x=?, y=?, media_id=? WHERE slug=?");
    for (const sp of spaceCatalog) {
      upd.run(sp.title, sp.body, sp.era, sp.role, sp.x, sp.y, mid(db, sp.file), sp.slug);
    }
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
