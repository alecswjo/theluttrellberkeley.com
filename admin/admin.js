import { renderPage, STATUS_PRESETS } from "/render.mjs";
import { describeChanges, get, label, rebase, set } from "/admin/changes.js";
import { processPhoto, processVideo, probeVideo, videoSupported } from "/admin/media.js";

// The public site has a copy of these files too; the editor only works on the admin host.
if (/^(www\.)?theluttrellberkeley\.com$/.test(location.hostname)) location.replace("https://admin.theluttrellberkeley.com/admin/");

const $ = (sel, root = document) => root.querySelector(sel);
const clone = (v) => structuredClone(v);
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// Small DOM builder. Text always goes in as text, never as HTML (inquiries are typed by strangers).
function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === false || v == null) continue;
    if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else if (k === "class") el.className = v;
    else if (k in el && k !== "list") el[k] = v;
    else el.setAttribute(k, v === true ? "" : v);
  }
  for (const c of children.flat()) if (c != null && c !== false) el.append(c instanceof Node ? c : String(c));
  return el;
}

/* ---------- server ---------- */

async function api(method, path, body) {
  const res = await fetch(`/api${path}`, {
    method,
    credentials: "same-origin",
    headers: method === "GET" ? {} : { "content-type": "application/json" },
    body: method === "GET" ? undefined : JSON.stringify(body || {}),
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && path !== "/login") {
    showSignIn(path === "/session" ? "" : "You've been signed out. Please sign in again.");
    throw Object.assign(new Error("signed out"), { quiet: true });
  }
  if (!res.ok) throw Object.assign(new Error(data.error || "Something went wrong."), { status: res.status, data });
  return data;
}

/* ---------- photos and videos waiting to be published (kept in this browser) ---------- */

const uploads = new Map(); // "assets/uploads/x.webp" -> { blob, url }
let dbp;
function db() {
  dbp ??= new Promise((resolve, reject) => {
    const req = indexedDB.open("luttrell-editor", 1);
    req.onupgradeneeded = () => req.result.createObjectStore("uploads");
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}
async function idb(mode, fn) {
  const d = await db();
  return new Promise((resolve, reject) => {
    const tx = d.transaction("uploads", mode);
    const out = fn(tx.objectStore("uploads"));
    tx.oncomplete = () => resolve(out?.result);
    tx.onerror = () => reject(tx.error);
  });
}
async function keepUpload(path, blob) {
  uploads.set(path, { blob, url: URL.createObjectURL(blob) });
  await idb("readwrite", (s) => s.put(blob, path)).catch(() => {});
}
async function loadUploads() {
  try {
    const d = await db();
    await new Promise((resolve) => {
      const req = d.transaction("uploads").objectStore("uploads").openCursor();
      req.onsuccess = () => {
        const cur = req.result;
        if (!cur) return resolve();
        uploads.set(cur.key, { blob: cur.value, url: URL.createObjectURL(cur.value) });
        cur.continue();
      };
      req.onerror = () => resolve();
    });
  } catch {}
}
function uploadPaths(content) {
  const found = new Set();
  JSON.stringify(content, (k, v) => {
    if (typeof v === "string" && v.startsWith("assets/uploads/")) found.add(v);
    return v;
  });
  return found;
}
async function forgetUnusedUploads() {
  const keep = new Set([...uploadPaths(state.draft), ...uploadPaths(state.base)]);
  for (const path of [...uploads.keys()]) {
    if (keep.has(path)) continue;
    URL.revokeObjectURL(uploads.get(path).url);
    uploads.delete(path);
    await idb("readwrite", (s) => s.delete(path)).catch(() => {});
  }
}
const asset = (src) => uploads.get(src)?.url || src;
// The editor page lives at /admin/, so site paths in its own panels need a leading slash.
const panelAsset = (src) => uploads.get(src)?.url || `/${src}`;

/* ---------- draft state ---------- */

const DRAFT_KEY = "luttrell-editor-draft";
const state = {
  base: null, // what the website shows now
  version: null, // content.json version the base came from
  draft: null,
  editor: localStorage.getItem("luttrell-editor-name") || "",
  undo: [],
  redo: [],
  lastKey: null,
  lastAt: 0,
  panel: null,
  device: "desktop",
  frameReady: false,
};

function saveDraft() {
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ version: state.version, base: state.base, draft: state.draft }));
  } catch {}
  updateBar();
}

function readDraft() {
  try {
    return JSON.parse(localStorage.getItem(DRAFT_KEY) || "null");
  } catch {
    return null;
  }
}

// Call before every change. Typing in one field coalesces into a single undo step.
function remember(key) {
  const now = Date.now();
  if (key && key === state.lastKey && now - state.lastAt < 1500) {
    state.lastAt = now;
    return;
  }
  state.undo.push(JSON.stringify(state.draft));
  if (state.undo.length > 150) state.undo.shift();
  state.redo = [];
  state.lastKey = key;
  state.lastAt = now;
}

function change(fn, { key, rerender = true } = {}) {
  remember(key);
  fn(state.draft);
  saveDraft();
  if (rerender) renderFrame();
  refreshPanel();
}

function undo() {
  if (!state.undo.length) return;
  state.redo.push(JSON.stringify(state.draft));
  state.draft = JSON.parse(state.undo.pop());
  state.lastKey = null;
  saveDraft();
  renderFrame();
  refreshPanel();
}

function redo() {
  if (!state.redo.length) return;
  state.undo.push(JSON.stringify(state.draft));
  state.draft = JSON.parse(state.redo.pop());
  state.lastKey = null;
  saveDraft();
  renderFrame();
  refreshPanel();
}

function changes() {
  return describeChanges(state.base, state.draft);
}

/* ---------- preview frame ---------- */

const frame = () => $("#preview");

// srcdoc frames resolve relative URLs against /admin/ before <base> applies, so make them root-absolute.
const rooted = (html) => html.replace(/(src|href|poster)="(?!\/|https?:|blob:|#|mailto:)/g, '$1="/');

function frameHtml() {
  return rooted(renderPage(state.draft, {
    edit: true,
    asset,
    head: '<base href="/">\n<link rel="stylesheet" href="/admin/frame.css">\n',
    scripts: '<script src="/admin/frame.js"></script>',
  }));
}

function renderFrame() {
  const win = frame().contentWindow;
  if (state.frameReady && win?.luttrellFrame) win.luttrellFrame.swap(frameHtml());
  else {
    state.frameReady = false;
    frame().srcdoc = frameHtml();
  }
  if (state.panel) setTimeout(() => frame().contentWindow?.luttrellFrame?.select(state.panel.path), 0);
}

const frameCall = (fn, ...args) => frame().contentWindow?.luttrellFrame?.[fn]?.(...args);

window.luttrellEditor = {
  onFrame(msg) {
    switch (msg.type) {
      case "ready":
        state.frameReady = true;
        if (state.panel) frameCall("select", state.panel.path);
        break;
      case "text":
        change((d) => set(d, msg.path, msg.value), { key: `text:${msg.path}`, rerender: false });
        break;
      case "media":
        openPanel(msg.path === "hero" ? "video" : "photo", msg.path);
        break;
      case "status":
        openPanel("status", msg.path);
        break;
      case "item":
        listOp(msg.list, msg.index, msg.op, msg.noun);
        break;
      case "add":
        addItem(msg.list);
        break;
      case "undo":
        undo();
        break;
      case "redo":
        redo();
        break;
    }
  },
};

/* ---------- lists ---------- */

const MIN_ITEMS = { "rooms.plans": 1, "photos.items": 1, "location.walks": 1 };

function listOp(list, index, op, noun = "item") {
  const items = get(state.draft, list);
  if (op === "remove" && items.length <= (MIN_ITEMS[list] || 0)) {
    toast(`The page needs at least one ${noun}. Change this one instead.`);
    return;
  }
  change(() => {
    if (op === "up" && index > 0) [items[index - 1], items[index]] = [items[index], items[index - 1]];
    if (op === "down" && index < items.length - 1) [items[index + 1], items[index]] = [items[index], items[index + 1]];
    if (op === "duplicate") items.splice(index + 1, 0, clone(items[index]));
    if (op === "remove") items.splice(index, 1);
  });
  if (op === "remove") {
    closePanel();
    toast(`Removed the ${noun}.`, { action: "Undo", onAction: undo });
  }
}

async function addItem(list) {
  if (list === "photos.items") {
    const file = await pickFile("image/*,.heic,.heif");
    if (!file) return;
    const done = busy("Preparing the photo…");
    try {
      const p = await processPhoto(file, 1800);
      await keepUpload(p.path, p.blob);
      const index = state.draft.photos.items.length;
      change((d) => d.photos.items.push({ src: p.path, alt: "", width: p.width, height: p.height, caption: "New photo" }));
      openPanel("photo", `photos.items.${index}`);
      setTimeout(() => frameCall("reveal", `photos.items.${index}`), 50);
      if (p.sourceWidth < 1000) toast("This photo is small, so it may look blurry. A larger original works better.");
    } catch (err) {
      toast(err.message);
    } finally {
      done();
    }
    return;
  }
  let focusPath;
  change((d) => {
    const items = get(d, list);
    if (list === "location.walks") {
      items.push({ place: "Place", time: "0 min" });
      focusPath = `${list}.${items.length - 1}.place`;
    } else if (list === "rooms.plans") {
      const last = items[items.length - 1];
      items.push({ ...clone(last), num: `No. ${items.length + 1}`, name: "New floor plan", status: "", wide: false });
      focusPath = `${list}.${items.length - 1}.name`;
    } else {
      items.push({ label: "Price name", price: "$", unit: "" });
      focusPath = `${list}.${items.length - 1}.label`;
    }
  });
  setTimeout(() => frameCall("focus", focusPath), 50);
  if (list === "rooms.plans") toast("Added a floor plan. Change its name and prices, then click its drawing to replace it.");
}

/* ---------- side panel ---------- */

function openPanel(kind, path) {
  state.panel = { kind, path };
  refreshPanel();
  frameCall("select", path);
  // The panel narrows the preview and the page reflows, so bring the chosen item back into view.
  if (kind !== "settings") setTimeout(() => frameCall("reveal", path), 80);
}

function closePanel() {
  state.panel = null;
  $("#panel").hidden = true;
  $("#panel").replaceChildren();
  frameCall("select", null);
}

function panelShell(title, ...body) {
  return [
    h("div", { class: "panel-head" }, h("h2", {}, title), h("button", { class: "icon-btn", type: "button", "aria-label": "Close", onclick: closePanel }, "✕")),
    h("div", { class: "panel-body" }, ...body),
  ];
}

function field(labelText, input, hint) {
  return h("label", { class: "field" }, h("span", { class: "field-label" }, labelText), input, hint ? h("span", { class: "hint" }, hint) : null);
}

function textInput(path, { multiline = false, max } = {}) {
  const value = get(state.draft, path) ?? "";
  const counter = max ? h("span", { class: "counter" }) : null;
  const update = (v) => {
    if (counter) {
      counter.textContent = `${v.length} / ${max}`;
      counter.classList.toggle("over", v.length > max);
    }
  };
  const el = h(multiline ? "textarea" : "input", {
    value,
    rows: multiline ? 3 : undefined,
    oninput: (e) => {
      update(e.target.value);
      change((d) => set(d, path, e.target.value), { key: `text:${path}`, rerender: path.startsWith("seo.") ? false : true });
    },
  });
  update(value);
  return counter ? h("div", { class: "with-counter" }, el, counter) : el;
}

function refreshPanel() {
  const panel = $("#panel");
  const p = state.panel;
  if (!p) return;
  const active = document.activeElement;
  if (panel.contains(active) && (active.tagName === "INPUT" || active.tagName === "TEXTAREA") && active.type !== "radio") return;
  let content;
  if (p.kind === "photo") content = photoPanel(p.path);
  else if (p.kind === "video") content = videoPanel();
  else if (p.kind === "status") content = statusPanel(p.path);
  else if (p.kind === "settings") content = settingsPanel();
  if (!content) return closePanel();
  panel.replaceChildren(...content);
  panel.hidden = false;
}

const FOCUSABLE = (path) => path.startsWith("photos.items.") || path === "intro.image";
const MAX_EDGE = (path) => (path.startsWith("rooms.plans") ? 2000 : path === "location.image" ? 1400 : 1800);

function photoPanel(path) {
  const img = get(state.draft, path);
  if (!img) return null;
  const input = h("input", { type: "file", accept: "image/*,.heic,.heif", hidden: true, onchange: (e) => replacePhoto(path, e.target.files[0]) });
  const [fx, fy] = (img.focus || "50% 50%").split(" ").map(parseFloat);
  const dot = h("span", { class: "focus-dot", style: `left:${fx}%;top:${fy}%` });
  const thumb = h(
    "div",
    {
      class: `thumb${FOCUSABLE(path) ? " can-focus" : ""}`,
      onclick: (e) => {
        if (!FOCUSABLE(path)) return;
        const r = e.currentTarget.getBoundingClientRect();
        const x = Math.round(((e.clientX - r.left) / r.width) * 100);
        const y = Math.round(((e.clientY - r.top) / r.height) * 100);
        change((d) => (get(d, path).focus = `${x}% ${y}%`), { key: `focus:${path}` });
      },
    },
    h("img", { src: panelAsset(img.src), alt: "" }),
    FOCUSABLE(path) ? dot : null,
  );
  const drop = h(
    "div",
    {
      class: "drop",
      ondragover: (e) => {
        e.preventDefault();
        e.currentTarget.classList.add("over");
      },
      ondragleave: (e) => e.currentTarget.classList.remove("over"),
      ondrop: (e) => {
        e.preventDefault();
        e.currentTarget.classList.remove("over");
        if (e.dataTransfer.files[0]) replacePhoto(path, e.dataTransfer.files[0]);
      },
    },
    thumb,
    h("button", { class: "btn", type: "button", onclick: () => input.click() }, "Replace photo…"),
    h("span", { class: "hint" }, "Or drag a photo here. iPhone photos work too."),
    input,
  );
  return panelShell(
    label(path, state.draft).replace(/ › (photo|drawing)$/, ""),
    drop,
    FOCUSABLE(path) ? h("p", { class: "hint" }, "Click the picture to choose which part stays in view when it's trimmed to fit.") : null,
    field("Describe this photo", textInput(`${path}.alt`, { multiline: true }), "One sentence about what's in it. Google and screen readers use this."),
    path.startsWith("photos.items.")
      ? h("button", { class: "btn btn-danger", type: "button", onclick: () => listOp("photos.items", +path.split(".")[2], "remove", "photo") }, "Remove this photo")
      : null,
  );
}

async function replacePhoto(path, file) {
  if (!file) return;
  const done = busy("Preparing the photo…");
  try {
    const p = await processPhoto(file, MAX_EDGE(path));
    await keepUpload(p.path, p.blob);
    change((d) => {
      const img = get(d, path);
      Object.assign(img, { src: p.path, width: p.width, height: p.height });
      delete img.focus;
    });
    if (p.sourceWidth < 1000) toast("This photo is small, so it may look blurry. A larger original works better.");
    else toast("Photo replaced. It goes live when you publish.");
  } catch (err) {
    toast(err.message || "That photo couldn't be used.");
  } finally {
    done();
  }
}

function videoPanel() {
  const hero = state.draft.hero;
  const input = h("input", { type: "file", accept: "video/*,.mov,.mp4", hidden: true, onchange: (e) => chooseVideo(e.target.files[0]) });
  return panelShell(
    "Top video",
    h("video", { class: "thumb-video", src: panelAsset(hero.video), poster: panelAsset(hero.poster), muted: true, autoplay: true, loop: true, playsInline: true }),
    videoSupported()
      ? h("div", { class: "stack" }, h("button", { class: "btn", type: "button", onclick: () => input.click() }, "Replace video…"), h("span", { class: "hint" }, "Any phone video works. You'll pick up to 15 seconds; sound is removed."), input)
      : h("p", { class: "hint warn" }, "To change the video, open this page in Chrome or Safari."),
    h("div", { id: "video-trim" }),
    field("Describe the video", textInput("hero.alt", { multiline: true }), "What the video shows, in one sentence."),
  );
}

async function chooseVideo(file) {
  if (!file) return;
  const box = $("#video-trim");
  let info;
  try {
    info = await probeVideo(file);
  } catch (err) {
    return toast(err.message);
  }
  const maxLen = Math.min(15, info.duration);
  const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
  const preview = h("video", { class: "thumb-video", src: info.url, muted: true, playsInline: true, autoplay: true });
  const range = h("input", { type: "range", min: 0, max: Math.max(0, info.duration - maxLen), step: 0.1, value: 0 });
  const readout = h("span", { class: "hint" });
  const showRange = () => {
    const s = +range.value;
    readout.textContent = `Using ${fmt(s)} to ${fmt(s + maxLen)} of ${fmt(info.duration)}`;
    preview.currentTime = s;
  };
  range.oninput = showRange;
  preview.ontimeupdate = () => {
    if (preview.currentTime > +range.value + maxLen) preview.currentTime = +range.value;
  };
  const bar = h("progress", { max: 1, value: 0, hidden: true });
  const go = h("button", { class: "btn primary", type: "button" }, "Use this video");
  go.onclick = async () => {
    go.disabled = true;
    bar.hidden = false;
    go.textContent = "Converting… keep this tab open";
    try {
      const start = +range.value;
      const out = await processVideo(file, { start, end: start + maxLen, onProgress: (p) => (bar.value = p) });
      await keepUpload(out.path, out.blob);
      await keepUpload(out.poster.path, out.poster.blob);
      URL.revokeObjectURL(info.url);
      change((d) => Object.assign(d.hero, { video: out.path, poster: out.poster.path }));
      box.replaceChildren();
      toast("Video replaced. It goes live when you publish.");
    } catch (err) {
      console.error(err);
      toast(err.message || "That video couldn't be converted.");
      go.disabled = false;
      go.textContent = "Use this video";
      bar.hidden = true;
    }
  };
  box.replaceChildren(h("div", { class: "trim" }, preview, info.duration > maxLen ? field("Which part?", range) : null, readout, bar, go));
  showRange();
}

function statusPanel(path) {
  const plan = get(state.draft, path);
  if (!plan) return null;
  const current = plan.status;
  const isPreset = current === "" || STATUS_PRESETS.includes(current);
  const setStatus = (v) => change((d) => (get(d, path).status = v), { key: `status:${path}` });
  const option = (value, text) =>
    h("label", { class: "choice" }, h("input", { type: "radio", name: "status", checked: current === value && isPreset, onchange: () => setStatus(value) }), text);
  const custom = h("input", {
    type: "text",
    placeholder: "e.g. 2 rooms left for Fall",
    value: isPreset ? "" : current,
    oninput: (e) => setStatus(e.target.value),
    onfocus: () => {
      if (isPreset) setStatus(custom.value || "Custom label");
    },
  });
  return panelShell(
    `${plan.name}: availability`,
    h("p", { class: "hint" }, "A small stamp next to the floor plan name."),
    h("div", { class: "choices" }, option("", "No label"), STATUS_PRESETS.map((s) => option(s, s)),
      h("label", { class: "choice" }, h("input", { type: "radio", name: "status", checked: !isPreset, onchange: () => setStatus(custom.value || "Custom label") }), "Your own words")),
    field("Label text", custom),
  );
}

function settingsPanel() {
  const seo = state.draft.seo;
  return panelShell(
    "Google & sharing",
    h("p", { class: "hint" }, "How the website appears in Google results and when someone shares the link."),
    field("Page title", textInput("seo.title", { max: 65 }), "Shown as the blue link on Google."),
    field("Description", textInput("seo.description", { multiline: true, max: 160 }), "Shown under the title. One or two sentences."),
    h("div", { class: "serp" }, h("span", { class: "serp-url" }, "theluttrellberkeley.com"), h("span", { class: "serp-title" }, seo.title), h("span", { class: "serp-desc" }, seo.description)),
  );
}

function pickFile(accept) {
  return new Promise((resolve) => {
    const input = h("input", { type: "file", accept, onchange: () => resolve(input.files[0] || null) });
    input.addEventListener("cancel", () => resolve(null));
    input.click();
  });
}

/* ---------- publish ---------- */

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1]);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

async function publish() {
  const list = changes();
  if (!list.length) return toast("There's nothing new to publish.");
  const shown = list.slice(0, 12);
  const confirmed = await dialog({
    title: "Publish to the website?",
    body: [
      h("p", {}, `${list.length} change${list.length === 1 ? "" : "s"}, published as ${state.editor}:`),
      h("ul", { class: "change-list" }, shown.map((c) => h("li", {}, c))),
      list.length > shown.length ? h("p", { class: "hint" }, `…and ${list.length - shown.length} more.`) : null,
    ],
    ok: "Publish",
    cancel: "Keep editing",
  });
  if (!confirmed) return;

  const steps = h("ol", { class: "steps" });
  const step = (text) => {
    steps.querySelectorAll("li").forEach((li) => li.classList.add("done"));
    steps.append(h("li", { class: "now" }, text));
  };
  const box = openStatusDialog("Publishing", steps);
  step("Saving your changes…");
  try {
    const fresh = [...uploadPaths(state.draft)].filter((p) => !uploadPaths(state.base).has(p));
    const files = [];
    for (const path of fresh) {
      const u = uploads.get(path);
      if (!u) throw new Error("A photo from this draft is missing from this computer. Replace it and try again.");
      files.push({ path, base64: await blobToBase64(u.blob) });
    }
    const res = await api("POST", "/publish", { baseVersion: state.version, content: state.draft, uploads: files, editor: state.editor, changes: list });
    state.base = clone(res.content);
    state.draft = clone(res.content);
    state.version = res.version;
    state.undo = [];
    state.redo = [];
    saveDraft();
    renderFrame();
    step("Updating the website… this takes about a minute.");
    const live = await waitForLive(res.publishedAt);
    steps.querySelectorAll("li").forEach((li) => li.classList.add("done"));
    box.finish(
      live
        ? h("p", { class: "success" }, "✓ It's live. ", h("a", { href: state.siteUrl, target: "_blank", rel: "noopener" }, "Open the website"))
        : h("p", {}, "Saved. The website is taking longer than usual to update; it should show your changes within a few minutes."),
    );
    forgetUnusedUploads();
  } catch (err) {
    if (err.status === 409) {
      box.close();
      await mergeLatest();
      await dialog({
        title: "Someone else just published",
        body: h("p", {}, "Your changes are kept, and theirs are added wherever you hadn't changed the same section. Check the page, then press Publish again."),
        ok: "OK",
      });
      return;
    }
    if (err.quiet) return box.close();
    box.finish(h("p", { class: "error" }, `Couldn't publish: ${err.message} Your changes are still saved here.`));
  }
}

async function waitForLive(publishedAt) {
  const until = Date.now() + 5 * 60 * 1000;
  while (Date.now() < until) {
    await new Promise((r) => setTimeout(r, 4000));
    try {
      const live = await api("GET", "/live");
      if (live.publishedAt && live.publishedAt >= publishedAt) return true;
    } catch {}
  }
  return false;
}

async function mergeLatest() {
  const latest = await api("GET", "/content");
  state.draft = rebase(state.base, state.draft, latest.content);
  state.base = latest.content;
  state.version = latest.version;
  saveDraft();
  renderFrame();
}

/* ---------- dialogs, toasts ---------- */

function dialog({ title, body, ok = "OK", cancel, danger }) {
  return new Promise((resolve) => {
    const d = $("#dialog");
    const close = (v) => {
      d.close();
      resolve(v);
    };
    d.replaceChildren(
      h("h2", {}, title),
      h("div", { class: "dialog-body" }, body),
      h(
        "div",
        { class: "dialog-actions" },
        cancel ? h("button", { class: "btn", type: "button", onclick: () => close(false) }, cancel) : null,
        h("button", { class: `btn ${danger ? "btn-danger-solid" : "primary"}`, type: "button", onclick: () => close(true) }, ok),
      ),
    );
    d.oncancel = () => resolve(false);
    d.showModal();
  });
}

function openStatusDialog(title, body) {
  const d = $("#dialog");
  const actions = h("div", { class: "dialog-actions" });
  d.replaceChildren(h("h2", {}, title), h("div", { class: "dialog-body" }, body), actions);
  d.oncancel = (e) => e.preventDefault();
  d.showModal();
  return {
    close: () => d.close(),
    finish(message) {
      body.after(message);
      actions.replaceChildren(h("button", { class: "btn primary", type: "button", onclick: () => d.close() }, "Done"));
      d.oncancel = null;
    },
  };
}

let toastTimer;
function toast(text, { action, onAction } = {}) {
  const t = $("#toast");
  t.replaceChildren(h("span", {}, text));
  if (action) t.append(h("button", { type: "button", onclick: () => (onAction(), (t.hidden = true)) }, action));
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), action ? 8000 : 5000);
}

function busy(text) {
  const b = $("#busy");
  b.textContent = text;
  b.hidden = false;
  return () => (b.hidden = true);
}

/* ---------- top bar ---------- */

function updateBar() {
  const n = state.base && state.draft ? changes().length : 0;
  $("#publish").disabled = n === 0;
  $("#publish").textContent = n ? `Publish ${n} change${n === 1 ? "" : "s"}` : "Published";
  $("#discard").hidden = n === 0;
  $("#save-state").textContent = n ? "Saved on this computer · not live yet" : "Everything is live";
  $("#undo").disabled = !state.undo.length;
  $("#redo").disabled = !state.redo.length;
}

async function discard() {
  const ok = await dialog({
    title: "Discard your changes?",
    body: h("p", {}, "This goes back to what's on the website now. You can still press Undo afterwards."),
    ok: "Discard changes",
    cancel: "Keep them",
    danger: true,
  });
  if (!ok) return;
  change((d) => {
    state.draft = clone(state.base);
  });
  closePanel();
}

function notice(text) {
  const n = $("#notice");
  n.replaceChildren(h("span", {}, text), h("button", { class: "icon-btn", type: "button", "aria-label": "Dismiss", onclick: () => (n.hidden = true) }, "✕"));
  n.hidden = false;
}

/* ---------- tabs: history and inquiries ---------- */

function showTab(name) {
  document.querySelectorAll("[data-tab]").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.tab === name)));
  document.querySelectorAll(".tab").forEach((t) => (t.hidden = t.id !== `tab-${name}`));
  if (name === "history") loadHistory();
  if (name === "inquiries") loadInquiries();
}

const when = (iso) => new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });

async function loadHistory() {
  const box = $("#history-list");
  box.replaceChildren(h("p", { class: "hint" }, "Loading…"));
  try {
    const { versions } = await api("GET", "/history");
    box.replaceChildren(
      ...versions.map((v, i) =>
        h(
          "article",
          { class: "version" },
          h("div", {}, h("p", { class: "version-title" }, v.title, i === 0 ? h("span", { class: "pill" }, "On the website now") : null), h("p", { class: "hint" }, `${when(v.date)} · ${v.author}`),
            v.body ? h("details", {}, h("summary", {}, "What changed"), h("pre", {}, v.body)) : null),
          h("div", { class: "version-actions" },
            h("button", { class: "btn", type: "button", onclick: () => previewVersion(v) }, "Preview"),
            i === 0 ? null : h("button", { class: "btn", type: "button", onclick: () => restoreVersion(v) }, "Restore…")),
        ),
      ),
    );
  } catch (err) {
    if (!err.quiet) box.replaceChildren(h("p", { class: "error" }, err.message));
  }
}

async function previewVersion(v) {
  const { content } = await api("GET", `/version?sha=${v.sha}`);
  const iframe = h("iframe", { class: "version-frame", title: "Earlier version" });
  iframe.srcdoc = rooted(renderPage(content, { head: '<base href="/">\n<style>.reveal{opacity:1!important;transform:none!important}</style>\n', scripts: "" }));
  await dialog({ title: `Version from ${when(v.date)}`, body: iframe, ok: "Close" });
}

async function restoreVersion(v) {
  const ok = await dialog({
    title: "Restore this version?",
    body: h("p", {}, `The editor will load the version from ${when(v.date)}. Nothing changes on the website until you press Publish.`),
    ok: "Restore",
    cancel: "Cancel",
  });
  if (!ok) return;
  const { content } = await api("GET", `/version?sha=${v.sha}`);
  // Versions saved before a field existed get today's value for it, so nothing new disappears.
  const fill = (target, from) => {
    for (const [k, v] of Object.entries(from)) {
      if (target[k] === undefined) target[k] = clone(v);
      else if (v && typeof v === "object" && !Array.isArray(v) && typeof target[k] === "object") fill(target[k], v);
    }
    return target;
  };
  change(() => {
    state.draft = fill(clone(content), state.base);
    state.draft.publishedAt = state.base.publishedAt;
    if (!state.draft.publishedAt) delete state.draft.publishedAt;
  });
  showTab("edit");
  notice(`Loaded the version from ${when(v.date)}. Press Publish to put it back on the website.`);
}

let inquiryFilter = "open";
let inquiryRows = [];

async function loadInquiries() {
  const box = $("#inquiry-list");
  box.replaceChildren(h("p", { class: "hint" }, "Loading inquiries…"));
  try {
    const { rows } = await api("GET", "/inquiries");
    inquiryRows = rows;
    drawInquiries();
  } catch (err) {
    if (!err.quiet) box.replaceChildren(h("p", { class: "error" }, `Couldn't load inquiries: ${err.message}`));
  }
}

function drawInquiries() {
  const open = inquiryRows.filter((r) => r.status !== "Replied");
  const badge = $("#inquiry-badge");
  badge.textContent = open.length;
  badge.hidden = open.length === 0;
  document.querySelectorAll("[data-filter]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.filter === inquiryFilter)));
  const rows = inquiryFilter === "open" ? open : inquiryRows;
  const box = $("#inquiry-list");
  if (!rows.length) {
    box.replaceChildren(h("p", { class: "empty" }, inquiryFilter === "open" ? "No inquiries waiting for a reply." : "No inquiries yet."));
    return;
  }
  box.replaceChildren(
    ...rows.map((r) =>
      h(
        "article",
        { class: `inquiry${r.status === "Replied" ? " is-done" : ""}` },
        h("div", { class: "inq-main" },
          h("p", { class: "inq-name" }, r.name || "(no name)"),
          h("p", { class: "inq-meta" }, [r.term, r.room && `${r.room} room`, when(r.received)].filter(Boolean).join(" · ")),
          r.message ? h("p", { class: "inq-msg" }, r.message) : null,
          h("p", { class: "inq-contact" },
            h("a", { href: `mailto:${r.email}?subject=${encodeURIComponent("Re: The Luttrell")}` }, r.email),
            r.phone ? ` · ${r.phone}` : "")),
        h("label", { class: "replied" },
          h("input", { type: "checkbox", checked: r.status === "Replied", onchange: (e) => markReplied(r, e.target.checked, e.target) }),
          "Replied"),
      ),
    ),
  );
}

async function markReplied(row, replied, box) {
  box.disabled = true;
  try {
    await api("POST", "/inquiries/status", { row: row.row, received: row.received, replied });
    row.status = replied ? "Replied" : "";
    drawInquiries();
  } catch (err) {
    box.checked = !replied;
    if (!err.quiet) toast(`Couldn't save that: ${err.message}`);
  } finally {
    box.disabled = false;
  }
}

/* ---------- sign-in and start-up ---------- */

function showScreen(id) {
  for (const s of ["signin", "who", "app"]) $(`#${s}`).hidden = s !== id;
}

function showSignIn(message) {
  showScreen("signin");
  $("#signin-error").textContent = message || "";
  setTimeout(() => $("#password").focus(), 0);
}

function showWho(editors) {
  showScreen("who");
  $("#who-list").replaceChildren(
    ...editors.map((name) =>
      h("button", { class: "who-btn", type: "button", onclick: () => {
        state.editor = name;
        localStorage.setItem("luttrell-editor-name", name);
        start();
      } }, name),
    ),
  );
}

async function start() {
  showScreen("app");
  $("#who-name").textContent = state.editor;
  if (!state.base) {
    await loadUploads();
    const { content, version } = await api("GET", "/content");
    const saved = readDraft();
    state.base = content;
    state.version = version;
    if (saved && saved.version === version) state.draft = saved.draft;
    else if (saved && saved.base && !same(saved.base, saved.draft)) {
      state.draft = rebase(saved.base, saved.draft, content);
      notice("Someone published the website since you last edited here. Your unpublished changes are kept on top.");
    } else state.draft = clone(content);
    saveDraft();
    renderFrame();
    forgetUnusedUploads();
    loadInquiries();
  }
  try {
    if (!localStorage.getItem("luttrell-editor-tip")) $("#tip").hidden = false;
  } catch {}
}

async function boot() {
  try {
    const s = await api("GET", "/session");
    state.siteUrl = s.siteUrl;
    state.editors = s.editors;
    if (state.editor && s.editors.includes(state.editor)) await start();
    else showWho(s.editors);
  } catch (err) {
    if (!err.quiet) showSignIn(err.status === 503 ? "The editor isn't set up yet." : err.message);
  }
}

$("#signin-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = $("#signin-btn");
  btn.disabled = true;
  $("#signin-error").textContent = "";
  try {
    const s = await api("POST", "/login", { password: $("#password").value });
    $("#password").value = "";
    state.editors = s.editors;
    await boot();
  } catch (err) {
    $("#signin-error").textContent = err.message;
  } finally {
    btn.disabled = false;
  }
});
$("#show-password").addEventListener("change", (e) => ($("#password").type = e.target.checked ? "text" : "password"));

// The panel isn't rebuilt while someone types in it, so keep the Google preview in step directly.
$("#panel").addEventListener("input", () => {
  if (!$("#panel .serp")) return;
  $("#panel .serp-title").textContent = state.draft.seo.title;
  $("#panel .serp-desc").textContent = state.draft.seo.description;
});
$("#publish").addEventListener("click", publish);
$("#discard").addEventListener("click", discard);
$("#undo").addEventListener("click", undo);
$("#redo").addEventListener("click", redo);
$("#settings-btn").addEventListener("click", () => openPanel("settings", "seo"));
document.querySelectorAll("[data-tab]").forEach((b) => b.addEventListener("click", () => showTab(b.dataset.tab)));
document.querySelectorAll("[data-device]").forEach((b) =>
  b.addEventListener("click", () => {
    state.device = b.dataset.device;
    document.querySelectorAll("[data-device]").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    $(".frame-wrap").classList.toggle("is-phone", state.device === "phone");
  }),
);
document.querySelectorAll("[data-filter]").forEach((b) => b.addEventListener("click", () => ((inquiryFilter = b.dataset.filter), drawInquiries())));
$("#refresh-inquiries").addEventListener("click", loadInquiries);
$("#tip button").addEventListener("click", () => {
  $("#tip").hidden = true;
  try {
    localStorage.setItem("luttrell-editor-tip", "1");
  } catch {}
});
$("#who-menu").addEventListener("click", () => ($("#menu").hidden = !$("#menu").hidden));
document.addEventListener("click", (e) => {
  if (!e.target.closest("#who-menu, #menu")) $("#menu").hidden = true;
});
$("#switch-person").addEventListener("click", () => showWho(state.editors || []));
$("#sign-out").addEventListener("click", async () => {
  await api("POST", "/logout").catch(() => {});
  location.reload();
});
document.addEventListener("keydown", (e) => {
  const mod = e.metaKey || e.ctrlKey;
  if (!mod || ["INPUT", "TEXTAREA"].includes(document.activeElement?.tagName)) return;
  if (e.key.toLowerCase() === "z") {
    e.preventDefault();
    e.shiftKey ? redo() : undo();
  }
});

boot();
