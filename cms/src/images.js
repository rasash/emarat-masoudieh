const path = require("path");
const { UPLOAD_DIR } = require("./db");

let sharp = null;
try {
  sharp = require("sharp");
} catch (_e) {
  sharp = null;
}

const WIDTHS = [480, 960, 1600];

function parseVariants(media) {
  if (!media) return {};
  if (media.variants && typeof media.variants === "object") return media.variants;
  try {
    return JSON.parse(media.variants || "{}");
  } catch (_e) {
    return {};
  }
}

function escapeAttr(s) {
  return String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
}

async function processImageFile(absPath, filename) {
  const variants = { orig: filename, webp: {} };
  if (!sharp) return variants;
  const base = filename.replace(/\.[^.]+$/, "");
  const dir = path.dirname(absPath);
  try {
    for (const w of WIDTHS) {
      const out = `${base}-w${w}.webp`;
      await sharp(absPath)
        .rotate()
        .resize({ width: w, withoutEnlargement: true })
        .webp({ quality: 78 })
        .toFile(path.join(dir, out));
      variants.webp[String(w)] = out;
    }
    const jpg = `${base}-w1600.jpg`;
    await sharp(absPath)
      .rotate()
      .resize({ width: 1600, withoutEnlargement: true })
      .jpeg({ quality: 80, mozjpeg: true })
      .toFile(path.join(dir, jpg));
    variants.jpg = jpg;
  } catch (err) {
    variants.error = String(err.message || err);
  }
  return variants;
}

function mediaSrc(media, prefer = "jpg") {
  if (!media) return "";
  const v = parseVariants(media);
  if (prefer === "webp" && v.webp && v.webp["960"]) return "/uploads/" + v.webp["960"];
  if (v.jpg) return "/uploads/" + v.jpg;
  return "/uploads/" + media.filename;
}

function picture(media, opts) {
  opts = opts || {};
  if (!media) return "";
  const v = parseVariants(media);
  const alt = escapeAttr(media.alt || opts.alt || "");
  const cls = opts.className ? ` class="${escapeAttr(opts.className)}"` : "";
  const loading = opts.eager ? "eager" : "lazy";
  const fetchp = opts.eager ? ' fetchpriority="high"' : "";
  const sizes = opts.sizes || "(max-width: 700px) 100vw, 960px";
  const fallback = v.jpg ? "/uploads/" + v.jpg : "/uploads/" + media.filename;
  const webp = v.webp || {};
  const srcset = Object.keys(webp)
    .sort((a, b) => Number(a) - Number(b))
    .map((w) => `/uploads/${webp[w]} ${w}w`)
    .join(", ");
  const full = fallback;
  return `<picture>
    ${srcset ? `<source type="image/webp" srcset="${srcset}" sizes="${sizes}">` : ""}
    <img src="${fallback}" alt="${alt}"${cls} loading="${loading}" decoding="async"${fetchp} data-full="${full}">
  </picture>`;
}

module.exports = {
  processImageFile,
  parseVariants,
  picture,
  mediaSrc,
  UPLOAD_DIR
};
