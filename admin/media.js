// Turns a photo or video someone picked into a web-ready file, entirely in the browser.
// Photos: resized, re-encoded (which drops EXIF/GPS), iPhone HEIC supported.
// Videos: trimmed, muted, H.264 MP4 sized for the web, plus a poster frame.

const isHeic = (file) => /hei[cf]$/i.test(file.type) || /\.hei[cf]$/i.test(file.name);

let heicLoader;
function loadHeic() {
  heicLoader ??= new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "/admin/vendor/heic2any-0.0.4.min.js";
    s.onload = () => resolve(window.heic2any);
    s.onerror = () => reject(new Error("Couldn't load the iPhone photo converter."));
    document.head.append(s);
  });
  return heicLoader;
}

async function decode(file) {
  try {
    return await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch (err) {
    if (!isHeic(file)) throw new Error("This file isn't a photo we can read. Try a JPG, PNG or iPhone photo.");
    const heic2any = await loadHeic();
    const jpeg = await heic2any({ blob: file, toType: "image/jpeg", quality: 0.92 });
    return createImageBitmap(Array.isArray(jpeg) ? jpeg[0] : jpeg);
  }
}

function canvasBlob(canvas, type, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

async function encode(canvas) {
  // Safari can't encode WebP and silently returns PNG; use JPEG there.
  const webp = await canvasBlob(canvas, "image/webp", 0.84);
  if (webp && webp.type === "image/webp") return { blob: webp, ext: "webp" };
  return { blob: await canvasBlob(canvas, "image/jpeg", 0.86), ext: "jpg" };
}

export async function hashName(blob, ext) {
  const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `assets/uploads/${hex.slice(0, 16)}.${ext}`;
}

// maxEdge: longest side in pixels after resizing.
export async function processPhoto(file, maxEdge = 1800) {
  const bitmap = await decode(file);
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();
  const { blob, ext } = await encode(canvas);
  return { blob, width, height, path: await hashName(blob, ext), sourceWidth: Math.round(width / scale) };
}

export function videoSupported() {
  return typeof window.VideoEncoder === "function" && typeof window.VideoDecoder === "function";
}

// Reads a video's length and size for the trim controls.
export function probeVideo(file) {
  return new Promise((resolve, reject) => {
    const v = document.createElement("video");
    v.preload = "metadata";
    v.muted = true;
    v.src = URL.createObjectURL(file);
    v.onloadedmetadata = () => resolve({ duration: v.duration, width: v.videoWidth, height: v.videoHeight, url: v.src });
    v.onerror = () => reject(new Error("This video can't be read here. Try an MP4 or an iPhone video in Chrome."));
  });
}

async function posterFrame(blob, at) {
  const v = document.createElement("video");
  v.muted = true;
  v.playsInline = true;
  v.src = URL.createObjectURL(blob);
  await new Promise((r, j) => {
    v.onloadeddata = r;
    v.onerror = () => j(new Error("Couldn't read the video's first frame."));
  });
  v.currentTime = at;
  await new Promise((r) => (v.onseeked = r));
  const canvas = document.createElement("canvas");
  canvas.width = v.videoWidth;
  canvas.height = v.videoHeight;
  canvas.getContext("2d").drawImage(v, 0, 0);
  URL.revokeObjectURL(v.src);
  const out = await encode(canvas);
  return { ...out, path: await hashName(out.blob, out.ext) };
}

export async function processVideo(file, { start, end, onProgress }) {
  const mb = await import("/admin/vendor/mediabunny-1.61.6.min.mjs");
  const input = new mb.Input({ source: new mb.BlobSource(file), formats: mb.ALL_FORMATS });
  const output = new mb.Output({ format: new mb.Mp4OutputFormat({ fastStart: "in-memory" }), target: new mb.BufferTarget() });
  const conversion = await mb.Conversion.init({
    input,
    output,
    video: (track) => {
      const w = track.displayWidth;
      const h = track.displayHeight;
      const scale = Math.min(1, 1920 / Math.max(w, h));
      // Even dimensions keep H.264 encoders happy.
      const even = (n) => Math.max(2, Math.round((n * scale) / 2) * 2);
      return { width: even(w), height: even(h), fit: "fill", codec: "avc", bitrate: 3_000_000, forceTranscode: true };
    },
    audio: { discard: true },
    trim: { start, end },
    tags: {},
    showWarnings: false,
  });
  if (!conversion.isValid) throw new Error("This browser can't convert that video. Try Chrome on a laptop.");
  conversion.onProgress = (p) => onProgress?.(p);
  await conversion.execute();
  const blob = new Blob([output.target.buffer], { type: "video/mp4" });
  const poster = await posterFrame(blob, 0.05);
  return { blob, path: await hashName(blob, "mp4"), poster };
}
