# theluttrellberkeley.com

One-page site for The Luttrell, 2328 Channing Way, Berkeley. The public site is static HTML on GitHub Pages; push to `main` to deploy.

## The page

- `content.json` — every word, price, photo and video on the page. This is the source of truth.
- `render.mjs` — turns `content.json` into `index.html`. `node build.mjs` rebuilds `index.html` after a hand edit to `content.json`.
- `styles.css`, `site.js` — the "Postcard" design. `index.html` is generated; don't edit it by hand.
- `contact.js` — inquiry form. Posts to a Google Apps Script web app ("Luttrell Inquiry Form", owned by leasing@theluttrellberkeley.com) that appends a row to the "Luttrell Inquiries" Google Sheet and emails leasing@.
- `assets/` — logo SVGs, hero video + poster, floor plans, photos. `assets/uploads/` holds files added through the editor.

## The website editor

`https://admin.theluttrellberkeley.com` — a password-protected, click-to-edit copy of the page, hosted on Cloudflare Pages from this same repo.

- `admin/` — the editor (plain JS modules, no build step). `admin/vendor/` holds Mediabunny (video conversion) and heic2any (iPhone photos).
- `functions/api/[[route]].js` + `server/` — the editor's API (Cloudflare Pages Functions): sign-in, read content, publish, history, inquiries.
- Publishing makes one commit to `main` (content.json + index.html + new uploads), credited to whoever is editing. GitHub Pages and Cloudflare both redeploy from it. Every published version is in the editor's History tab and can be restored.
- Inquiries tab and the "website updated" email go through the same Apps Script (`admin-*` actions, guarded by its `ADMIN_KEY` script property; run `createEditorKey` in the Apps Script editor to print it).

Cloudflare Pages settings: production branch `main`, no build command, output directory `/`. Environment (Settings → Variables and secrets):

| Name | Kind | Value |
| --- | --- | --- |
| `ADMIN_PASSWORD` | secret | the shared editor password (changing it signs everyone out) |
| `GITHUB_TOKEN` | secret | fine-grained token: this repo only, Contents read & write |
| `ADMIN_KEY` | secret | from the Apps Script's `createEditorKey` |
| `GITHUB_REPO` | text | `alecswjo/theluttrellberkeley.com` |
| `SITE_URL` | text | `https://theluttrellberkeley.com` |
| `APPS_SCRIPT_URL` | text | the inquiry web app URL in `contact.js` |
| `EDITORS` | text (optional) | names on the "Who's editing?" screen, default `Mom,Dad,Alec` |

## Testing the editor locally

```bash
node tests/fake-backend.mjs 8899        # fake GitHub, live site and Apps Script
npx wrangler@4.151.2 pages dev . --port 8788   # needs .dev.vars pointing at the fakes
node tests/e2e.mjs <playwright index.mjs> <media dir> <screenshot dir>
```

`.dev.vars` (not committed): `ADMIN_PASSWORD`, `GITHUB_TOKEN=test-gh-token`, `GITHUB_REPO`, `GITHUB_API=http://127.0.0.1:8899/gh`, `SITE_URL=http://127.0.0.1:8899/live`, `APPS_SCRIPT_URL=http://127.0.0.1:8899/apps`, `ADMIN_KEY=test-admin-key`.

DNS is at Porkbun: apex A/AAAA → GitHub Pages, `www` → `alecswjo.github.io`, `admin` → Cloudflare Pages, mail → Google Workspace.
