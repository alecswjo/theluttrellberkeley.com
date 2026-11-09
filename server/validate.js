// Checks a submitted page against the content shape and returns a clean copy with only known fields.
// Rendering escapes all text; this guards the structure and keeps media paths inside assets/.

const IMAGE = { src: "src", alt: "str", width: "int", height: "int", focus: "focus?" };

const SHAPE = {
  seo: { title: "str", description: "str" },
  hero: { script: "str", caps: "str", video: "src", poster: "src", alt: "str" },
  intro: { kicker: "str", headline: "str", body: "str", image: IMAGE, caption: "str" },
  rooms: {
    heading: "str",
    body: "str",
    plans: [
      {
        num: "str",
        name: "str",
        spec: "str",
        status: "str",
        wide: "bool?",
        prices: [{ label: "str", price: "str", unit: "str" }],
        image: IMAGE,
      },
    ],
    note: "str",
    link: "str",
  },
  photos: { heading: "str", items: [{ ...IMAGE, caption: "str" }] },
  location: { heading: "str", lead: "str", walks: [{ place: "str", time: "str" }], image: IMAGE },
  inquire: { heading: "str", body: "str" },
  footer: { address: "str", email: "email" },
  publishedAt: "str?",
};

const MAX_TEXT = 4000;
const MAX_ITEMS = 40;

export class InvalidContent extends Error {}

function check(value, shape, path) {
  if (Array.isArray(shape)) {
    if (!Array.isArray(value)) throw new InvalidContent(`${path} should be a list`);
    if (value.length > MAX_ITEMS) throw new InvalidContent(`${path} has too many items`);
    return value.map((v, i) => check(v, shape[0], `${path}.${i}`));
  }
  if (typeof shape === "object") {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new InvalidContent(`${path} is missing`);
    const out = {};
    for (const [k, s] of Object.entries(shape)) {
      const optional = typeof s === "string" && s.endsWith("?");
      if (value[k] === undefined || value[k] === null) {
        if (optional) continue;
        throw new InvalidContent(`${path ? `${path}.` : ""}${k} is missing`);
      }
      out[k] = check(value[k], optional ? s.slice(0, -1) : s, path ? `${path}.${k}` : k);
    }
    return out;
  }
  switch (shape) {
    case "str":
      if (typeof value !== "string" || value.length > MAX_TEXT) throw new InvalidContent(`${path} is not valid text`);
      return value;
    case "bool":
      return Boolean(value);
    case "int":
      if (!Number.isInteger(value) || value < 1 || value > 20000) throw new InvalidContent(`${path} is not a valid size`);
      return value;
    case "src":
      if (typeof value !== "string" || !/^assets\/[A-Za-z0-9._/-]+\.(webp|jpe?g|png|svg|mp4)$/.test(value) || value.includes(".."))
        throw new InvalidContent(`${path} is not a valid file`);
      return value;
    case "focus":
      if (typeof value !== "string" || !/^\d{1,3}% \d{1,3}%$/.test(value)) throw new InvalidContent(`${path} is not valid`);
      return value;
    case "email":
      if (typeof value !== "string" || !/^[^\s@<>"]+@[^\s@<>"]+\.[a-z]{2,}$/i.test(value)) throw new InvalidContent(`${path} is not an email`);
      return value;
  }
  throw new InvalidContent(`Unknown field type at ${path}`);
}

export function validateContent(content) {
  return check(content, SHAPE, "");
}

const UPLOAD_PATH = /^assets\/uploads\/[a-z0-9-]+\.(webp|jpg|png|mp4)$/;
const MAX_UPLOAD_BYTES = 30 * 1024 * 1024;

export function validateUploads(uploads) {
  if (!Array.isArray(uploads) || uploads.length > 40) throw new InvalidContent("Too many files");
  return uploads.map((u) => {
    if (!u || !UPLOAD_PATH.test(u.path) || typeof u.base64 !== "string") throw new InvalidContent("A file is not valid");
    if (u.base64.length * 0.75 > MAX_UPLOAD_BYTES) throw new InvalidContent("A file is too large");
    return { path: u.path, base64: u.base64 };
  });
}
