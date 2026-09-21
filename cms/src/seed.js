const fs = require("fs");
const path = require("path");
const bcrypt = require("bcryptjs");
const { UPLOAD_DIR, setSetting } = require("./db");

function now() {
  return new Date().toISOString();
}

function copySeedImages(seedDir, db) {
  if (!seedDir || !fs.existsSync(seedDir)) return;
  const files = fs.readdirSync(seedDir).filter((f) => /\.(jpe?g|png|webp|gif)$/i.test(f));
  const insert = db.prepare(
    "INSERT INTO media(filename, original_name, alt, created_at) VALUES(?,?,?,?)"
  );
  for (const file of files) {
    const dest = path.join(UPLOAD_DIR, file);
    fs.copyFileSync(path.join(seedDir, file), dest);
    insert.run(file, file, "", now());
  }
}

function mid(db, filename) {
  const row = db.prepare("SELECT id FROM media WHERE filename=?").get(filename);
  return row ? row.id : null;
}

function insertPage(db, page, blocks) {
  const ts = now();
  const info = db.prepare(`
    INSERT INTO pages(slug, title, subtitle, excerpt, hero_media_id, is_home, show_in_nav,
      nav_label, nav_sublabel, nav_order, published, template, created_at, updated_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `).run(
    page.slug, page.title, page.subtitle, page.excerpt, page.hero_media_id, page.is_home, page.show_in_nav,
    page.nav_label, page.nav_sublabel, page.nav_order, page.published, page.template, ts, ts
  );
  const addBlock = db.prepare(
    "INSERT INTO blocks(page_id, type, data_json, sort_order) VALUES(?,?,?,?)"
  );
  blocks.forEach((block, i) => {
    addBlock.run(Number(info.lastInsertRowid), block.type, JSON.stringify(block.data || {}), i);
  });
}

function seed(db, seedDir) {
  const existing = db.prepare("SELECT COUNT(*) AS c FROM pages").get().c;
  if (existing > 0) return;

  copySeedImages(seedDir, db);

  const user = process.env.ADMIN_USER || "admin";
  const pass = process.env.ADMIN_PASSWORD || "Masoudieh@1405";
  setSetting(db, "admin_user", user);
  setSetting(db, "admin_pass_hash", bcrypt.hashSync(pass, 10));
  setSetting(db, "site_name", "عمارت مسعودیه");
  setSetting(db, "site_tagline", "مجموعه فرهنگی‌تاریخی تهران");
  setSetting(db, "brand_letter", "م");
  setSetting(db, "topbar_right", "تهران، میدان بهارستان، خیابان اکباتان");
  setSetting(db, "topbar_left", "اثر ملی ثبت‌شده سال ۱۳۷۷");
  setSetting(db, "footer_about", "یادگار دوره قاجار در قلب میدان بهارستان؛ جایی برای تماشای معماری، روایت تاریخ و گفت‌وگوی فرهنگ.");
  setSetting(db, "footer_copy", "مجموعه فرهنگی‌تاریخی عمارت مسعودیه");
  setSetting(db, "address", "تهران، میدان بهارستان، ضلع جنوب‌غربی، خیابان اکباتان، عمارت مسعودیه");
  setSetting(db, "access", "نزدیک‌ترین ایستگاه‌های مترو: ملت و بهارستان. ورودی مجموعه در خیابان اکباتان است.");
  setSetting(db, "phone", "۰۲۱-۳۳۹۰۰۰۰۰");
  setSetting(db, "email", "info@masoudieh.ir");
  setSetting(db, "seo_description", "وب‌سایت عمارت مسعودیه در میدان بهارستان تهران؛ معرفی بنا، تاریخچه، اخبار، دانشنامه و ارتباط با مجموعه.");

  insertPage(db, {
    slug: "home",
    title: "عمارت مسعودیه",
    subtitle: "میدان بهارستان — تهران",
    excerpt: "باغ‌عمارت قاجاری ظل‌السلطان؛ جایی که معماری ایرانی، روایت مشروطه و حافظه فرهنگی پایتخت در یک مجموعه گرد آمده‌اند.",
    hero_media_id: mid(db, "hero.jpg"),
    is_home: 1,
    show_in_nav: 0,
    nav_label: "خانه",
    nav_sublabel: "",
    nav_order: 0,
    published: 1,
    template: "home"
  }, [
    {
      type: "split",
      data: {
        kicker: "نگین بهارستان",
        title: "خانه‌ای برای تاریخ، هنر و پژوهش",
        body: "عمارت مسعودیه به دستور مسعود میرزا، فرزند ناصرالدین‌شاه و حاکم اصفهان، در سال ۱۲۹۵ قمری بر بستر باغ نظامیه ساخته شد. استاد شعبان معمارباشی این مجموعه را با کاشی‌کاری، گچ‌بری، آینه‌کاری و نقاشی دیواری شکل داد.\n\nامروز این بنا نه فقط یک اثر معماری، بلکه فضایی برای بازدید، روایت تاریخ تهران، رویدادهای فرهنگی و پژوهش است.",
        media_id: mid(db, "courtyard.jpg"),
        facts: [
          { value: "۱۲۹۵ ق", label: "آغاز ساخت" },
          { value: "۴۰۰۰ م۲", label: "مساحت مجموعه" },
          { value: "۱۳۷۷", label: "ثبت آثار ملی" }
        ]
      }
    },
    {
      type: "cards",
      data: {
        kicker: "سربرگ مجموعه",
        title: "شش دروازه ورود به مسعودیه",
        intro: "هر بخش از سایت، روایتی کوتاه از عمارت، تاریخ، رسانه، دانش و ارتباط با مخاطبان است.",
        items: [
          { media_id: mid(db, "facade.jpg"), title: "معرفی عمارت مسعودیه / درباره عمارت", body: "گردش در دیوان‌خانه، سفره‌خانه، حوض‌خانه، عمارت مشیری و باغ هشت‌حیاطی مجموعه.", link: "/p/about-mansion", link_label: "ادامه معرفی" },
          { media_id: mid(db, "garden.jpg"), title: "تاریخچه و روایت‌های تاریخی", body: "از ظل‌السلطان تا مشروطه، از نخستین کتابخانه و موزه تا وزارت معارف؛ مسعودیه حافظه زنده تهران است.", link: "/p/history", link_label: "خواندن روایت‌ها" },
          { media_id: mid(db, "hall.jpg"), title: "اخبار و رویدادها / اتاق رسانه", body: "نمایشگاه، تورهای تخصصی، مرمت، عکس و گزارش‌های رسانه‌ای مجموعه در یک اتاق خبر واحد.", link: "/p/news", link_label: "اتاق رسانه" },
          { media_id: mid(db, "windows.jpg"), title: "آموزش و پژوهش / دانشنامه مسعودیه", body: "واژه‌نامه فضاها، هنرهای تزئینی، منابع پژوهشی و مسیرهای آموزشی برای دانش‌آموز و پژوهشگر.", link: "/p/encyclopedia", link_label: "ورود به دانشنامه" },
          { media_id: mid(db, "complex.jpg"), title: "درباره ما", body: "ماموریت مجموعه فرهنگی‌تاریخی مسعودیه برای حفاظت، احیا و معرفی این میراث ملی.", link: "/p/about", link_label: "شناخت مجموعه" },
          { media_id: mid(db, "portal.jpg"), title: "ارتباط با ما", body: "نشانی میدان بهارستان، مسیر مترو، درخواست بازدید گروهی و راه‌های تماس با دبیرخانه.", link: "/p/contact", link_label: "تماس و بازدید" }
        ]
      }
    },
    {
      type: "gallery",
      data: {
        kicker: "گالری",
        title: "رنگ، نقش و نور قاجاری",
        items: [
          { media_id: mid(db, "interior.jpg"), caption: "فضای داخلی عمارت" },
          { media_id: mid(db, "stucco.jpg"), caption: "گچ‌بری فرشته" },
          { media_id: mid(db, "arcade.jpg"), caption: "رواق مجموعه" },
          { media_id: mid(db, "tiles.jpg"), caption: "تزئینات" },
          { media_id: mid(db, "ornament.jpg"), caption: "جزئیات نقش" }
        ]
      }
    }
  ]);

  insertPage(db, {
    slug: "about-mansion",
    title: "معرفی عمارت مسعودیه / درباره عمارت",
    subtitle: "سربرگ صفحه نخست",
    excerpt: "باغ‌عمارت بهارستان با چند عمارت، هشت حیاط و تزئینات قاجاری.",
    hero_media_id: mid(db, "facade.jpg"),
    is_home: 0, show_in_nav: 1, nav_label: "معرفی عمارت مسعودیه", nav_sublabel: "درباره عمارت",
    nav_order: 1, published: 1, template: "page"
  }, [
    {
      type: "split",
      data: {
        kicker: "باغ‌عمارت بهارستان",
        title: "مجموعه‌ای با چند عمارت و هشت حیاط",
        body: "عمارت مسعودیه در ضلع جنوب‌غربی میدان بهارستان، خیابان اکباتان تهران قرار دارد. این مجموعه روی زمینی ذوزنقه‌شکل و حدود چهار هزار مترمربع بنا شده و از الگوی باغ ایرانی با فضاهای بیرونی، اندرونی و خدماتی پیروی می‌کند.\n\nنام بنا از مسعود میرزا ملقب به ظل‌السلطان گرفته شده است؛ شاهزاده‌ای که برای اقامت در تهران، این خانه را بر بستر باغ نظامیه ساخت. معمار مجموعه استاد شعبان معمارباشی و ناظر آن میرزا رضاقلی‌خان سراج‌الملک بوده‌اند.\n\nآنچه مسعودیه را متمایز می‌کند، توازن میان شکوه سلطنتی و مقیاس شهری است: رواق‌ها، ارسی‌ها، کتیبه‌ها و حوض‌هایی که نور و نقش را در حیاط‌ها بازمی‌تابانند.",
        media_id: mid(db, "courtyard.jpg")
      }
    },
    {
      type: "cards",
      data: {
        kicker: "فضاهای مجموعه",
        title: "از دیوان‌خانه تا حوض‌خانه",
        items: [
          { media_id: mid(db, "hall.jpg"), title: "عمارت دیوان‌خانه", body: "قلب تشریفاتی مجموعه و محل پذیرایی از مهمانان ویژه؛ با آینه‌کاری، گچ‌بری و تناسبات رسمی قاجاری." },
          { media_id: mid(db, "arcade.jpg"), title: "سفره‌خانه", body: "تالار مهمانی‌های بزرگ در جنوب مجموعه؛ فضایی برای جشن، ضیافت و پیوند حیاط خدمه با آبدارخانه." },
          { media_id: mid(db, "windows.jpg"), title: "حوض‌خانه", body: "جنوبی‌ترین بخش بنا؛ جایی که طاق، ستون، کاشی و شیشه رنگی در آب حوض تکرار می‌شوند." },
          { media_id: mid(db, "portal.jpg"), title: "عمارت مشیری", body: "اقامتگاه مباشران ظل‌السلطان؛ نمونه‌ای از خانه‌های اعیانی وابسته به دیوان‌خانه اصلی." },
          { media_id: mid(db, "stucco.jpg"), title: "سردر و کتیبه‌ها", body: "هفت کتیبه ارزشمند در سردر، دیوان‌خانه و عمارت مشیرالدوله، هویت نوشتاری مجموعه را کامل می‌کنند." },
          { media_id: mid(db, "garden.jpg"), title: "عمارت سید جوادی", body: "یادمانی در حیاط مجموعه؛ روایتی از قدردانی شاهزاده از حکیمی که جان او را در شکارگاه نجات داد." }
        ]
      }
    },
    {
      type: "gallery",
      data: {
        kicker: "هنر در دیوار و سقف",
        title: "کاشی، گچ و ارسی",
        items: [
          { media_id: mid(db, "interior.jpg"), caption: "فضای داخلی عمارت مسعودیه" },
          { media_id: mid(db, "detail.jpg"), caption: "جزئیات چوب، گچ و نقش قاجاری" }
        ]
      }
    }
  ]);

  insertPage(db, {
    slug: "history",
    title: "تاریخچه و روایت‌های تاریخی",
    subtitle: "حافظه تاریخی تهران",
    excerpt: "از ظل‌السلطان تا مشروطه، کتابخانه، موزه و وزارت معارف.",
    hero_media_id: mid(db, "garden.jpg"),
    is_home: 0, show_in_nav: 1, nav_label: "تاریخچه و روایت‌های تاریخی", nav_sublabel: "حافظه تهران",
    nav_order: 2, published: 1, template: "page"
  }, [
    {
      type: "split",
      data: {
        kicker: "از ظل‌السلطان تا امروز",
        title: "عمارت، آینه دو قرن پایتخت",
        body: "تاریخ مسعودیه فقط تاریخ یک خانه اعیانی نیست. این مجموعه از اقامتگاه شاهزاده‌ای قاجاری به پایگاه مشروطه‌خواهان، سپس به نخستین تجربه‌های موزه و کتابخانه رسمی، دانشکده افسری و وزارت معارف بدل شد.\n\nدر سال ۱۲۸۴ خورشیدی عمارت به همدم‌السلطنه فروخته شد. رضاشاه در ۱۲۹۹ آن را خرید و یک سال بعد به وزارت فرهنگ، اوقاف و صنایع مستظرفه هدیه کرد. از ۱۳۰۴ تا ۱۳۱۸ بخشی از نخستین کتابخانه رسمی و در عمل نخستین موزه کشور نیز در همین فضا شکل گرفت.\n\nدر جریان جنبش مشروطه، مسعودیه در کنار خانه ظهیرالدوله هدف حمله قرار گرفت. انفجار بمب در مسیر کالسکه محمدعلی‌شاه در نزدیکی این عمارت، یکی از گره‌های روایی تاریخ سیاسی تهران است.",
        media_id: mid(db, "complex.jpg")
      }
    },
    {
      type: "timeline",
      data: {
        kicker: "خط زمان",
        title: "ایستگاه‌های مهم مسعودیه",
        items: [
          { date: "۱۲۹۵ قمری / ۱۸۷۸ میلادی", title: "آغاز ساخت باغ و عمارت", body: "مسعود میرزا ظل‌السلطان دستور ساخت مجموعه را در باغ نظامیه صادر می‌کند." },
          { date: "دوره مشروطه", title: "پایگاه مشروطه‌خواهان", body: "عمارت در شبکه خانه‌های اثرگذار بهارستان قرار می‌گیرد و شاهد درگیری‌های خیابانی می‌شود." },
          { date: "۱۲۹۹–۱۳۰۰ خورشیدی", title: "خرید رضاشاه و هدیه به وزارت معارف", body: "مالکیت از حوزه خصوصی به نهاد فرهنگ و آموزش عمومی منتقل می‌شود." },
          { date: "۱۳۰۴ تا ۱۳۱۸", title: "کتابخانه و موزه آغازین", body: "اشیای قدیمی برای نمایش گرد می‌آیند و مسعودیه نقش نهاد فرهنگی ملی پیدا می‌کند." },
          { date: "۱۳۴۵ و پس از آن", title: "وزارت آموزش و پرورش", body: "با تفکیک فرهنگ و هنر از آموزش، عمارت محل استقرار نخستین وزارتخانه آموزش و پرورش می‌شود." },
          { date: "۱۳۷۷ خورشیدی", title: "ثبت در فهرست آثار ملی", body: "مسعودیه رسماً به‌عنوان میراث ملی ایران به ثبت می‌رسد." }
        ]
      }
    }
  ]);

  insertPage(db, {
    slug: "news",
    title: "اخبار و رویدادها / اتاق رسانه",
    subtitle: "اتاق رسانه",
    excerpt: "نمایشگاه، مرمت، تور و آرشیو تصویری مجموعه.",
    hero_media_id: mid(db, "hall.jpg"),
    is_home: 0, show_in_nav: 1, nav_label: "اخبار و رویدادها", nav_sublabel: "اتاق رسانه",
    nav_order: 3, published: 1, template: "page"
  }, [
    {
      type: "news",
      data: {
        kicker: "آنچه در مجموعه می‌گذرد",
        title: "نمایشگاه، مرمت، تور و روایت",
        intro: "اتاق رسانه مسعودیه، اخبار فرهنگی، فراخوان بازدید و آرشیو تصویری عمارت را در یک جا گرد می‌آورد.",
        items: [
          { media_id: mid(db, "interior.jpg"), date: "۱۵ شهریور ۱۴۰۵", title: "تور روایی «شب ارسی‌ها» در دیوان‌خانه", body: "بازدید شبانگاهی با روایت معماری قاجار، نورپردازی روی گچ‌بری‌ها و گفت‌وگوی کوتاه با مرمت‌گران مجموعه." },
          { media_id: mid(db, "stucco.jpg"), date: "۲ شهریور ۱۴۰۵", title: "آغاز فاز مستندنگاری گچ‌بری‌های فرشته", body: "تیم حفاظت، تزئینات نفیس دیوارها را عکس‌برداری و طبقه‌بندی می‌کند تا مسیر مرمت دقیق‌تر شود." },
          { media_id: mid(db, "garden.jpg"), date: "۲۰ مرداد ۱۴۰۵", title: "عکس‌خانه بهارستان؛ نمایش آثار تاریخی باغ", body: "نمایشگاه عکس در سفره‌خانه، با تمرکز بر حیاط‌ها، حوض و زندگی روزمره مجموعه در دهه‌های گذشته." },
          { media_id: mid(db, "windows.jpg"), date: "۵ مرداد ۱۴۰۵", title: "کارگاه دانش‌آموزی «معماری را لمس کن»", body: "دانش‌آموزان با نقشه حیاط‌ها، کاشی و ارسی آشنا می‌شوند و دفترچه دانشنامه مسعودیه را تکمیل می‌کنند." }
        ]
      }
    },
    {
      type: "gallery",
      data: {
        kicker: "آرشیو تصویری",
        title: "اتاق رسانه در یک نگاه",
        items: [
          { media_id: mid(db, "facade.jpg"), caption: "نما" },
          { media_id: mid(db, "arcade.jpg"), caption: "رواق" },
          { media_id: mid(db, "tiles.jpg"), caption: "نقش" },
          { media_id: mid(db, "portal.jpg"), caption: "ورودی" },
          { media_id: mid(db, "detail.jpg"), caption: "جزئیات" }
        ]
      }
    }
  ]);

  insertPage(db, {
    slug: "encyclopedia",
    title: "آموزش و پژوهش / دانشنامه مسعودیه",
    subtitle: "دانشنامه مسعودیه",
    excerpt: "از واژه معماری تا سند تاریخی.",
    hero_media_id: mid(db, "windows.jpg"),
    is_home: 0, show_in_nav: 1, nav_label: "آموزش و پژوهش", nav_sublabel: "دانشنامه مسعودیه",
    nav_order: 4, published: 1, template: "page"
  }, [
    {
      type: "split",
      data: {
        kicker: "یادگیری در دل اثر",
        title: "از واژه معماری تا سند تاریخی",
        body: "دانشنامه مسعودیه پلی است میان بازدید عمومی و پژوهش تخصصی. اینجا فضاهای مجموعه، فنون تزئین، اشخاص و رویدادها با زبانی روشن معرفی می‌شوند تا دانش‌آموز، راهنما، معمار و تاریخ‌پژوه از یک منبع مشترک استفاده کنند.\n\nمسعودیه سال‌ها نهاد آموزش رسمی ایران بوده است؛ از وزارت معارف تا استقرار آموزش و پرورش. امروز همان روح آموزشی در قالب تورهای پژوهشی، کارگاه مرمت و مدخل‌های دانشنامه ادامه پیدا می‌کند.",
        media_id: mid(db, "interior.jpg")
      }
    },
    {
      type: "cards",
      data: {
        kicker: "مدخل‌ها",
        title: "نمونه‌هایی از دانشنامه",
        items: [
          { media_id: mid(db, "hall.jpg"), title: "دیوان‌خانه", body: "فضای رسمی پذیرایی شاهزاده؛ ترکیبی از تناسبات ایرانی و تزئینات ناصری." },
          { media_id: mid(db, "stucco.jpg"), title: "گچ‌بری و نقاشی دیواری", body: "نقوش گیاهی، فرشته و قاب‌بندی‌هایی که دیوار را به صفحه روایت بدل می‌کنند." },
          { media_id: mid(db, "arcade.jpg"), title: "ارسی و شیشه رنگی", body: "نور رنگی حیاط را به داخل می‌کشاند و در حوض‌خانه با انعکاس آب کامل می‌شود." },
          { media_id: mid(db, "garden.jpg"), title: "باغ و الگوی حیاط‌ها", body: "هشت حیاط با نقش‌های متفاوت: تشریفات، سکونت، خدمت و عبور." },
          { media_id: mid(db, "complex.jpg"), title: "بهارستان و بافت شهری", body: "عمارت در کنار مجلس، باغ نگارستان و خانه‌های رجال، بخشی از جغرافیای سیاسی تهران قدیم است." },
          { media_id: mid(db, "tiles.jpg"), title: "کاشی‌کاری قاجاری", body: "رنگ زرد، لاجورد و نقش هندسی روی ازاره و ایوان؛ زبان تزئینی مجموعه." }
        ]
      }
    }
  ]);

  insertPage(db, {
    slug: "about",
    title: "درباره ما",
    subtitle: "مجموعه فرهنگی‌تاریخی",
    excerpt: "حفاظت، احیا و روایت عمارت مسعودیه.",
    hero_media_id: mid(db, "complex.jpg"),
    is_home: 0, show_in_nav: 1, nav_label: "درباره ما", nav_sublabel: "مجموعه فرهنگی",
    nav_order: 5, published: 1, template: "page"
  }, [
    {
      type: "split",
      data: {
        kicker: "ماموریت",
        title: "حفاظت، احیا و روایت",
        body: "مجموعه فرهنگی‌تاریخی عمارت مسعودیه با این هدف شکل گرفته که یکی از مهم‌ترین باغ‌عمارت‌های تهران قاجاری زنده بماند؛ نه فقط به‌عنوان بنای حفاظت‌شده، بلکه به‌عنوان فضای عمومی برای دیدن، آموختن و گفت‌وگو.\n\nکار ما سه لایه دارد: حفاظت کالبدی از تزئینات و سازه‌ها، احیای کاربری‌های فرهنگی متناسب با شأن اثر، و روایت دقیق تاریخ برای مخاطب عمومی و تخصصی.",
        media_id: mid(db, "facade.jpg")
      }
    },
    {
      type: "cards",
      data: {
        kicker: "چه می‌کنیم",
        title: "سه ستون فعالیت",
        items: [
          { media_id: mid(db, "ornament.jpg"), title: "حفاظت و مرمت", body: "پایش تزئینات، مستندنگاری و مرمت مبتنی بر اصول میراث فرهنگی." },
          { media_id: mid(db, "hall.jpg"), title: "بازدید و رویداد", body: "تورهای عمومی، بازدید گروهی، نمایشگاه و برنامه‌های روایی در فضاهای تاریخی." },
          { media_id: mid(db, "windows.jpg"), title: "آموزش و پژوهش", body: "دانشنامه مسعودیه، کارگاه دانش‌آموزی و همکاری با پژوهشگران معماری و تاریخ." }
        ]
      }
    }
  ]);

  insertPage(db, {
    slug: "contact",
    title: "ارتباط با ما",
    subtitle: "بازدید و تماس",
    excerpt: "نشانی، دسترسی و فرم درخواست بازدید.",
    hero_media_id: mid(db, "portal.jpg"),
    is_home: 0, show_in_nav: 1, nav_label: "ارتباط با ما", nav_sublabel: "بازدید و تماس",
    nav_order: 6, published: 1, template: "contact"
  }, [
    {
      type: "gallery",
      data: {
        kicker: "مسیر بازدید",
        title: "عمارت در بهارستان",
        items: [
          { media_id: mid(db, "hero.jpg"), caption: "نمای مجموعه از میدان بهارستان" },
          { media_id: mid(db, "courtyard.jpg"), caption: "حیاط اصلی؛ نقطه آغاز تور بازدید" }
        ]
      }
    }
  ]);
}

module.exports = { seed };
