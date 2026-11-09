// Local stand-ins for GitHub, the published site and the inquiry Apps Script, so the editor can be
// tested end to end without touching the real website.  node tests/fake-backend.mjs [port]
//   /gh/...    the GitHub REST endpoints the editor uses, backed by an in-memory repo seeded from disk
//   /live/...  the "public site", which serves new commits after a short deploy delay
//   /apps      the Apps Script actions (admin-list, admin-status, admin-notify)
//   /test/...  hooks for tests (state, simulate another publish)

import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";

const PORT = +(process.argv[2] || 8899);
const TOKEN = "test-gh-token";
const KEY = "test-admin-key";
const DEPLOY_DELAY_MS = 3000;
const root = new URL("..", import.meta.url);

const blobs = new Map(); // sha -> Buffer
const trees = new Map(); // sha -> Map(path -> blobSha)
const commits = new Map(); // sha -> { tree, parent, message, author }
let head;
let live = { head: null, at: 0 };
const notifications = [];

const sha1 = (s) => createHash("sha1").update(s).digest("hex");
function putBlob(buf) {
  const sha = sha1(Buffer.concat([Buffer.from(`blob ${buf.length}\0`), buf]));
  blobs.set(sha, buf);
  return sha;
}
function putTree(map) {
  const sha = sha1(JSON.stringify([...map].sort()));
  trees.set(sha, map);
  return sha;
}
function putCommit(c) {
  const sha = sha1(JSON.stringify(c) + Math.random());
  commits.set(sha, c);
  return sha;
}

function reset() {
  blobs.clear();
  trees.clear();
  commits.clear();
  notifications.length = 0;
  // History starts with a version saved before the phone, subheading, disclaimer and history fields existed.
  const current = JSON.parse(readFileSync(new URL("content.json", root)));
  const legacy = structuredClone(current);
  legacy.intro.headline = "Furnished rooms, five minutes from campus.";
  delete legacy.intro.subhead;
  delete legacy.rooms.disclaimer;
  delete legacy.footer.phone;
  delete legacy.history;
  const first = putCommit({
    tree: putTree(new Map([["content.json", putBlob(Buffer.from(JSON.stringify(legacy, null, 2)))]])),
    parent: null,
    message: "Website update by Alec: 1 change\n\n- Initial content",
    author: { name: "Alec", email: "x@example.com", date: new Date(Date.now() - 2 * 864e5).toISOString() },
  });
  head = putCommit({
    tree: putTree(new Map([["content.json", putBlob(Buffer.from(JSON.stringify(current, null, 2)))]])),
    parent: first,
    message: "Website update by Mom: 5 changes\n\n- New intro wording",
    author: { name: "Mom", email: "x@example.com", date: new Date(Date.now() - 864e5).toISOString() },
  });
  live = { head, at: 0 };
  inquiries.forEach((r) => (r.status = r.row === 3 ? "Replied" : ""));
}

const inquiries = [
  { row: 2, received: "2026-11-07T18:20:00.000Z", name: "Jamie Park", email: "jamie@example.com", phone: "", role: "", term: "Fall 2027", room: "private", message: "Is there parking?\nAlso, are utilities included?", status: "" },
  { row: 3, received: "2026-11-08T09:05:00.000Z", name: "<script>alert(1)</script>", email: "sam@example.com", phone: "510-555-0100", role: "", term: "Spring 2027", room: "shared", message: "Looking for a shared room with a friend.", status: "Replied" },
];

function fileAt(commitSha, path) {
  const c = commits.get(commitSha);
  const b = c && trees.get(c.tree).get(path);
  return b ? { sha: b, buf: blobs.get(b) } : null;
}

const send = (res, status, data, headers = {}) => {
  res.writeHead(status, { "content-type": "application/json", "access-control-allow-origin": "*", ...headers });
  res.end(JSON.stringify(data));
};

async function body(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return Buffer.concat(chunks).toString("utf8");
}

function resolveRef(ref) {
  if (ref === "main") return head;
  return [...commits.keys()].find((k) => k.startsWith(ref));
}

async function github(req, res, path, url) {
  if (req.headers.authorization !== `Bearer ${TOKEN}`) return send(res, 401, { message: "Bad credentials" });
  const m = path.match(/^\/repos\/[^/]+\/[^/]+(\/.*)$/);
  if (!m) return send(res, 404, {});
  const p = m[1];
  if (req.method === "GET" && p === "/contents/content.json") {
    const c = resolveRef(url.searchParams.get("ref") || "main");
    const f = c && fileAt(c, "content.json");
    if (!f) return send(res, 404, { message: "Not Found" });
    return send(res, 200, { sha: f.sha, encoding: "base64", content: f.buf.toString("base64").replace(/(.{60})/g, "$1\n") });
  }
  if (req.method === "GET" && p === "/commits") {
    const out = [];
    for (let s = head; s; s = commits.get(s).parent) {
      const c = commits.get(s);
      const prev = c.parent && fileAt(c.parent, "content.json");
      if (!prev || prev.sha !== fileAt(s, "content.json")?.sha) out.push({ sha: s, commit: { message: c.message, author: c.author } });
    }
    return send(res, 200, out);
  }
  if (req.method === "GET" && p === "/git/ref/heads/main") return send(res, 200, { object: { sha: head } });
  if (req.method === "GET" && p.startsWith("/git/commits/")) {
    const c = commits.get(p.split("/").pop());
    return c ? send(res, 200, { tree: { sha: c.tree } }) : send(res, 404, {});
  }
  const json = req.method === "GET" ? {} : JSON.parse((await body(req)) || "{}");
  if (req.method === "POST" && p === "/git/blobs") {
    const buf = Buffer.from(json.content, json.encoding === "base64" ? "base64" : "utf8");
    return send(res, 201, { sha: putBlob(buf) });
  }
  if (req.method === "POST" && p === "/git/trees") {
    const map = new Map(trees.get(json.base_tree));
    for (const e of json.tree) map.set(e.path, e.sha);
    return send(res, 201, { sha: putTree(map) });
  }
  if (req.method === "POST" && p === "/git/commits") {
    const sha = putCommit({ tree: json.tree, parent: json.parents[0], message: json.message, author: { ...json.author, date: new Date().toISOString() } });
    return send(res, 201, { sha });
  }
  if (req.method === "PATCH" && p === "/git/refs/heads/main") {
    if (commits.get(json.sha)?.parent !== head) return send(res, 422, { message: "Update is not a fast forward" });
    head = json.sha;
    live = { head, at: Date.now() + DEPLOY_DELAY_MS, prev: live.head };
    return send(res, 200, { object: { sha: head } });
  }
  send(res, 404, { message: `fake github: no route ${req.method} ${p}` });
}

function liveSite(req, res, path) {
  const served = Date.now() >= live.at ? live.head : live.prev || live.head;
  const f = fileAt(served, path.slice(1) || "index.html");
  if (!f) return send(res, 404, {});
  res.writeHead(200, { "content-type": path.endsWith(".json") ? "application/json" : "text/html", "access-control-allow-origin": "*" });
  res.end(f.buf);
}

async function apps(req, res) {
  const params = new URLSearchParams(await body(req));
  if (params.get("key") !== KEY) return send(res, 200, { ok: false, error: "Not allowed" });
  const action = params.get("action");
  if (action === "admin-list") return send(res, 200, { ok: true, rows: [...inquiries].reverse() });
  if (action === "admin-status") {
    const row = inquiries.find((r) => r.row === +params.get("row") && r.received === params.get("received"));
    if (!row) return send(res, 200, { ok: false, error: "That inquiry changed in the sheet. Refresh and try again." });
    row.status = params.get("status");
    return send(res, 200, { ok: true });
  }
  if (action === "admin-notify") {
    notifications.push({ subject: params.get("subject"), body: params.get("body") });
    return send(res, 200, { ok: true });
  }
  send(res, 200, { ok: false, error: "Unknown action" });
}

reset();

createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  try {
    if (url.pathname.startsWith("/gh/")) return await github(req, res, url.pathname.slice(3), url);
    if (url.pathname.startsWith("/live/")) return liveSite(req, res, url.pathname.slice(5));
    if (url.pathname === "/apps") return await apps(req, res);
    if (url.pathname === "/test/state") {
      const list = [];
      for (let s = head; s; s = commits.get(s).parent) list.push({ sha: s, message: commits.get(s).message, author: commits.get(s).author.name, files: [...trees.get(commits.get(s).tree).keys()] });
      return send(res, 200, { head, commits: list, notifications, inquiries, content: JSON.parse(fileAt(head, "content.json").buf), indexHtml: fileAt(head, "index.html")?.buf.toString() });
    }
    if (url.pathname === "/test/reset" && req.method === "POST") {
      reset();
      return send(res, 200, { ok: true });
    }
    if (url.pathname === "/test/file") {
      const f = fileAt(head, url.searchParams.get("path"));
      if (!f) return send(res, 404, {});
      res.writeHead(200);
      return res.end(f.buf);
    }
    if (url.pathname === "/test/other-publish" && req.method === "POST") {
      // Someone else publishes a change to the Location section.
      const c = JSON.parse(fileAt(head, "content.json").buf);
      c.location.lead = "Changed by someone else.";
      const map = new Map(trees.get(commits.get(head).tree));
      map.set("content.json", putBlob(Buffer.from(JSON.stringify(c, null, 2))));
      head = putCommit({ tree: putTree(map), parent: head, message: "Website update by Dad: 1 change\n\n- Address text", author: { name: "Dad", email: "x", date: new Date().toISOString() } });
      live = { head, at: 0 };
      return send(res, 200, { ok: true });
    }
    send(res, 404, {});
  } catch (err) {
    console.error(err);
    send(res, 500, { message: err.message });
  }
}).listen(PORT, "127.0.0.1", () => console.log(`fake backend on http://127.0.0.1:${PORT}`));
