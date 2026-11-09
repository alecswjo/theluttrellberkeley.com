// Runs inside the editor's preview frame. Makes marked text editable in place, adds small
// toolbars to list items and photos, and reports everything to the editor window.

(function () {
  // srcdoc frames share the editor's origin, so the two sides call each other directly.
  const post = (msg) => parent.luttrellEditor?.onFrame(msg);
  const HORIZONTAL = { "photos.items": true };
  const NOUN = { "photos.items": "photo", "rooms.plans": "floor plan", "location.walks": "walking time" };

  function button(text, title, onClick, cls) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = cls || "ed-tool";
    b.textContent = text;
    b.title = title;
    b.setAttribute("aria-label", title);
    b.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      onClick();
    });
    return b;
  }

  // innerText would apply CSS (headings are uppercased by text-transform), so read the DOM itself:
  // text as typed, <br> as a line break, paragraphs separated by a blank line.
  function cleanText(el) {
    let out = "";
    const walk = (node) => {
      for (const n of node.childNodes) {
        if (n.nodeType === Node.TEXT_NODE) {
          // Skip the indentation between rendered paragraphs; keep everything typed.
          if (!(/^\s*\n\s*$/.test(n.data) && n.parentNode === el && el.querySelector("p"))) out += n.data;
        } else if (n.nodeName === "BR") out += "\n";
        else if (n.nodeType === Node.ELEMENT_NODE && !n.matches(".ed-tools, .ed-media-btn")) {
          const block = /^(P|DIV)$/.test(n.nodeName);
          if (block && out && !out.endsWith("\n")) out += "\n";
          walk(n);
          if (block) out += "\n\n";
        }
      }
    };
    walk(el);
    return out.replace(/ /g, " ").replace(/\n{3,}/g, "\n\n").replace(/^\n+|\s+$/g, "");
  }

  function init() {
    document.documentElement.classList.add("ed");
    document.querySelectorAll(".reveal").forEach((el) => el.classList.add("is-in"));

    document.querySelectorAll("[data-edit]").forEach((el) => {
      el.setAttribute("contenteditable", "plaintext-only");
      el.spellcheck = true;
      const multiline = el.hasAttribute("data-ml");
      el.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !multiline) {
          e.preventDefault();
          el.blur();
        }
        if (e.key === "Escape") el.blur();
      });
      el.addEventListener("input", () => post({ type: "text", path: el.dataset.edit, value: cleanText(el) }));
      el.addEventListener("focus", () => post({ type: "focus", path: el.dataset.edit }));
      el.addEventListener("click", (e) => e.preventDefault());
    });

    document.querySelectorAll("[data-media]").forEach((el) => {
      const isVideo = el.dataset.media === "hero";
      const b = button(isVideo ? "Change video" : "Change photo", isVideo ? "Change the video" : "Change this photo", () =>
        post({ type: "media", path: el.dataset.media }),
      "ed-media-btn");
      el.append(b);
      el.addEventListener("click", (e) => {
        if (e.target.closest("[data-edit], .ed-tools, button")) return;
        e.preventDefault();
        post({ type: "media", path: el.dataset.media });
      });
    });

    document.querySelectorAll("[data-item]").forEach((el) => {
      const list = el.dataset.item;
      const i = +el.dataset.index;
      const count = document.querySelectorAll(`[data-item="${CSS.escape(list)}"]`).length;
      const noun = NOUN[list] || "price";
      const bar = document.createElement("div");
      bar.className = "ed-tools";
      const [back, fwd] = HORIZONTAL[list] ? ["←", "→"] : ["↑", "↓"];
      if (i > 0) bar.append(button(back, `Move this ${noun} ${HORIZONTAL[list] ? "left" : "up"}`, () => post({ type: "item", list, index: i, op: "up" })));
      if (i < count - 1) bar.append(button(fwd, `Move this ${noun} ${HORIZONTAL[list] ? "right" : "down"}`, () => post({ type: "item", list, index: i, op: "down" })));
      bar.append(button("Copy", `Make a copy of this ${noun}`, () => post({ type: "item", list, index: i, op: "duplicate" })));
      bar.append(button("Remove", `Remove this ${noun}`, () => post({ type: "item", list, index: i, op: "remove", noun }), "ed-tool ed-danger"));
      el.prepend(bar);
      el.addEventListener("mouseover", (e) => {
        e.stopPropagation();
        document.querySelectorAll(".ed-hover").forEach((x) => x !== el && x.classList.remove("ed-hover"));
        el.classList.add("ed-hover");
      });
      el.addEventListener("mouseleave", () => el.classList.remove("ed-hover"));
    });

    document.querySelectorAll("[data-add]").forEach((el) =>
      el.addEventListener("click", (e) => {
        e.preventDefault();
        post({ type: "add", list: el.dataset.add });
      }),
    );
    document.querySelectorAll("[data-status-for]").forEach((el) =>
      el.addEventListener("click", (e) => {
        e.preventDefault();
        post({ type: "status", path: el.dataset.statusFor });
      }),
    );
  }

  // Links and the inquiry form do nothing while editing.
  document.addEventListener("click", (e) => {
    const a = e.target.closest("a");
    if (a) e.preventDefault();
  }, true);
  document.addEventListener("submit", (e) => e.preventDefault(), true);

  document.addEventListener("keydown", (e) => {
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.key.toLowerCase() === "z") {
      e.preventDefault();
      post({ type: e.shiftKey ? "redo" : "undo" });
    } else if (mod && e.key.toLowerCase() === "y") {
      e.preventDefault();
      post({ type: "redo" });
    }
  });

  const header = () => document.querySelector("[data-header]");
  window.addEventListener("scroll", () => {
    const hero = document.querySelector(".hero");
    header()?.classList.toggle("is-solid", window.scrollY > (hero ? hero.offsetHeight - 80 : 40));
  }, { passive: true });

  window.luttrellFrame = {
    swap(html) {
      const doc = new DOMParser().parseFromString(html, "text/html");
      const y = window.scrollY;
      document.body.replaceChildren(...doc.body.childNodes);
      init();
      window.scrollTo(0, y);
    },
    select(path) {
      document.querySelectorAll(".ed-selected").forEach((x) => x.classList.remove("ed-selected"));
      if (path) document.querySelector(`[data-media="${CSS.escape(path)}"], [data-status-for="${CSS.escape(path)}"]`)?.classList.add("ed-selected");
    },
    focus(path) {
      const el = document.querySelector(`[data-edit="${CSS.escape(path)}"]`);
      if (!el) return;
      el.scrollIntoView({ block: "center" });
      el.focus();
      const range = document.createRange();
      range.selectNodeContents(el);
      getSelection().removeAllRanges();
      getSelection().addRange(range);
    },
    reveal(path) {
      document.querySelector(`[data-media="${CSS.escape(path)}"], [data-edit="${CSS.escape(path)}"], [data-status-for="${CSS.escape(path)}"]`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    },
  };

  init();
  post({ type: "ready" });
})();
