/* The Luttrell — shared page behavior. Settings live in config.js and photos.js. */
(function () {
  "use strict";

  var CFG = window.LUTTRELL || {};
  var PHOTOS = window.LUTTRELL_PHOTOS || [];
  var AVAILABLE = window.LUTTRELL_PHOTOS_AVAILABLE || [];
  var PHOTO_DIR = document.documentElement.getAttribute("data-root") || "";
  PHOTO_DIR += "assets/photos/";

  function $all(sel, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(sel));
  }

  function storageGet(key) {
    try {
      return window.localStorage.getItem(key);
    } catch (e) {
      return null;
    }
  }

  function storageSet(key, value) {
    try {
      window.localStorage.setItem(key, value);
    } catch (e) {
      /* private mode or blocked storage: the banner simply shows again next visit */
    }
  }

  /* ---------- Contact links ---------- */
  function applyLinks() {
    $all('[data-link="apply"]').forEach(function (a) {
      if (CFG.APPLY_URL) a.href = CFG.APPLY_URL;
    });
    $all('[data-link="tour"]').forEach(function (a) {
      if (CFG.TOUR_URL) a.href = CFG.TOUR_URL;
    });
    $all('[data-link="email"]').forEach(function (a) {
      if (!CFG.EMAIL) return;
      a.href = "mailto:" + CFG.EMAIL;
      if (a.hasAttribute("data-show-text")) a.textContent = CFG.EMAIL;
    });
    var phone = (CFG.PHONE || "").trim();
    $all("[data-phone]").forEach(function (el) {
      if (!phone) {
        el.hidden = true;
        return;
      }
      el.hidden = false;
      $all("a", el)
        .concat(el.tagName === "A" ? [el] : [])
        .forEach(function (a) {
          a.href = "tel:" + phone.replace(/[^\d+]/g, "");
        });
      $all("[data-phone-text]", el).forEach(function (t) {
        t.textContent = phone;
      });
    });
  }

  /* ---------- Announcement bar ---------- */
  function announcement() {
    var bar = document.getElementById("announce");
    var a = CFG.ANNOUNCEMENT;
    if (!bar || !a || !a.enabled) return;
    var key = "luttrell-announce-dismissed:" + a.id;
    if (storageGet(key)) return;
    var text = bar.querySelector("[data-announce-text]");
    var link = bar.querySelector("[data-announce-link]");
    if (text) text.textContent = a.text;
    if (link) {
      if (a.href) {
        link.href = (document.documentElement.getAttribute("data-root") || "") + a.href;
        link.textContent = a.linkText || "Learn more";
      } else {
        link.remove();
      }
    }
    bar.hidden = false;
    var close = bar.querySelector("[data-announce-close]");
    if (close) {
      close.addEventListener("click", function () {
        bar.hidden = true;
        storageSet(key, "1");
      });
    }
  }

  /* ---------- Mobile menu ---------- */
  function menu() {
    var btn = document.querySelector("[data-menu-toggle]");
    var nav = document.getElementById("site-nav");
    if (!btn || !nav) return;
    function set(open) {
      btn.setAttribute("aria-expanded", open ? "true" : "false");
      nav.classList.toggle("is-open", open);
      document.body.classList.toggle("menu-open", open);
    }
    btn.addEventListener("click", function () {
      set(btn.getAttribute("aria-expanded") !== "true");
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && btn.getAttribute("aria-expanded") === "true") {
        set(false);
        btn.focus();
      }
    });
    $all("a", nav).forEach(function (a) {
      a.addEventListener("click", function () {
        set(false);
      });
    });
  }

  /* ---------- Photos ---------- */
  function photoById(id) {
    for (var i = 0; i < PHOTOS.length; i++) if (PHOTOS[i].id === id) return PHOTOS[i];
    return null;
  }

  function isAvailable(p) {
    return p && AVAILABLE.indexOf(p.file) !== -1;
  }

  function placeholder(p, id) {
    var div = document.createElement("div");
    div.className = "ph";
    div.setAttribute("role", "img");
    div.setAttribute("aria-label", "Photo coming soon" + (p ? ": " + p.caption : ""));
    var span = document.createElement("span");
    span.className = "ph__label";
    span.textContent = p ? p.file : id;
    div.appendChild(span);
    return div;
  }

  function imageFor(p, opts) {
    var img = document.createElement("img");
    img.src = PHOTO_DIR + p.file;
    img.alt = opts && opts.decorative ? "" : p.alt;
    img.decoding = "async";
    if (!(opts && opts.eager)) img.loading = "lazy";
    return img;
  }

  function fillPhotoSlots() {
    $all("[data-photo]").forEach(function (slot) {
      var id = slot.getAttribute("data-photo");
      var p = photoById(id);
      if (!isAvailable(p) && CFG.SHOW_GALLERY_PLACEHOLDERS === false) {
        slot.hidden = true;
        return;
      }
      var node = isAvailable(p)
        ? imageFor(p, {
            eager: slot.hasAttribute("data-eager"),
            decorative: slot.hasAttribute("data-decorative"),
          })
        : placeholder(p, id);
      slot.appendChild(node);
      slot.classList.add(isAvailable(p) ? "has-photo" : "no-photo");
    });
  }

  /* ---------- Floor plan prices and availability ---------- */
  function fillPlans() {
    var pricing = CFG.PRICING || {};
    var availability = CFG.AVAILABILITY || {};
    $all("[data-plan]").forEach(function (card) {
      var id = card.getAttribute("data-plan");
      var price = pricing[id] || {};
      $all("[data-price]", card).forEach(function (el) {
        var kind = el.getAttribute("data-price");
        var value = price[kind];
        if (value === null) {
          el.textContent = "Not offered";
          el.classList.add("is-muted");
        } else {
          el.textContent = value ? value : "Contact for pricing";
          el.classList.toggle("is-placeholder", !value);
        }
      });
      var slot = card.querySelector("[data-availability]");
      if (slot) {
        var labels = availability[id] || [];
        slot.textContent = "";
        if (!labels.length) labels = ["Contact for availability"];
        labels.forEach(function (label) {
          var li = document.createElement("li");
          li.className = "tag";
          li.textContent = label;
          slot.appendChild(li);
        });
      }
    });
  }

  /* ---------- Gallery + lightbox ---------- */
  function gallery() {
    var root = document.getElementById("gallery");
    if (!root) return;
    var showMissing = CFG.SHOW_GALLERY_PLACEHOLDERS !== false;
    var items = PHOTOS.filter(function (p) {
      return p.gallery !== false && (showMissing || isAvailable(p));
    });
    var shown = [];
    var groups = [];
    items.forEach(function (p) {
      if (groups.indexOf(p.group) === -1) groups.push(p.group);
    });
    groups.forEach(function (g) {
      var section = document.createElement("section");
      section.className = "gallery-group";
      var h = document.createElement("h2");
      h.className = "gallery-group__title";
      h.textContent = g;
      section.appendChild(h);
      var grid = document.createElement("ul");
      grid.className = "gallery-grid";
      items
        .filter(function (p) {
          return p.group === g;
        })
        .forEach(function (p) {
          var li = document.createElement("li");
          li.className = "gallery-grid__item";
          if (isAvailable(p)) {
            var index = shown.length;
            shown.push(p);
            var btn = document.createElement("button");
            btn.type = "button";
            btn.className = "gallery-grid__btn";
            btn.setAttribute("aria-label", "Open photo: " + p.caption);
            btn.appendChild(imageFor(p, { decorative: true }));
            btn.addEventListener("click", function () {
              openLightbox(index, btn);
            });
            li.appendChild(btn);
          } else {
            li.appendChild(placeholder(p, p.id));
          }
          grid.appendChild(li);
        });
      section.appendChild(grid);
      root.appendChild(section);
    });

    var box = document.getElementById("lightbox");
    if (!box) return;
    var img = box.querySelector("img");
    var cap = box.querySelector("figcaption");
    var count = box.querySelector("[data-lightbox-count]");
    var current = 0;
    var opener = null;

    function render() {
      var p = shown[current];
      img.src = PHOTO_DIR + p.file;
      img.alt = p.alt;
      cap.textContent = p.caption;
      if (count) count.textContent = current + 1 + " / " + shown.length;
    }
    function openLightbox(i, from) {
      current = i;
      opener = from;
      render();
      box.hidden = false;
      document.body.classList.add("lightbox-open");
      box.querySelector("[data-lightbox-close]").focus();
    }
    function close() {
      box.hidden = true;
      document.body.classList.remove("lightbox-open");
      if (opener) opener.focus();
    }
    function step(d) {
      current = (current + d + shown.length) % shown.length;
      render();
    }
    box.querySelector("[data-lightbox-close]").addEventListener("click", close);
    box.querySelector("[data-lightbox-prev]").addEventListener("click", function () {
      step(-1);
    });
    box.querySelector("[data-lightbox-next]").addEventListener("click", function () {
      step(1);
    });
    box.addEventListener("click", function (e) {
      if (e.target === box) close();
    });
    document.addEventListener("keydown", function (e) {
      if (box.hidden) return;
      if (e.key === "Escape") close();
      else if (e.key === "ArrowLeft") step(-1);
      else if (e.key === "ArrowRight") step(1);
      else if (e.key === "Tab") {
        // Keep focus inside the dialog.
        var f = $all("button", box);
        var first = f[0];
        var last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    });
    var single = shown.length < 2;
    box.querySelector("[data-lightbox-prev]").hidden = single;
    box.querySelector("[data-lightbox-next]").hidden = single;
  }

  function year() {
    $all("[data-year]").forEach(function (el) {
      el.textContent = String(new Date().getFullYear());
    });
  }

  applyLinks();
  announcement();
  menu();
  fillPhotoSlots();
  fillPlans();
  gallery();
  year();
})();
