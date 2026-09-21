const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const express = require("express");
const session = require("express-session");
const multer = require("multer");
const bcrypt = require("bcryptjs");
const { openDb, getSettingsMap, setSetting, mediaById, mediaUrl, UPLOAD_DIR } = require("./db");
const { seed } = require("./seed");

const PORT = Number(process.env.PORT || 80);
const SEED_DIR = process.env.SEED_IMAGES_DIR || path.join(__dirname, "..", "seed-images");
const db = openDb();
seed(db, SEED_DIR);

const app = express();
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "..", "views"));
app.use(express.urlencoded({ extended: true, limit: "8mb" }));
app.use(express.json({ limit: "8mb" }));
app.use(
  session({
    secret: process.env.SESSION_SECRET || "masoudieh-secret-change-me",
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 * 12 }
  })
);
app.use("/uploads", express.static(UPLOAD_DIR));
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

app.use((req, res, next) => {
  res.locals.settings = settings();
  res.locals.nav = navPages();
  res.locals.mediaUrl = mediaUrl;
  res.locals.withMedia = withMedia;
  res.locals.admin = !!req.session.admin;
  res.locals.currentPath = req.path;
  next();
});

function requireAdmin(req, res, next) {
  if (!req.session.admin) return res.redirect("/admin/login");
  next();
}

app.get("/", (_req, res) => {
  const home = db.prepare("SELECT slug FROM pages WHERE is_home=1 AND published=1 LIMIT 1").get();
  const page = loadPageBySlug(home ? home.slug : "home");
  if (!page) return res.status(404).render("public/notfound");
  res.render("public/page", { page, querySent: false });
});

app.get("/p/:slug", (req, res) => {
  const page = loadPageBySlug(req.params.slug);
  if (!page) return res.status(404).render("public/notfound");
  res.render("public/page", { page, querySent: req.query.sent === "1" });
});

app.post("/p/:slug/message", (req, res) => {
  const page = loadPageBySlug(req.params.slug);
  if (!page || page.template !== "contact") return res.redirect("/");
  db.prepare(
    "INSERT INTO messages(name, email, topic, body, created_at) VALUES(?,?,?,?,?)"
  ).run(req.body.name || "", req.body.email || "", req.body.topic || "", req.body.msg || "", new Date().toISOString());
  res.redirect("/p/" + page.slug + "?sent=1");
});

app.get("/admin/login", (req, res) => {
  if (req.session.admin) return res.redirect("/admin");
  res.render("admin/login", { error: null, layout: false });
});

app.post("/admin/login", (req, res) => {
  const s = settings();
  const user = (req.body.username || "").trim();
  const pass = req.body.password || "";
  const okUser = user === (s.admin_user || "admin");
  const okPass = s.admin_pass_hash && bcrypt.compareSync(pass, s.admin_pass_hash);
  if (!okUser || !okPass) {
    return res.status(401).render("admin/login", { error: "نام کاربری یا رمز عبور نادرست است." });
  }
  req.session.admin = true;
  res.redirect("/admin");
});

app.post("/admin/logout", requireAdmin, (req, res) => {
  req.session.destroy(() => res.redirect("/admin/login"));
});

app.get("/admin", requireAdmin, (_req, res) => {
  const pages = db.prepare("SELECT COUNT(*) AS c FROM pages").get().c;
  const media = db.prepare("SELECT COUNT(*) AS c FROM media").get().c;
  const unread = db.prepare("SELECT COUNT(*) AS c FROM messages WHERE is_read=0").get().c;
  res.render("admin/dashboard", { pages, media, unread });
});

app.get("/admin/pages", requireAdmin, (_req, res) => {
  const pages = db.prepare("SELECT * FROM pages ORDER BY is_home DESC, nav_order, id").all();
  res.render("admin/pages", { pages });
});

app.get("/admin/pages/new", requireAdmin, (_req, res) => {
  res.render("admin/page-edit", { page: null, blocks: [] });
});

app.get("/admin/pages/:id", requireAdmin, (req, res) => {
  const page = db.prepare("SELECT * FROM pages WHERE id=?").get(req.params.id);
  if (!page) return res.redirect("/admin/pages");
  page.hero = mediaById(db, page.hero_media_id);
  const blocks = parseBlocks(
    db.prepare("SELECT * FROM blocks WHERE page_id=? ORDER BY sort_order, id").all(page.id)
  );
  res.render("admin/page-edit", { page, blocks });
});

function savePage(req, id) {
  const slug = String(req.body.slug || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "page-" + Date.now();
  const ts = new Date().toISOString();
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
    template: req.body.template === "contact" ? "contact" : req.body.template === "home" ? "home" : "page",
    updated_at: ts
  };
  if (payload.is_home) db.prepare("UPDATE pages SET is_home=0").run();
  let pageId = id;
  if (id) {
    db.prepare(`UPDATE pages SET slug=?, title=?, subtitle=?, excerpt=?,
      hero_media_id=?, is_home=?, show_in_nav=?, nav_label=?,
      nav_sublabel=?, nav_order=?, published=?, template=?, updated_at=?
      WHERE id=?`).run(
      payload.slug, payload.title, payload.subtitle, payload.excerpt,
      payload.hero_media_id, payload.is_home, payload.show_in_nav, payload.nav_label,
      payload.nav_sublabel, payload.nav_order, payload.published, payload.template, payload.updated_at, id
    );
  } else {
    const info = db.prepare(`INSERT INTO pages(slug, title, subtitle, excerpt, hero_media_id, is_home, show_in_nav,
      nav_label, nav_sublabel, nav_order, published, template, created_at, updated_at)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
      payload.slug, payload.title, payload.subtitle, payload.excerpt, payload.hero_media_id, payload.is_home,
      payload.show_in_nav, payload.nav_label, payload.nav_sublabel, payload.nav_order, payload.published,
      payload.template, ts, ts
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

app.get("/admin/media", requireAdmin, (_req, res) => {
  const items = db.prepare("SELECT * FROM media ORDER BY id DESC").all();
  res.render("admin/media", { items });
});

app.post("/admin/media", requireAdmin, upload.array("files", 20), (req, res) => {
  const insert = db.prepare(
    "INSERT INTO media(filename, original_name, alt, created_at) VALUES(?,?,?,?)"
  );
  for (const file of req.files || []) {
    insert.run(file.filename, file.originalname || file.filename, req.body.alt || "", new Date().toISOString());
  }
  res.redirect("/admin/media");
});

app.post("/admin/media/:id", requireAdmin, (req, res) => {
  db.prepare("UPDATE media SET alt=? WHERE id=?").run(req.body.alt || "", req.params.id);
  res.redirect("/admin/media");
});

app.post("/admin/media/:id/delete", requireAdmin, (req, res) => {
  const item = db.prepare("SELECT * FROM media WHERE id=?").get(req.params.id);
  if (item) {
    db.prepare("DELETE FROM media WHERE id=?").run(item.id);
    const file = path.join(UPLOAD_DIR, item.filename);
    if (fs.existsSync(file)) fs.unlinkSync(file);
  }
  res.redirect("/admin/media");
});

app.get("/admin/api/media", requireAdmin, (_req, res) => {
  const items = db.prepare("SELECT * FROM media ORDER BY id DESC").all().map((m) => ({
    id: m.id,
    url: mediaUrl(m),
    alt: m.alt,
    name: m.original_name
  }));
  res.json(items);
});

app.post("/admin/api/upload", requireAdmin, upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "فایل نامعتبر است" });
  const info = db.prepare(
    "INSERT INTO media(filename, original_name, alt, created_at) VALUES(?,?,?,?)"
  ).run(req.file.filename, req.file.originalname || req.file.filename, "", new Date().toISOString());
  res.json({ id: Number(info.lastInsertRowid), url: "/uploads/" + req.file.filename });
});

app.get("/admin/settings", requireAdmin, (_req, res) => {
  res.render("admin/settings", { s: settings() });
});

app.post("/admin/settings", requireAdmin, (req, res) => {
  const keys = [
    "site_name", "site_tagline", "brand_letter", "topbar_right", "topbar_left",
    "footer_about", "footer_copy", "address", "access", "phone", "email", "seo_description"
  ];
  for (const key of keys) setSetting(db, key, req.body[key] || "");
  if (req.body.admin_user) setSetting(db, "admin_user", req.body.admin_user.trim());
  if (req.body.new_password) {
    setSetting(db, "admin_pass_hash", bcrypt.hashSync(req.body.new_password, 10));
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

app.listen(PORT, () => {
  console.log("Masoudieh CMS listening on " + PORT);
});
