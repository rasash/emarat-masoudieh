document.addEventListener("DOMContentLoaded", () => {
  const btn = document.getElementById("menuBtn");
  const nav = document.getElementById("mainNav");
  if (btn && nav) {
    btn.addEventListener("click", () => {
      const open = nav.classList.toggle("open");
      btn.setAttribute("aria-expanded", open ? "true" : "false");
    });
  }
  const header = document.getElementById("mainHeader");
  if (header) {
    window.addEventListener("scroll", () => header.classList.toggle("scrolled", window.scrollY > 8), { passive: true });
  }

  const box = document.getElementById("lightbox");
  if (box) {
    const img = box.querySelector("img");
    const cap = document.getElementById("lightboxCap");
    document.querySelectorAll("[data-gallery] img, .gallery img").forEach((el) => {
      el.addEventListener("click", () => {
        img.src = el.dataset.full || el.currentSrc || el.src;
        img.alt = el.alt || "";
        if (cap) cap.textContent = el.alt || "";
        box.hidden = false;
      });
    });
    box.querySelector("button").addEventListener("click", () => { box.hidden = true; });
    box.addEventListener("click", (e) => { if (e.target === box) box.hidden = true; });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") box.hidden = true;
    });
  }

  document.querySelectorAll("[data-gallery-filters]").forEach((bar) => {
    const gallery = bar.parentElement.querySelector("[data-gallery]");
    if (!gallery) return;
    bar.addEventListener("click", (e) => {
      const b = e.target.closest("[data-filter]");
      if (!b) return;
      bar.querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b));
      const key = b.dataset.filter;
      gallery.querySelectorAll("figure").forEach((fig) => {
        fig.hidden = key !== "*" && fig.dataset.cat !== key;
      });
    });
  });

  document.querySelectorAll("[data-timeline]").forEach((tl) => {
    tl.addEventListener("click", (e) => {
      const item = e.target.closest(".t-item");
      if (!item) return;
      tl.querySelectorAll(".t-item").forEach((x) => x.classList.toggle("open", x === item));
    });
  });

  const map = document.getElementById("spaceMap");
  if (map) {
    map.addEventListener("click", (e) => {
      const hs = e.target.closest(".hotspot");
      if (!hs) return;
      const i = hs.dataset.space;
      map.querySelectorAll(".hotspot").forEach((x) => x.classList.toggle("on", x === hs));
      document.querySelectorAll("[data-space-card]").forEach((card) => {
        card.classList.toggle("on", card.dataset.spaceCard === i);
      });
    });
  }

  const tour = document.getElementById("tourWalk");
  if (tour) {
    const slides = [...tour.querySelectorAll("[data-tour]")];
    let i = 0;
    const show = (n) => {
      i = (n + slides.length) % slides.length;
      slides.forEach((s, idx) => s.classList.toggle("on", idx === i));
    };
    tour.querySelector("[data-tour-prev]")?.addEventListener("click", () => show(i - 1));
    tour.querySelector("[data-tour-next]")?.addEventListener("click", () => show(i + 1));
  }
});
