document.addEventListener("DOMContentLoaded", () => {
  const btn = document.getElementById("menuBtn");
  const nav = document.getElementById("mainNav");
  if (btn && nav) btn.addEventListener("click", () => nav.classList.toggle("open"));
  const header = document.getElementById("mainHeader");
  if (header) {
    window.addEventListener("scroll", () => header.classList.toggle("scrolled", window.scrollY > 8));
  }
  const box = document.getElementById("lightbox");
  if (!box) return;
  const img = box.querySelector("img");
  document.querySelectorAll(".gallery img").forEach((el) => {
    el.addEventListener("click", () => {
      img.src = el.dataset.full || el.src;
      img.alt = el.alt || "";
      box.hidden = false;
    });
  });
  box.querySelector("button").addEventListener("click", () => { box.hidden = true; });
  box.addEventListener("click", (e) => { if (e.target === box) box.hidden = true; });
});
