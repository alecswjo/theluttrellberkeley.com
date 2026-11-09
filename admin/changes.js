// Plain-English names for every editable spot, and a readable list of what changed between two drafts.

const FIELD = {
  "seo.title": "Page title on Google",
  "seo.description": "Description on Google",
  "hero.script": "Top banner, script line",
  "hero.caps": "Top banner, terms",
  "hero.video": "Top video",
  "hero.alt": "Top video description",
  "intro.kicker": "Intro, small line",
  "intro.headline": "Intro headline",
  "intro.body": "Intro text",
  "intro.image": "Intro picture",
  "intro.caption": "Intro picture caption",
  "rooms.heading": "Floor plans heading",
  "rooms.body": "Floor plans text",
  "rooms.note": "Floor plans small print",
  "rooms.link": "Floor plans link",
  "photos.heading": "Photos heading",
  "location.heading": "Address heading",
  "location.lead": "Address text",
  "location.image": "Address drawing",
  "inquire.heading": "Inquiry heading",
  "inquire.body": "Inquiry text",
  "footer.address": "Footer address",
  "footer.email": "Contact email",
};

const PLAN_FIELD = { num: "small label", name: "name", spec: "details", status: "availability label", image: "drawing" };
const PRICE_FIELD = { label: "price name", price: "price", unit: "price note" };
const PHOTO_FIELD = { caption: "caption", src: "photo", alt: "photo description", focus: "photo position" };
const WALK_FIELD = { place: "place", time: "time" };

export function get(obj, path) {
  return path.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

export function set(obj, path, value) {
  const keys = path.split(".");
  const last = keys.pop();
  const target = keys.reduce((o, k) => o[k], obj);
  target[last] = value;
}

// "rooms.plans.1.prices.0.price" -> "Layout 2 › Shared bedroom › price"
export function label(path, content) {
  if (FIELD[path]) return FIELD[path];
  const p = path.split(".");
  if (p[0] === "rooms" && p[1] === "plans") {
    const plan = content.rooms.plans[+p[2]];
    const name = plan?.name || `Floor plan ${+p[2] + 1}`;
    if (p[3] === "prices") {
      const row = plan?.prices[+p[4]];
      return `${name} › ${row?.label || "price"}${p[5] ? ` › ${PRICE_FIELD[p[5]] || p[5]}` : ""}`;
    }
    return p[3] ? `${name} › ${PLAN_FIELD[p[3]] || p[3]}` : name;
  }
  if (p[0] === "photos" && p[1] === "items") {
    const ph = content.photos.items[+p[2]];
    const name = ph?.caption ? `Photo “${ph.caption}”` : `Photo ${+p[2] + 1}`;
    return p[3] ? `${name} › ${PHOTO_FIELD[p[3]] || p[3]}` : name;
  }
  if (p[0] === "location" && p[1] === "walks") {
    const w = content.location.walks[+p[2]];
    const name = `Walking time “${w?.place || +p[2] + 1}”`;
    return p[3] ? `${name} › ${WALK_FIELD[p[3]]}` : name;
  }
  if (p[0] === "intro" && p[1] === "image") return "Intro picture";
  if (p[0] === "location" && p[1] === "image") return "Address drawing";
  return path;
}

const LISTS = {
  "rooms.plans": { noun: "floor plan", key: (x) => x.image?.src + "|" + x.name },
  "photos.items": { noun: "photo", key: (x) => x.src },
  "location.walks": { noun: "walking time", key: (x) => x.place },
};
const PRICE_LIST = { noun: "price", key: (x) => x.label };

const short = (v) => {
  const s = String(v ?? "").replace(/\s+/g, " ").trim();
  return s.length > 60 ? `${s.slice(0, 57)}…` : s;
};

// Returns human-readable change lines, e.g. "Layout 2 › Shared bedroom › price: “$1,390” → “$1,450”".
export function describeChanges(before, after) {
  const out = [];
  const walk = (a, b, path) => {
    if (JSON.stringify(a) === JSON.stringify(b)) return;
    const list = LISTS[path] || (/^rooms\.plans\.\d+\.prices$/.test(path) ? PRICE_LIST : null);
    if (list && Array.isArray(a) && Array.isArray(b)) {
      const name = label(path.replace(/\.prices$/, ""), after);
      const where = path === "rooms.plans" ? "Floor plans" : path === "photos.items" ? "Photos" : path === "location.walks" ? "Walking times" : name;
      // Pair items by identity first; leftovers pair up in order (a replaced photo is an edit, not
      // an add plus a remove); anything still unpaired was added or removed.
      const ak = a.map(list.key);
      const pairOf = new Map(); // index in b -> index in a
      const usedA = new Set();
      b.forEach((item, i) => {
        const j = ak.findIndex((k, n) => k === list.key(item) && !usedA.has(n));
        if (j >= 0) {
          pairOf.set(i, j);
          usedA.add(j);
        }
      });
      const freeA = a.map((_, n) => n).filter((n) => !usedA.has(n));
      b.forEach((_, i) => {
        if (!pairOf.has(i) && freeA.length) pairOf.set(i, freeA.shift());
      });
      const unpairedB = b.filter((_, i) => !pairOf.has(i)).length;
      for (let n = 0; n < freeA.length; n++) out.push(`${where}: removed a ${list.noun}`);
      for (let n = 0; n < unpairedB; n++) out.push(`${where}: added a ${list.noun}`);
      const order = [...pairOf.entries()].sort((x, y) => x[0] - y[0]).map(([, j]) => j);
      if (order.some((j, n) => n > 0 && j < order[n - 1])) out.push(`${where}: changed the order`);
      for (const [i, j] of pairOf) walk(a[j], b[i], `${path}.${i}`);
      return;
    }
    if (a && b && typeof a === "object" && typeof b === "object" && !Array.isArray(a)) {
      // Images change as a unit: a new file is one change, not four.
      if ("src" in b && a.src !== b.src) {
        out.push(`${label(path, after)}: new photo`);
      }
      for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
        if (["src", "width", "height", "poster", "publishedAt"].includes(k)) continue;
        if (k === "video") {
          if (a.video !== b.video) out.push("Top video: new video");
          continue;
        }
        walk(a[k], b[k], path ? `${path}.${k}` : k);
      }
      return;
    }
    if (typeof b === "boolean" || typeof a === "boolean") return;
    const name = label(path, after);
    if (!a) out.push(`${name}: added “${short(b)}”`);
    else if (!b) out.push(`${name}: cleared`);
    else out.push(`${name}: “${short(a)}” → “${short(b)}”`);
  };
  walk(before, after, "");
  return out;
}

const SECTIONS = ["seo", "hero", "intro", "rooms", "photos", "location", "inquire", "footer"];

// Someone else published since this draft started: keep their version of every section this
// draft didn't touch, and this draft's version of every section it did.
export function rebase(oldBase, draft, latest) {
  const merged = structuredClone(latest);
  for (const s of SECTIONS) {
    if (JSON.stringify(oldBase[s]) !== JSON.stringify(draft[s])) merged[s] = structuredClone(draft[s]);
  }
  return merged;
}
