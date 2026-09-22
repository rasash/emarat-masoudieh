const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const express = require("express");
const session = require("express-session");
const multer = require("multer");
const bcrypt = require("bcryptjs");
const { openDb, getSettingsMap, setSetting, mediaById, mediaUrl, UPLOAD_DIR } = require("./db");
const { seed } = require("./seed");
const { migrate, processMissingVariants } = require("./migrate");
const { processImageFile, picture, mediaSrc, parseVariants } = require("./images");
const { SqliteSessionStore } = require("./session-store");

const PORT = Number(process.env.PORT || 80);
const SEED_DIR = process.env.SEED_IMAGES_DIR || path.join(__dirname, "..", "seed-images");
const DEFAULT_PASSWORD = "Masoudieh@1405";
const db = openDb();
seed(db, SEED_DIR);

const app = express();
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "..", "views"));
app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use(express.urlencoded({ extended: true, limit: "8mb" }));
app.use(express.json({ limit: "8mb" }));
app.use(
  session({
    store: new SqliteSessionStore(db),
    secret: process.env.SESSION_SECRET || "masoudieh-secret-change-me",
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 1000 * 60 * 60 * 12,
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.COOKIE_SECURE === "1"
    }
  })
);
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("X-XSS-Protection", "0");
  next();
});
app.use("/uploads", express.static(UPLOAD_DIR, { maxAge: "7d", immutable: false }));
app.use("/css", express.static(path.join(__dirname, "..", "public", "css"), { maxAge: "7d" }));
app.use("/js", express.static(path.join(__dirname, "..", "public", "js"), { maxAge: "7d" }));
app.use("/fonts", express.static(path.join(__dirname, "..", "public", "fonts"), { maxAge: "30d" }));
app.use(express.static(path.join(__dirname, "..", "public")));

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname || "").toLowerCase();
      const safe = [".jpg", ".jpeg", ".png", ".webp", ".gif"].includes(ext) ? ext : ".jpg";
      cb(null, Date.now() + "-" + crypto.randomBytes(4).toString("hex") + safe);
    }
  }),
  limits: { fileSize: 12 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    cb(null, /^image\/(jpeg|png|webp|gif)$/.test(file.mimetype));
  }
});

const rateBuckets = new Map();
function rateOk(key, max, windowMs) {
  const now = Date.now();
  const arr = (rateBuckets.get(key) || []).filter((t) => now - t < windowMs);
  if (arr.length >= max) {
    rateBuckets.set(key, arr);
    return false;
  }
  arr.push(now);
  rateBuckets.set(key, arr);
  return true;
}

function clientIp(req) {
  return String(req.headers["x-forwarded-for"] || req.ip || "").split(",")[0].trim() || "unknown";
}

function settings() {
  return getSettingsMap(db);
}

function navPages() {
  return db.prepare(
    "SELECT slug, nav_label, nav_sublabel, title FROM pages WHERE published=1 AND show_in_nav=1 ORDER BY nav_order, id"
  ).all();
}

function parseBlocks(rows) {
  return rows.map((row) => ({
    id: row.id,
    type: row.type,
    data: JSON.parse(row.data_json || "{}")
  }));
}

function loadPageBySlug(slug, onlyPublished = true) {
  const page = db.prepare(
    onlyPublished
      ? "SELECT * FROM pages WHERE slug=? AND published=1"
      : "SELECT * FROM pages WHERE slug=?"
  ).get(slug);
  if (!page) return null;
  page.hero = mediaById(db, page.hero_media_id);
  page.blocks = parseBlocks(
    db.prepare("SELECT * FROM blocks WHERE page_id=? ORDER BY sort_order, id").all(page.id)
  );
  return page;
}

function withMedia(data) {
  const out = { ...data };
  if (data.media_id) out.media = mediaById(db, data.media_id);
  if (Array.isArray(data.items)) {
    out.items = data.items.map((item) => ({
      ...item,
      media: item.media_id ? mediaById(db, item.media_id) : null
    }));
  }
  if (Array.isArray(data.facts)) out.facts = data.facts;
  return out;
}

function loadSpaces() {
  return db.prepare("SELECT * FROM spaces ORDER BY sort_order, id").all().map((sp) => ({
    ...sp,
    media: mediaById(db, sp.media_id)
  }));
}

function loadNews(onlyPublished = true) {
  const sql = onlyPublished
    ? "SELECT * FROM news WHERE published=1 ORDER BY id DESC"
    : "SELECT * FROM news ORDER BY id DESC";
  return db.prepare(sql).all().map((item) => ({
    ...item,
    media: mediaById(db, item.media_id)
  }));
}

function absoluteUrl(req, pathname) {
  const base = process.env.SITE_URL || `${req.protocol}://${req.get("host")}`;
  return String(base).replace(/\/$/, "") + pathname;
}

function isDefaultPassword() {
  const s = settings();
  if (!s.admin_pass_hash) return true;
  try {
    return bcrypt.compareSync(DEFAULT_PASSWORD, s.admin_pass_hash);
  } catch (_e) {
    return false;
  }
}

function currentUser(req) {
  return req.session.user || (req.session.admin ? { username: "admin", role: "admin" } : null);
}

async function saveUploadedFile(file, alt, category) {
  const variants = await processImageFile(path.join(UPLOAD_DIR, file.filename), file.filename);
  const info = db.prepare(
    "INSERT INTO media(filename, original_name, alt, category, variants, created_at) VALUES(?,?,?,?,?,?)"
  ).run(
    file.filename,
    file.originalname || file.filename,
    alt || "",
    category || "",
    JSON.stringify(variants),
    new Date().toISOString()
  );
  return Number(info.lastInsertRowid);
}

app.use((req, res, next) => {
  res.locals.settings = settings();
  res.locals.nav = navPages();
  res.locals.mediaUrl = mediaUrl;
  res.locals.mediaSrc = mediaSrc;
  res.locals.picture = picture;
  res.locals.withMedia = withMedia;
  res.locals.admin = !!req.session.admin;
  res.locals.user = currentUser(req);
  res.locals.currentPath = req.path;
  res.locals.ogUrl = absoluteUrl(req, req.originalUrl.split("?")[0]);
  res.locals.siteOrigin = absoluteUrl(req, "");
  res.locals.assetV = "20260922c";
  next();
});

function requireAdmin(req, res, next) {
  if (!req.session.admin) return res.redirect("/admin/login");
  next();
}

function requireRole(role) {
  return (req, res, next) => {
    const u = currentUser(req);
    if (!u) return res.redirect("/admin/login");
    if (role === "admin" && u.role !== "admin") {
      return res.status(403).render("admin/forbidden");
    }
    next();
  };
}

function courtyardMedia() {
  return db.prepare("SELECT * FROM media WHERE filename LIKE '%courtyard%' ORDER BY id LIMIT 1").get()
    || db.prepare("SELECT * FROM media ORDER BY id LIMIT 1").get();
}

function pageLocals(req, page) {
  return {
    page,
    querySent: req.query.sent === "1",
    spaces: loadSpaces(),
    newsItems: loadNews(true),
    mapMedia: courtyardMedia(),
    preview: req.query.preview === "1"
  };
}

app.get("/", (req, res) => {
  const home = db.prepare("SELECT slug FROM pages WHERE is_home=1 AND published=1 LIMIT 1").get();
  const page = loadPageBySlug(home ? home.slug : "home");
  if (!page) return res.status(404).render("public/notfound");
  res.render("public/page", pageLocals(req, page));
});

app.get("/p/:slug", (req, res) => {
  const preview = req.query.preview === "1" && req.session.admin;
  const page = loadPageBySlug(req.params.slug, !preview);
  if (!page) return res.status(404).render("public/notfound");
  res.render("public/page", pageLocals(req, page));
});

app.get("/news/:slug", (req, res) => {
  const item = db.prepare("SELECT * FROM news WHERE slug=? AND published=1").get(req.params.slug);
  if (!item) return res.status(404).render("public/notfound");
  item.media = mediaById(db, item.media_id);
  const page = {
    slug: "news",
    title: item.title,
    subtitle: item.category || "اتاق رسانه",
    excerpt: item.excerpt,
    hero: item.media,
    is_home: 0,
    template: "news-item",
    seo_description: item.excerpt || item.title,
    blocks: []
  };
  res.render("public/news-item", { page, item, querySent: false, spaces: [], newsItems: loadNews(true) });
});

app.post("/p/:slug/message", (req, res) => {
  const page = loadPageBySlug(req.params.slug);
  if (!page || page.template !== "contact") return res.redirect("/");
  if (req.body.website) return res.redirect("/p/" + page.slug + "?sent=1");
  if (!rateOk("msg:" + clientIp(req), 5, 10 * 60 * 1000)) {
    return res.status(429).render("public/notfound", { extra: "لطفاً کمی بعد دوباره تلاش کنید." });
  }
  db.prepare(
    "INSERT INTO messages(name, email, topic, body, created_at) VALUES(?,?,?,?,?)"
  ).run(req.body.name || "", req.body.email || "", req.body.topic || "", req.body.msg || "", new Date().toISOString());
  res.redirect("/p/" + page.slug + "?sent=1");
});

app.get("/sitemap.xml", (req, res) => {
  const origin = absoluteUrl(req, "");
  const pages = db.prepare("SELECT slug, is_home, updated_at FROM pages WHERE published=1").all();
  const news = db.prepare("SELECT slug FROM news WHERE published=1").all();
  const urls = pages.map((p) => {
    const loc = p.is_home ? origin + "/" : origin + "/p/" + p.slug;
    return `<url><loc>${loc}</loc><lastmod>${(p.updated_at || "").slice(0, 10)}</lastmod></url>`;
  });
  news.forEach((n) => urls.push(`<url><loc>${origin}/news/${n.slug}</loc></url>`));
  res.type("application/xml").send(
    `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.join("")}</urlset>`
  );
});

app.get("/robots.txt", (req, res) => {
  res.type("text/plain").send(`User-agent: *\nAllow: /\nSitemap: ${absoluteUrl(req, "/sitemap.xml")}\n`);
});

app.get("/admin/login", (req, res) => {
  if (req.session.admin) return res.redirect("/admin");
  res.render("admin/login", { error: null, layout: false });
});

app.post("/admin/login", (req, res) => {
  if (!rateOk("login:" + clientIp(req), 8, 10 * 60 * 1000)) {
    return res.status(429).render("admin/login", { error: "تلاش‌های ورود زیاد است. کمی بعد دوباره بیایید." });
  }
  const s = settings();
  const user = (req.body.username || "").trim();
  const pass = req.body.password || "";
  const row = db.prepare("SELECT * FROM users WHERE username=?").get(user);
  let ok = false;
  let sessionUser = null;
  if (row && bcrypt.compareSync(pass, row.pass_hash)) {
    ok = true;
    sessionUser = { id: row.id, username: row.username, role: row.role };
  } else {
    const okUser = user === (s.admin_user || "admin");
    const okPass = s.admin_pass_hash && bcrypt.compareSync(pass, s.admin_pass_hash);
    if (okUser && okPass) {
      ok = true;
      sessionUser = { username: s.admin_user || "admin", role: "admin" };
    }
  }
  if (!ok) {
    return res.status(401).render("admin/login", { error: "نام کاربری یا رمز عبور نادرست است." });
  }
  req.session.admin = true;
  req.session.user = sessionUser;
  res.redirect("/admin");
});

app.post("/admin/logout", requireAdmin, (req, res) => {
  req.session.destroy(() => res.redirect("/admin/login"));
});

app.get("/admin", requireAdmin, (_req, res) => {
  const pages = db.prepare("SELECT COUNT(*) AS c FROM pages").get().c;
  const media = db.prepare("SELECT COUNT(*) AS c FROM media").get().c;
  const unread = db.prepare("SELECT COUNT(*) AS c FROM messages WHERE is_read=0").get().c;
  const news = db.prepare("SELECT COUNT(*) AS c FROM news").get().c;
  res.render("admin/dashboard", {
    pages,
    media,
    unread,
    news,
    weakPassword: isDefaultPassword()
  });
});

app.get("/admin/pages", requireAdmin, (_req, res) => {
  const pages = db.prepare("SELECT * FROM pages ORDER BY is_home DESC, nav_order, id").all();
  res.render("admin/pages", { pages });
});

app.get("/admin/pages/new", requireAdmin, (_req, res) => {
  res.render("admin/page-edit", { page: null, blocks: [], saved: false });
});

app.get("/admin/pages/:id", requireAdmin, (req, res) => {
  const page = db.prepare("SELECT * FROM pages WHERE id=?").get(req.params.id);
  if (!page) return res.redirect("/admin/pages");
  page.hero = mediaById(db, page.hero_media_id);
  const blocks = parseBlocks(
    db.prepare("SELECT * FROM blocks WHERE page_id=? ORDER BY sort_order, id").all(page.id)
  );
  res.render("admin/page-edit", { page, blocks, saved: req.query.saved === "1" });
});

function savePage(req, id) {
  const slug = String(req.body.slug || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "page-" + Date.now();
  const ts = new Date().toISOString();
  const allowedTpl = new Set(["page", "home", "contact", "news", "visit"]);
  const payload = {
    slug,
    title: req.body.title || "بدون عنوان",
    subtitle: req.body.subtitle || "",
    excerpt: req.body.excerpt || "",
    hero_media_id: req.body.hero_media_id ? Number(req.body.hero_media_id) : null,
    is_home: req.body.is_home ? 1 : 0,
    show_in_nav: req.body.show_in_nav ? 1 : 0,
    nav_label: req.body.nav_label || req.body.title || "",
    nav_sublabel: req.body.nav_sublabel || "",
    nav_order: Number(req.body.nav_order || 0),
    published: req.body.published ? 1 : 0,
    template: allowedTpl.has(req.body.template) ? req.body.template : "page",
    seo_description: req.body.seo_description || "",
    updated_at: ts
  };
  if (payload.is_home) db.prepare("UPDATE pages SET is_home=0").run();
  let pageId = id;
  if (id) {
    db.prepare(`UPDATE pages SET slug=?, title=?, subtitle=?, excerpt=?,
      hero_media_id=?, is_home=?, show_in_nav=?, nav_label=?,
      nav_sublabel=?, nav_order=?, published=?, template=?, seo_description=?, updated_at=?
      WHERE id=?`).run(
      payload.slug, payload.title, payload.subtitle, payload.excerpt,
      payload.hero_media_id, payload.is_home, payload.show_in_nav, payload.nav_label,
      payload.nav_sublabel, payload.nav_order, payload.published, payload.template,
      payload.seo_description, payload.updated_at, id
    );
  } else {
    const info = db.prepare(`INSERT INTO pages(slug, title, subtitle, excerpt, hero_media_id, is_home, show_in_nav,
      nav_label, nav_sublabel, nav_order, published, template, seo_description, created_at, updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      payload.slug, payload.title, payload.subtitle, payload.excerpt, payload.hero_media_id, payload.is_home,
      payload.show_in_nav, payload.nav_label, payload.nav_sublabel, payload.nav_order, payload.published,
      payload.template, payload.seo_description, ts, ts
    );
    pageId = Number(info.lastInsertRowid);
  }
  db.prepare("DELETE FROM blocks WHERE page_id=?").run(pageId);
  let blocks = [];
  try {
    blocks = JSON.parse(req.body.blocks_json || "[]");
  } catch (_e) {
    blocks = [];
  }
  const add = db.prepare("INSERT INTO blocks(page_id, type, data_json, sort_order) VALUES(?,?,?,?)");
  const allowed = new Set(["split", "rich", "gallery", "cards", "timeline", "news"]);
  blocks.forEach((block, i) => {
    if (!allowed.has(block.type)) return;
    add.run(pageId, block.type, JSON.stringify(block.data || {}), i);
  });
  return pageId;
}

app.post("/admin/pages/new", requireAdmin, (req, res) => {
  const id = savePage(req, null);
  res.redirect("/admin/pages/" + id + "?saved=1");
});

app.post("/admin/pages/:id", requireAdmin, (req, res) => {
  savePage(req, Number(req.params.id));
  res.redirect("/admin/pages/" + req.params.id + "?saved=1");
});

app.post("/admin/pages/:id/delete", requireAdmin, (req, res) => {
  const page = db.prepare("SELECT * FROM pages WHERE id=?").get(req.params.id);
  if (page && !page.is_home) {
    db.prepare("DELETE FROM blocks WHERE page_id=?").run(page.id);
    db.prepare("DELETE FROM pages WHERE id=?").run(page.id);
  }
  res.redirect("/admin/pages");
});

app.post("/admin/preview", requireAdmin, (req, res) => {
  let blocks = [];
  try { blocks = JSON.parse(req.body.blocks_json || "[]"); } catch (_e) { blocks = []; }
  const page = {
    slug: req.body.slug || "preview",
    title: req.body.title || "پیش‌نمایش",
    subtitle: req.body.subtitle || "",
    excerpt: req.body.excerpt || "",
    hero: mediaById(db, req.body.hero_media_id),
    hero_media_id: req.body.hero_media_id || null,
    is_home: req.body.template === "home" ? 1 : 0,
    template: req.body.template || "page",
    seo_description: req.body.seo_description || "",
    published: 0,
    blocks: blocks.map((b, i) => ({ id: i, type: b.type, data: b.data || {} }))
  };
  res.render("public/page", {
    page,
    querySent: false,
    spaces: loadSpaces(),
    newsItems: loadNews(true),
    mapMedia: courtyardMedia(),
    preview: true
  });
});

app.get("/admin/media", requireAdmin, (_req, res) => {
  const items = db.prepare("SELECT * FROM media ORDER BY id DESC").all();
  res.render("admin/media", { items });
});

app.post("/admin/media", requireAdmin, upload.array("files", 20), async (req, res) => {
  for (const file of req.files || []) {
    await saveUploadedFile(file, req.body.alt || "", req.body.category || "");
  }
  res.redirect("/admin/media");
});

app.post("/admin/media/:id", requireAdmin, (req, res) => {
  db.prepare("UPDATE media SET alt=?, category=? WHERE id=?").run(
    req.body.alt || "",
    req.body.category || "",
    req.params.id
  );
  res.redirect("/admin/media");
});

app.post("/admin/media/:id/replace", requireAdmin, upload.single("file"), async (req, res) => {
  const item = db.prepare("SELECT * FROM media WHERE id=?").get(req.params.id);
  if (!item || !req.file) return res.redirect("/admin/media");
  const variants = await processImageFile(path.join(UPLOAD_DIR, req.file.filename), req.file.filename);
  db.prepare("UPDATE media SET filename=?, original_name=?, variants=? WHERE id=?").run(
    req.file.filename,
    req.file.originalname || req.file.filename,
    JSON.stringify(variants),
    item.id
  );
  res.redirect("/admin/media");
});

app.post("/admin/media/:id/delete", requireAdmin, (req, res) => {
  const item = db.prepare("SELECT * FROM media WHERE id=?").get(req.params.id);
  if (item) {
    db.prepare("DELETE FROM media WHERE id=?").run(item.id);
    const v = parseVariants(item);
    const names = [item.filename, v.jpg, ...Object.values(v.webp || {})].filter(Boolean);
    for (const name of names) {
      const file = path.join(UPLOAD_DIR, name);
      if (fs.existsSync(file)) fs.unlinkSync(file);
    }
  }
  res.redirect("/admin/media");
});

app.get("/admin/api/media", requireAdmin, (_req, res) => {
  const items = db.prepare("SELECT * FROM media ORDER BY id DESC").all().map((m) => ({
    id: m.id,
    url: mediaSrc(m),
    alt: m.alt,
    name: m.original_name,
    category: m.category || ""
  }));
  res.json(items);
});

app.post("/admin/api/upload", requireAdmin, upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "فایل نامعتبر است" });
  const id = await saveUploadedFile(req.file, req.body.alt || "", req.body.category || "");
  const item = db.prepare("SELECT * FROM media WHERE id=?").get(id);
  res.json({ id, url: mediaSrc(item) || "/uploads/" + req.file.filename });
});

app.get("/admin/news", requireAdmin, (_req, res) => {
  res.render("admin/news", { items: loadNews(false) });
});

app.get("/admin/news/new", requireAdmin, (_req, res) => {
  res.render("admin/news-edit", { item: null });
});

app.get("/admin/news/:id", requireAdmin, (req, res) => {
  const item = db.prepare("SELECT * FROM news WHERE id=?").get(req.params.id);
  if (!item) return res.redirect("/admin/news");
  item.media = mediaById(db, item.media_id);
  res.render("admin/news-edit", { item });
});

function newsSlug(raw, fallback) {
  const s = String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return s || fallback;
}

app.post("/admin/news/new", requireAdmin, (req, res) => {
  const slug = newsSlug(req.body.slug, "n-" + Date.now());
  db.prepare(
    "INSERT INTO news(slug, title, date, category, excerpt, body, media_id, published, created_at) VALUES(?,?,?,?,?,?,?,?,?)"
  ).run(
    slug,
    req.body.title || "بدون عنوان",
    req.body.date || "",
    req.body.category || "رویداد",
    req.body.excerpt || "",
    req.body.body || "",
    req.body.media_id ? Number(req.body.media_id) : null,
    req.body.published ? 1 : 0,
    new Date().toISOString()
  );
  res.redirect("/admin/news");
});

app.post("/admin/news/:id", requireAdmin, (req, res) => {
  const slug = newsSlug(req.body.slug, "n-" + req.params.id);
  db.prepare(
    "UPDATE news SET slug=?, title=?, date=?, category=?, excerpt=?, body=?, media_id=?, published=? WHERE id=?"
  ).run(
    slug,
    req.body.title || "بدون عنوان",
    req.body.date || "",
    req.body.category || "رویداد",
    req.body.excerpt || "",
    req.body.body || "",
    req.body.media_id ? Number(req.body.media_id) : null,
    req.body.published ? 1 : 0,
    req.params.id
  );
  res.redirect("/admin/news");
});

app.post("/admin/news/:id/delete", requireAdmin, (req, res) => {
  db.prepare("DELETE FROM news WHERE id=?").run(req.params.id);
  res.redirect("/admin/news");
});

app.get("/admin/spaces", requireAdmin, (_req, res) => {
  res.render("admin/spaces", { items: loadSpaces() });
});

app.post("/admin/spaces/:id", requireAdmin, (req, res) => {
  db.prepare("UPDATE spaces SET title=?, body=?, era=?, role=?, media_id=?, x=?, y=? WHERE id=?").run(
    req.body.title || "",
    req.body.body || "",
    req.body.era || "",
    req.body.role || "",
    req.body.media_id ? Number(req.body.media_id) : null,
    Number(req.body.x || 50),
    Number(req.body.y || 50),
    req.params.id
  );
  res.redirect("/admin/spaces");
});

app.get("/admin/users", requireAdmin, requireRole("admin"), (_req, res) => {
  const items = db.prepare("SELECT id, username, role, created_at FROM users ORDER BY id").all();
  res.render("admin/users", { items, error: null });
});

app.post("/admin/users", requireAdmin, requireRole("admin"), (req, res) => {
  const username = (req.body.username || "").trim();
  const pass = req.body.password || "";
  const role = req.body.role === "editor" ? "editor" : "admin";
  if (!username || pass.length < 8) {
    const items = db.prepare("SELECT id, username, role, created_at FROM users ORDER BY id").all();
    return res.status(400).render("admin/users", { items, error: "نام کاربری و رمز حداقل ۸ کاراکتر لازم است." });
  }
  db.prepare("INSERT INTO users(username, pass_hash, role, created_at) VALUES(?,?,?,?)").run(
    username,
    bcrypt.hashSync(pass, 10),
    role,
    new Date().toISOString()
  );
  res.redirect("/admin/users");
});

app.post("/admin/users/:id/delete", requireAdmin, requireRole("admin"), (req, res) => {
  const count = db.prepare("SELECT COUNT(*) AS c FROM users").get().c;
  if (count > 1) db.prepare("DELETE FROM users WHERE id=?").run(req.params.id);
  res.redirect("/admin/users");
});

app.get("/admin/settings", requireAdmin, requireRole("admin"), (req, res) => {
  res.render("admin/settings", { s: settings(), saved: req.query.saved === "1", error: null });
});

app.post("/admin/settings", requireAdmin, requireRole("admin"), (req, res) => {
  if (req.body.new_password) {
    if (req.body.new_password.length < 8 || !/[A-Za-z]/.test(req.body.new_password) || !/[0-9]/.test(req.body.new_password)) {
      return res.status(400).render("admin/settings", {
        s: Object.assign({}, settings(), req.body),
        saved: false,
        error: "رمز جدید باید حداقل ۸ کاراکتر و شامل حرف و عدد باشد."
      });
    }
  }
  const keys = [
    "site_name", "site_tagline", "brand_letter", "topbar_right", "topbar_left",
    "footer_about", "footer_copy", "address", "access", "phone", "email", "seo_description",
    "visit_hours", "visit_days", "ticket_info", "metro_info"
  ];
  for (const key of keys) setSetting(db, key, req.body[key] || "");
  if (req.body.admin_user) setSetting(db, "admin_user", req.body.admin_user.trim());
  if (req.body.new_password) {
    const hash = bcrypt.hashSync(req.body.new_password, 10);
    setSetting(db, "admin_pass_hash", hash);
    const name = (res.locals.user && res.locals.user.username) || settings().admin_user;
    if (name) {
      db.prepare("UPDATE users SET pass_hash=? WHERE username=?").run(hash, name);
    }
  }
  res.redirect("/admin/settings?saved=1");
});

app.get("/admin/messages", requireAdmin, (_req, res) => {
  const items = db.prepare("SELECT * FROM messages ORDER BY id DESC").all();
  db.prepare("UPDATE messages SET is_read=1").run();
  res.render("admin/messages", { items });
});

app.post("/admin/messages/:id/delete", requireAdmin, (req, res) => {
  db.prepare("DELETE FROM messages WHERE id=?").run(req.params.id);
  res.redirect("/admin/messages");
});

app.use((req, res) => {
  if (req.path.startsWith("/admin")) return res.redirect("/admin/login");
  res.status(404).render("public/notfound");
});

async function start() {
  await migrate(db);
  app.listen(PORT, () => {
    console.log("Masoudieh CMS listening on " + PORT);
    processMissingVariants(db).catch((err) => console.error("image variants:", err));
  });
}

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
