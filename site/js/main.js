const NAV = [
  { href: "about-mansion.html", n1: "معرفی عمارت مسعودیه", n2: "درباره عمارت" },
  { href: "history.html", n1: "تاریخچه و روایت‌های تاریخی", n2: "حافظه تهران" },
  { href: "news.html", n1: "اخبار و رویدادها", n2: "اتاق رسانه" },
  { href: "encyclopedia.html", n1: "آموزش و پژوهش", n2: "دانشنامه مسعودیه" },
  { href: "about.html", n1: "درباره ما", n2: "مجموعه فرهنگی" },
  { href: "contact.html", n1: "ارتباط با ما", n2: "بازدید و تماس" }
];

function currentPage() {
  const file = (location.pathname.split("/").pop() || "index.html").toLowerCase();
  return file === "" ? "index.html" : file;
}

function renderHeader() {
  const page = currentPage();
  const links = NAV.map((item) => {
    const active = page === item.href ? "active" : "";
    return `<a class="${active}" href="${item.href}"><span class="n1">${item.n1}</span><span class="n2">${item.n2}</span></a>`;
  }).join("");

  document.getElementById("site-header").innerHTML = `
    <div class="topbar">
      <div class="wrap">
        <span>تهران، میدان بهارستان، خیابان اکباتان</span>
        <span>اثر ملی ثبت‌شده سال ۱۳۷۷</span>
      </div>
    </div>
    <header class="header" id="mainHeader">
      <div class="wrap header-inner">
        <a class="brand" href="index.html">
          <div class="brand-mark">م</div>
          <div>
            <strong>عمارت مسعودیه</strong>
            <span>مجموعه فرهنگی‌تاریخی تهران</span>
          </div>
        </a>
        <button class="menu-btn" type="button" id="menuBtn" aria-label="منو">منو</button>
        <nav class="nav" id="mainNav">${links}</nav>
      </div>
    </header>
  `;

  const btn = document.getElementById("menuBtn");
  const nav = document.getElementById("mainNav");
  btn.addEventListener("click", () => nav.classList.toggle("open"));
  window.addEventListener("scroll", () => {
    document.getElementById("mainHeader").classList.toggle("scrolled", window.scrollY > 8);
  });
}

function renderFooter() {
  document.getElementById("site-footer").innerHTML = `
    <footer class="footer">
      <div class="wrap footer-grid">
        <div>
          <h3>عمارت مسعودیه</h3>
          <p>یادگار دوره قاجار در قلب میدان بهارستان؛ جایی برای تماشای معماری، روایت تاریخ و گفت‌وگوی فرهنگ.</p>
        </div>
        <div>
          <h3>صفحات</h3>
          ${NAV.map((i) => `<a href="${i.href}">${i.n1}</a>`).join("")}
        </div>
        <div>
          <h3>بازدید</h3>
          <a href="contact.html">تهران، میدان بهارستان، خیابان اکباتان</a>
          <a href="contact.html">نزدیک به ایستگاه‌های مترو ملت و بهارستان</a>
          <a href="contact.html">info@masoudieh.ir</a>
        </div>
      </div>
      <div class="wrap copy">
        <span>نمونه‌نمایش وب‌سایت عمارت مسعودیه</span>
        <span>عکس‌ها از منابع آزاد ویکی‌مدیا</span>
      </div>
    </footer>
  `;
}

document.addEventListener("DOMContentLoaded", () => {
  if (!document.querySelector('link[rel="icon"]')) {
    const icon = document.createElement("link");
    icon.rel = "icon";
    icon.href = "favicon.svg";
    document.head.appendChild(icon);
  }
  renderHeader();
  renderFooter();

  const form = document.getElementById("contactForm");
  if (form) {
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const toast = document.getElementById("formToast");
      toast.style.display = "block";
      form.reset();
    });
  }
});
