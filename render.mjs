// Renders the one-page site from content.json. The same module runs in three places:
// build.mjs (Node), the publish API (Cloudflare Pages Functions) and the editor preview (browser),
// so the preview and the live page always come out of identical markup.

const TILTS = [-2.5, 2, -1.5, 1.5, -2, 2.5];

export const STATUS_PRESETS = ["Available", "Few left", "Waitlist", "Leased for Fall 2027"];

function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Text with line breaks kept; blank lines become separate paragraphs where `paragraphs` is set.
function lines(value) {
  return esc(value).replace(/\n/g, "<br>");
}

function paragraphs(value, attrs) {
  const parts = String(value ?? "").split(/\n\s*\n/).filter((p) => p.trim() !== "");
  if (parts.length === 0) parts.push("");
  return parts.map((p) => `<p${attrs}>${lines(p.trim())}</p>`).join("\n");
}

function statusTone(label) {
  const l = label.toLowerCase();
  if (l.startsWith("leased") || l.startsWith("full") || l.startsWith("sold")) return " is-muted";
  if (l.startsWith("available")) return " is-open";
  return "";
}

export function renderPage(c, opts = {}) {
  const edit = Boolean(opts.edit);
  const asset = opts.asset || ((src) => src);
  const t = (path, multiline) => (edit ? ` data-edit="${path}"${multiline ? " data-ml" : ""}` : "");
  const m = (path) => (edit ? ` data-media="${path}"` : "");
  const item = (list, i) => (edit ? ` data-item="${list}" data-index="${i}"` : "");
  const add = (list, label) => (edit ? `<button type="button" class="ed-add" data-add="${list}">+ ${esc(label)}</button>` : "");
  const focus = (img) => (img.focus && img.focus !== "50% 50%" ? ` style="object-position:${esc(img.focus)}"` : "");
  const email = c.footer.email;

  const plans = c.rooms.plans
    .map((p, i) => {
      const base = `rooms.plans.${i}`;
      const prices = p.prices
        .map(
          (r, j) =>
            `<div${item(`${base}.prices`, j)}><dt${t(`${base}.prices.${j}.label`)}>${esc(r.label)}</dt><dd><span${t(`${base}.prices.${j}.price`)}>${esc(r.price)}</span>${
              r.unit || edit ? ` <small${t(`${base}.prices.${j}.unit`)}>${esc(r.unit)}</small>` : ""
            }</dd></div>`,
        )
        .join("\n              ");
      const status = p.status
        ? `<p class="plan-status${statusTone(p.status)}"${edit ? ` data-status-for="${base}"` : ""}>${esc(p.status)}</p>`
        : edit
          ? `<button type="button" class="ed-status-add" data-status-for="${base}">+ Availability label</button>`
          : "";
      const img = p.image;
      return `        <li class="plan${p.wide ? " plan-house" : ""} reveal"${item("rooms.plans", i)}>
          <div class="plan-info">
            <p class="plan-num"${t(`${base}.num`)}>${esc(p.num)}</p>
            <h3${t(`${base}.name`)}>${esc(p.name)}</h3>
            ${status}
            <p class="plan-spec"${t(`${base}.spec`)}>${esc(p.spec)}</p>
            <dl class="plan-prices">
              ${prices}
            </dl>
            ${add(`${base}.prices`, "Add price")}
          </div>
          <figure class="plan-drawing"${m(`${base}.image`)}><a href="${esc(asset(img.src))}" target="_blank" rel="noopener" aria-label="Open floor plan full size"><img src="${esc(asset(img.src))}" alt="${esc(img.alt)}" width="${img.width}" height="${img.height}" loading="lazy"></a></figure>
        </li>`;
    })
    .join("\n");

  const photos = c.photos.items
    .map(
      (ph, i) => `      <figure class="snap reveal" style="--tilt:${TILTS[i % TILTS.length]}deg"${item("photos.items", i)}${m(`photos.items.${i}`)}>
        <img src="${esc(asset(ph.src))}" alt="${esc(ph.alt)}" width="${ph.width}" height="${ph.height}" loading="lazy"${focus(ph)}>
        <figcaption${t(`photos.items.${i}.caption`)}>${esc(ph.caption)}</figcaption>
      </figure>`,
    )
    .join("\n");

  const walks = c.location.walks
    .map(
      (w, i) =>
        `<li${item("location.walks", i)}><span${t(`location.walks.${i}.place`)}>${esc(w.place)}</span><i></i><b${t(`location.walks.${i}.time`)}>${esc(w.time)}</b></li>`,
    )
    .join("\n          ");

  const intro = c.intro.image;
  const loc = c.location.image;
  const hero = c.hero;

  return `<!doctype html>
<html lang="en" data-design="postcard">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${opts.head || ""}<title>${esc(c.seo.title)}</title>
<meta name="description" content="${esc(c.seo.description)}">
<link rel="icon" href="assets/favicon.svg" type="image/svg+xml">
<link rel="icon" href="assets/favicon-32.png" sizes="32x32" type="image/png">
<link rel="apple-touch-icon" href="assets/apple-touch-icon.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600;700&family=Barlow+Semi+Condensed:ital,wght@0,400;0,500;1,400&family=Mrs+Saint+Delafield&display=swap" rel="stylesheet">
<link rel="preload" as="image" href="${esc(asset(hero.poster))}">
<link rel="stylesheet" href="styles.css">
</head>
<body>
<header class="site-header" data-header>
  <a class="brand" href="#top" aria-label="The Luttrell, back to top">
    <img class="brand-mark" src="assets/emblem-mark.svg" alt="" width="26" height="36">
    <span class="brand-name">The Luttrell</span>
  </a>
  <a class="btn-inquire" href="#inquire">Inquire</a>
</header>

<main id="top">
  <!-- HERO -->
  <section class="hero wavy-bottom" aria-labelledby="hero-title">
    <div class="hero-media" role="img" aria-label="${esc(hero.alt)}"${m("hero")}>
      <video autoplay muted loop playsinline preload="auto" poster="${esc(asset(hero.poster))}" aria-hidden="true" data-hero-video>
        <source src="${esc(asset(hero.video))}" type="video/mp4">
      </video>
    </div>
    <div class="hero-wash" aria-hidden="true"></div>
    <div class="hero-center">
      <img class="hero-emblem" src="assets/emblem-light.svg" alt="" width="200" height="280">
      <h1 id="hero-title" class="visually-hidden">The Luttrell</h1>
      <p class="hero-line"><span class="script"${t("hero.script")}>${esc(hero.script)}</span><span class="caps"${t("hero.caps")}>${esc(hero.caps)}</span></p>
    </div>
  </section>

  <!-- INTRO -->
  <section class="intro wrap" aria-labelledby="intro-title">
    <div class="intro-grid">
      <div class="intro-copy">
        <p class="kicker reveal"${t("intro.kicker")}>${esc(c.intro.kicker)}</p>
        <h2 id="intro-title" class="display reveal"${t("intro.headline", true)}>${lines(c.intro.headline)}</h2>
        <div class="reveal"${t("intro.body", true)}>
          ${paragraphs(c.intro.body, "")}
        </div>
      </div>
      <figure class="snap snap-postcard reveal" style="--tilt:3deg"${m("intro.image")}>
        <img src="${esc(asset(intro.src))}" alt="${esc(intro.alt)}" width="${intro.width}" height="${intro.height}" loading="lazy"${focus(intro)}>
        <figcaption class="script"${t("intro.caption")}>${esc(c.intro.caption)}</figcaption>
      </figure>
    </div>
  </section>

  <!-- ROOMS -->
  <section class="rooms band wavy" id="rooms" aria-labelledby="rooms-title">
    <div class="wrap">
      <header class="section-head reveal">
        <h2 id="rooms-title" class="display"${t("rooms.heading")}>${esc(c.rooms.heading)}</h2>
        <div${t("rooms.body", true)}>${paragraphs(c.rooms.body, "")}</div>
      </header>

      <ol class="plans">
${plans}
      </ol>
      ${add("rooms.plans", "Add floor plan")}
      <p class="rooms-note reveal"${t("rooms.note", true)}>${lines(c.rooms.note)}</p>
      <p class="rooms-foot reveal"><a href="#inquire"${t("rooms.link")}>${esc(c.rooms.link)}</a></p>
    </div>
  </section>

  <!-- PHOTOS -->
  <section class="photos wrap" aria-labelledby="photos-title">
    <h2 id="photos-title" class="display reveal"${t("photos.heading")}>${esc(c.photos.heading)}</h2>
    <div class="snaps">
${photos}
    </div>
    ${add("photos.items", "Add photo")}
  </section>

  <!-- LOCATION -->
  <section class="location wrap" aria-labelledby="loc-title">
    <div class="loc-grid">
      <div>
        <h2 id="loc-title" class="display reveal"${t("location.heading", true)}>${lines(c.location.heading)}</h2>
        <p class="reveal"${t("location.lead", true)}>${lines(c.location.lead)}</p>
        <ul class="walks reveal">
          ${walks}
        </ul>
        ${add("location.walks", "Add walking time")}
        <a class="link-wave reveal" href="https://www.google.com/maps/search/?api=1&amp;query=2328+Channing+Way%2C+Berkeley%2C+CA+94704" target="_blank" rel="noopener">Open in Google Maps</a>
      </div>
      <figure class="engraving reveal"${m("location.image")}>
        <img src="${esc(asset(loc.src))}" alt="${esc(loc.alt)}" width="${loc.width}" height="${loc.height}" loading="lazy">
      </figure>
    </div>
  </section>

  <!-- INQUIRE -->
  <section class="inquire band band-accent wavy" id="inquire" aria-labelledby="inq-title">
    <div class="wrap inquire-wrap">
      <header class="section-head center reveal">
        <img class="inq-emblem" src="assets/emblem-mark.svg" alt="" width="40" height="56">
        <h2 id="inq-title" class="display"${t("inquire.heading")}>${esc(c.inquire.heading)}</h2>
        <p${t("inquire.body", true)}>${lines(c.inquire.body)}</p>
      </header>
      <form class="form reveal" data-inquiry novalidate>
        <div class="field">
          <label for="f-name">Name <span aria-hidden="true">*</span></label>
          <input id="f-name" name="name" type="text" autocomplete="name" required>
        </div>
        <div class="field">
          <label for="f-email">Email <span aria-hidden="true">*</span></label>
          <input id="f-email" name="email" type="email" autocomplete="email" required>
        </div>
        <div class="field">
          <label for="f-phone">Phone <em>optional</em></label>
          <input id="f-phone" name="phone" type="tel" autocomplete="tel">
        </div>
        <fieldset class="field choice full">
          <legend>Term <span aria-hidden="true">*</span></legend>
          <label><input type="radio" name="term" value="Spring 2027" required> Spring 2027</label>
          <label><input type="radio" name="term" value="Fall 2027"> Fall 2027</label>
          <label><input type="radio" name="term" value="Not sure"> Not sure</label>
        </fieldset>
        <fieldset class="field choice full">
          <legend>Room</legend>
          <label><input type="radio" name="room" value="private"> Private</label>
          <label><input type="radio" name="room" value="shared"> Shared</label>
          <label><input type="radio" name="room" value="either" checked> Either</label>
        </fieldset>
        <div class="field full">
          <label for="f-message">Message <em>optional</em></label>
          <textarea id="f-message" name="message" rows="4"></textarea>
        </div>
        <div class="hp" aria-hidden="true">
          <label for="f-website">Website</label>
          <input id="f-website" name="website" type="text" tabindex="-1" autocomplete="off">
        </div>
        <div class="form-foot full">
          <button type="submit">Send inquiry</button>
          <p class="status" data-status aria-live="polite"></p>
        </div>
      </form>
    </div>
  </section>
</main>

<footer class="site-footer">
  <div class="wrap footer-grid">
    <img class="foot-emblem" src="assets/emblem.svg" alt="The Luttrell, Berkeley" width="110" height="154" loading="lazy">
    <div>
      <p class="foot-name">The Luttrell</p>
      <p${t("footer.address", true)}>${lines(c.footer.address)}</p>
      <p><a href="mailto:${esc(email)}"${t("footer.email")}>${esc(email)}</a></p>
    </div>
  </div>
</footer>

${opts.scripts ?? `<script src="contact.js"></script>\n<script src="site.js"></script>`}
</body>
</html>
`;
}
