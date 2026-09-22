const TYPES = {
  split: "متن + عکس",
  rich: "متن آزاد",
  cards: "کارت‌ها",
  gallery: "گالری",
  timeline: "خط زمان",
  news: "اخبار"
};

const empty = {
  split: { kicker: "", title: "", body: "", media_id: "", facts: [{ value: "", label: "" }] },
  rich: { html: "" },
  cards: { kicker: "", title: "", intro: "", items: [{ title: "", body: "", link: "", link_label: "", media_id: "" }] },
  gallery: { kicker: "", title: "", items: [{ caption: "", media_id: "", category: "" }] },
  timeline: { kicker: "", title: "", items: [{ date: "", title: "", body: "" }] },
  news: { kicker: "", title: "", intro: "", items: [{ date: "", title: "", body: "", media_id: "" }] }
};

let pickerTarget = null;
let mediaCache = [];
let cropImg = null;
let cropAspect = 16 / 9;

function field(label, name, value, tag) {
  const v = value == null ? "" : String(value).replace(/</g, "&lt;");
  if (tag === "textarea") {
    return `<label>${label}<textarea data-k="${name}">${v}</textarea></label>`;
  }
  return `<label>${label}<input data-k="${name}" value="${v.replace(/"/g, "&quot;")}" /></label>`;
}

function mediaPick(id, mediaId) {
  return `
    <div class="hero-pick">
      <input type="hidden" data-k="media_id" value="${mediaId || ""}" />
      <div class="pick-preview" data-pick="${id}"><em>انتخاب عکس</em></div>
      <button type="button" class="btn ghost" data-open-picker="${id}">انتخاب / جایگزینی عکس</button>
    </div>`;
}

function richEditor(html) {
  const v = html == null ? "" : String(html);
  return `
    <div class="editor">
      <div class="editor-bar">
        <button type="button" data-cmd="bold">پررنگ</button>
        <button type="button" data-cmd="italic">کج</button>
        <button type="button" data-cmd="insertUnorderedList">فهرست</button>
        <button type="button" data-cmd="formatBlock" data-val="h3">عنوان</button>
        <button type="button" data-cmd="formatBlock" data-val="p">پاراگراف</button>
      </div>
      <div class="wysiwyg" contenteditable="true">${v}</div>
      <textarea data-k="html" hidden>${v.replace(/</g, "&lt;")}</textarea>
    </div>`;
}

function itemFields(type, item, i) {
  if (type === "gallery") {
    return `${mediaPick("g-" + i, item.media_id)}${field("شرح", "caption", item.caption)}${field("دسته", "category", item.category)}`;
  }
  if (type === "timeline") {
    return `${field("تاریخ", "date", item.date)}${field("عنوان", "title", item.title)}${field("متن", "body", item.body, "textarea")}`;
  }
  if (type === "news") {
    return `${mediaPick("n-" + i, item.media_id)}${field("تاریخ", "date", item.date)}${field("عنوان", "title", item.title)}${field("متن", "body", item.body, "textarea")}`;
  }
  return `${mediaPick("c-" + i, item.media_id)}${field("عنوان", "title", item.title)}${field("متن", "body", item.body, "textarea")}${field("لینک", "link", item.link)}${field("متن لینک", "link_label", item.link_label)}`;
}

function renderBlock(block, index) {
  const d = Object.assign({}, empty[block.type], block.data || {});
  let extra = "";
  if (block.type === "split") {
    extra = `
      ${field("ابرو", "kicker", d.kicker)}
      ${field("عنوان", "title", d.title)}
      ${field("متن", "body", d.body, "textarea")}
      ${mediaPick("split-" + index, d.media_id)}
      <div class="items" data-list="facts">
        ${(d.facts || []).map((f) => `<div class="item-row">${field("عدد/مقدار", "value", f.value)}${field("برچسب", "label", f.label)}<button type="button" data-del-item>حذف آمار</button></div>`).join("")}
        <button type="button" class="btn ghost" data-add-item='{"value":"","label":""}'>افزودن آمار</button>
      </div>`;
  } else if (block.type === "rich") {
    extra = richEditor(d.html || d.body || "");
  } else {
    extra = `
      ${field("ابرو", "kicker", d.kicker)}
      ${field("عنوان بخش", "title", d.title)}
      ${block.type !== "gallery" && block.type !== "timeline" ? field("مقدمه", "intro", d.intro, "textarea") : ""}
      <div class="items" data-list="items">
        ${(d.items || []).map((item, i) => `<div class="item-row">${itemFields(block.type, item, index + "-" + i)}<button type="button" data-del-item>حذف آیتم</button></div>`).join("")}
        <button type="button" class="btn ghost" data-add-item='${JSON.stringify(empty[block.type].items[0])}'>افزودن آیتم</button>
      </div>`;
  }
  const el = document.createElement("article");
  el.className = "block";
  el.dataset.type = block.type;
  el.innerHTML = `
    <div class="block-top">
      <b>${TYPES[block.type]}</b>
      <div>
        <button type="button" data-up>بالا</button>
        <button type="button" data-down>پایین</button>
        <button type="button" data-remove>حذف بلوک</button>
      </div>
    </div>
    ${extra}`;
  return el;
}

function syncEditors(root) {
  (root || document).querySelectorAll(".editor").forEach((ed) => {
    const wys = ed.querySelector(".wysiwyg");
    const ta = ed.querySelector("textarea[data-k='html']");
    if (wys && ta) ta.value = wys.innerHTML;
  });
}

function collectValue(node) {
  syncEditors(node);
  const type = node.dataset.type;
  const data = {};
  node.querySelectorAll(":scope > label [data-k], :scope > .hero-pick [data-k], :scope > .editor [data-k]").forEach((input) => {
    data[input.dataset.k] = input.value;
  });
  const list = node.querySelector("[data-list]");
  if (list) {
    const key = list.dataset.list;
    data[key] = [...list.querySelectorAll(":scope > .item-row")].map((row) => {
      const item = {};
      row.querySelectorAll("[data-k]").forEach((input) => { item[input.dataset.k] = input.value; });
      return item;
    });
  }
  return { type, data };
}

function serialize() {
  const list = document.getElementById("blockList");
  if (!list) return "[]";
  const json = [...list.children].map(collectValue);
  const payload = JSON.stringify(json);
  const hidden = document.getElementById("blocksJson");
  if (hidden) hidden.value = payload;
  return payload;
}

async function loadMedia() {
  const res = await fetch("/admin/api/media");
  mediaCache = await res.json();
  paintPicker();
  refreshPreviews();
}

function paintPicker() {
  const grid = document.getElementById("pickerGrid");
  if (!grid) return;
  grid.innerHTML = mediaCache.map((m) => `<button type="button" data-choose="${m.id}" data-url="${m.url}"><img src="${m.url}" alt=""></button>`).join("");
}

function refreshPreviews() {
  document.querySelectorAll("[data-k='media_id'], #heroMediaId, [name='media_id']").forEach((input) => {
    const found = mediaCache.find((m) => String(m.id) === String(input.value));
    const box = input.id === "heroMediaId"
      ? document.querySelector('.pick-preview[data-pick="heroMediaId"]')
      : input.parentElement.querySelector(".pick-preview");
    if (box) box.innerHTML = found ? `<img src="${found.url}" alt="">` : "<em>عکسی انتخاب نشده</em>";
  });
}

function openPicker(input) {
  pickerTarget = input;
  document.getElementById("mediaPicker").hidden = false;
  loadMedia();
}

function drawCrop() {
  const canvas = document.getElementById("cropCanvas");
  if (!canvas || !cropImg) return;
  const ctx = canvas.getContext("2d");
  const iw = cropImg.naturalWidth;
  const ih = cropImg.naturalHeight;
  const srcAspect = iw / ih;
  let sx = 0, sy = 0, sw = iw, sh = ih;
  if (srcAspect > cropAspect) {
    sw = ih * cropAspect;
    sx = (iw - sw) / 2;
  } else {
    sh = iw / cropAspect;
    sy = (ih - sh) / 2;
  }
  canvas.width = Math.min(1200, Math.round(sw));
  canvas.height = Math.round(canvas.width / cropAspect);
  ctx.drawImage(cropImg, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
}

document.addEventListener("DOMContentLoaded", () => {
  const list = document.getElementById("blockList");
  if (list) {
    (window.PAGE_BLOCKS || []).forEach((block) => list.appendChild(renderBlock(block)));
    document.querySelectorAll("[data-add]").forEach((btn) => {
      btn.addEventListener("click", () => {
        list.appendChild(renderBlock({ type: btn.dataset.add, data: empty[btn.dataset.add] }));
        refreshPreviews();
      });
    });
    list.addEventListener("click", (e) => {
      const cmd = e.target.closest("[data-cmd]");
      if (cmd) {
        const val = cmd.dataset.val;
        document.execCommand(cmd.dataset.cmd, false, val || null);
        e.preventDefault();
        return;
      }
      const block = e.target.closest(".block");
      if (e.target.dataset.remove && block) block.remove();
      if (e.target.dataset.up && block && block.previousElementSibling) block.parentNode.insertBefore(block, block.previousElementSibling);
      if (e.target.dataset.down && block && block.nextElementSibling) block.parentNode.insertBefore(block.nextElementSibling, block);
      if (e.target.dataset.delItem) e.target.closest(".item-row")?.remove();
      if (e.target.dataset.addItem) {
        const holder = e.target.closest(".items");
        const row = document.createElement("div");
        row.className = "item-row";
        const sample = JSON.parse(e.target.dataset.addItem);
        const type = e.target.closest(".block").dataset.type;
        row.innerHTML = itemFields(type, sample, Date.now()) + '<button type="button" data-del-item>حذف آیتم</button>';
        holder.insertBefore(row, e.target);
        refreshPreviews();
      }
    });
    document.getElementById("pageForm").addEventListener("submit", serialize);
  }

  const previewBtn = document.getElementById("previewBtn");
  if (previewBtn) {
    previewBtn.addEventListener("click", () => {
      const blocks = serialize();
      const form = document.getElementById("previewForm");
      const src = document.getElementById("pageForm");
      form.querySelector("[name=title]").value = src.title.value;
      form.querySelector("[name=slug]").value = src.slug.value;
      form.querySelector("[name=subtitle]").value = src.subtitle.value;
      form.querySelector("[name=excerpt]").value = src.excerpt.value;
      form.querySelector("[name=seo_description]").value = src.seo_description.value;
      form.querySelector("[name=template]").value = src.template.value;
      form.querySelector("[name=hero_media_id]").value = src.hero_media_id.value;
      form.querySelector("[name=blocks_json]").value = blocks;
      form.submit();
    });
  }

  document.body.addEventListener("click", (e) => {
    const open = e.target.closest("[data-open-picker]");
    if (open) {
      const key = open.dataset.openPicker;
      const input = document.getElementById(key) || open.parentElement.querySelector("[data-k='media_id'], [name='media_id']");
      if (input) {
        if (!input.id) input.id = "m" + Date.now();
        openPicker(input);
      }
    }
    const choose = e.target.closest("[data-choose]");
    if (choose && pickerTarget) {
      pickerTarget.value = choose.dataset.choose;
      const box = document.querySelector(`.pick-preview[data-pick="${pickerTarget.id}"]`) || pickerTarget.parentElement.querySelector(".pick-preview");
      if (box) box.innerHTML = `<img src="${choose.dataset.url}" alt="">`;
      document.getElementById("mediaPicker").hidden = true;
    }
    const cropOpen = e.target.closest("[data-crop-open]");
    if (cropOpen) {
      cropImg = new Image();
      cropImg.crossOrigin = "anonymous";
      cropImg.onload = drawCrop;
      cropImg.src = cropOpen.dataset.cropOpen;
      document.getElementById("cropModal").hidden = false;
    }
  });

  const close = document.getElementById("pickerClose");
  if (close) close.addEventListener("click", () => { document.getElementById("mediaPicker").hidden = true; });
  const cropClose = document.getElementById("cropClose");
  if (cropClose) cropClose.addEventListener("click", () => { document.getElementById("cropModal").hidden = true; });
  document.querySelectorAll("[data-aspect]").forEach((btn) => {
    btn.addEventListener("click", () => {
      cropAspect = Number(btn.dataset.aspect);
      drawCrop();
    });
  });
  const cropSave = document.getElementById("cropSave");
  if (cropSave) {
    cropSave.addEventListener("click", async () => {
      const canvas = document.getElementById("cropCanvas");
      canvas.toBlob(async (blob) => {
        const fd = new FormData();
        fd.append("file", blob, "crop.jpg");
        await fetch("/admin/api/upload", { method: "POST", body: fd });
        document.getElementById("cropModal").hidden = true;
        window.location.reload();
      }, "image/jpeg", 0.86);
    });
  }

  const up = document.getElementById("pickerUpload");
  if (up) {
    up.addEventListener("change", async () => {
      if (!up.files[0]) return;
      const fd = new FormData();
      fd.append("file", up.files[0]);
      const res = await fetch("/admin/api/upload", { method: "POST", body: fd });
      const data = await res.json();
      if (data.id && pickerTarget) {
        pickerTarget.value = data.id;
        const box = pickerTarget.parentElement.querySelector(".pick-preview");
        if (box) box.innerHTML = `<img src="${data.url}" alt="">`;
      }
      await loadMedia();
      up.value = "";
    });
  }

  loadMedia();
});
