// Website editor API (Cloudflare Pages Function). Every route except /api/login needs a session.
//
// Required secrets: ADMIN_PASSWORD, GITHUB_TOKEN (fine-grained, this repo, Contents: read & write),
// ADMIN_KEY (shared with the inquiry Apps Script). Variables: GITHUB_REPO, SITE_URL, APPS_SCRIPT_URL.
// Optional: GITHUB_BRANCH, GITHUB_API, EDITORS, LIMITS (KV binding for sign-in limits).

import { renderPage } from "../../render.mjs";
import { clearCookie, clearFails, isSignedIn, passwordMatches, recordFail, sessionCookie, tooManyFails } from "../../server/auth.js";
import { github, GitHubError } from "../../server/github.js";
import { InvalidContent, validateContent, validateUploads } from "../../server/validate.js";

const json = (data, status = 200, headers = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...headers },
  });

const fail = (message, status) => json({ error: message }, status);

function editors(env) {
  return (env.EDITORS || "Mom,Dad,Alec").split(",").map((s) => s.trim()).filter(Boolean);
}

async function appsScript(env, params) {
  const res = await fetch(env.APPS_SCRIPT_URL, {
    method: "POST",
    body: new URLSearchParams({ ...params, key: env.ADMIN_KEY }),
    redirect: "follow",
  });
  const data = await res.json().catch(() => null);
  if (!data || !data.ok) throw new Error((data && data.error) || `Inquiry service error (${res.status})`);
  return data;
}

const routes = {
  "POST /login": async ({ request, env, body }) => {
    const ip = request.headers.get("cf-connecting-ip") || "local";
    if (await tooManyFails(ip, env)) return fail("Too many tries. Wait 15 minutes and try again.", 429);
    if (!(await passwordMatches(body.password || "", env))) {
      await recordFail(ip, env);
      await new Promise((r) => setTimeout(r, 700));
      return fail("That password isn't right.", 401);
    }
    await clearFails(ip, env);
    return json({ ok: true, editors: editors(env) }, 200, { "set-cookie": await sessionCookie(env) });
  },

  "POST /logout": async () => json({ ok: true }, 200, { "set-cookie": clearCookie }),

  "GET /session": async ({ env }) => json({ ok: true, editors: editors(env), siteUrl: env.SITE_URL }),

  "GET /content": async ({ env }) => json(await github(env).readContent()),

  "GET /history": async ({ env }) => json({ versions: await github(env).history() }),

  "GET /version": async ({ env, url }) => {
    const sha = url.searchParams.get("sha") || "";
    if (!/^[0-9a-f]{7,40}$/.test(sha)) return fail("Unknown version", 400);
    return json(await github(env).readContent(sha));
  },

  // What the public site is serving right now, so the editor can say when a publish is live.
  "GET /live": async ({ env }) => {
    const res = await fetch(`${env.SITE_URL}/content.json?t=${Date.now()}`, { headers: { "cache-control": "no-cache" } });
    if (!res.ok) return json({ publishedAt: null });
    const live = await res.json().catch(() => ({}));
    return json({ publishedAt: live.publishedAt || null });
  },

  "POST /publish": async ({ env, body, context }) => {
    const editor = editors(env).includes(body.editor) ? body.editor : "Someone";
    const content = validateContent(body.content);
    const uploads = validateUploads(body.uploads || []);
    const changes = (Array.isArray(body.changes) ? body.changes : []).map(String).slice(0, 60);
    const gh = github(env);

    const current = await gh.readContent();
    if (current.version !== body.baseVersion) {
      return json({ error: "conflict", content: current.content, version: current.version }, 409);
    }

    content.publishedAt = new Date().toISOString();
    const count = changes.length || 1;
    const message = `Website update by ${editor}: ${count} change${count === 1 ? "" : "s"}\n\n${changes.map((c) => `- ${c}`).join("\n")}`;
    const { sha, blobs } = await gh.commit({
      message,
      author: { name: editor, email: "leasing@theluttrellberkeley.com" },
      files: [
        ...uploads,
        { path: "content.json", text: `${JSON.stringify(content, null, 2)}\n` },
        { path: "index.html", text: renderPage(content) },
      ],
    });

    if (env.APPS_SCRIPT_URL && env.ADMIN_KEY) {
      const note = appsScript(env, {
        action: "admin-notify",
        subject: `Website updated by ${editor}`,
        body: `${editor} published ${count} change${count === 1 ? "" : "s"} to ${env.SITE_URL}:\n\n${changes.map((c) => `• ${c}`).join("\n")}`,
      }).catch((err) => console.error("publish email failed:", err.message));
      context.waitUntil(note);
    }
    return json({ ok: true, commit: sha, version: blobs["content.json"], content, publishedAt: content.publishedAt });
  },

  "GET /inquiries": async ({ env }) => {
    const data = await appsScript(env, { action: "admin-list" });
    return json({ rows: data.rows });
  },

  "POST /inquiries/status": async ({ env, body }) => {
    await appsScript(env, {
      action: "admin-status",
      row: String(body.row),
      received: String(body.received || ""),
      status: body.replied ? "Replied" : "",
    });
    return json({ ok: true });
  },
};

export async function onRequest(context) {
  const { request, env, params } = context;
  const url = new URL(request.url);
  const route = `${request.method} /${[].concat(params.route || []).join("/")}`;
  const handler = routes[route];
  if (!handler) return fail("Not found", 404);
  if (!env.ADMIN_PASSWORD || !env.GITHUB_TOKEN || !env.GITHUB_REPO) return fail("The editor isn't set up yet.", 503);

  let body = {};
  if (request.method !== "GET") {
    // JSON-only plus a same-origin check: a cross-site form can't send either.
    const origin = request.headers.get("origin");
    if (origin && origin !== url.origin) return fail("Forbidden", 403);
    if (!(request.headers.get("content-type") || "").startsWith("application/json")) return fail("Expected JSON", 415);
    body = await request.json().catch(() => ({}));
  }
  if (route !== "POST /login" && !(await isSignedIn(request, env))) return fail("Please sign in again.", 401);

  try {
    return await handler({ request, env, body, url, context });
  } catch (err) {
    if (err instanceof InvalidContent) return fail(err.message, 400);
    if (err instanceof GitHubError && err.status === 409) return fail("conflict", 409);
    console.error(route, err.message);
    return fail("Something went wrong saving. Try again in a minute.", 502);
  }
}
