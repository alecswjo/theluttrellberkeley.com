# theluttrellberkeley.com

One-page site for The Luttrell, 2328 Channing Way, Berkeley. Static HTML on GitHub Pages; push to `main` to deploy.

- `index.html`, `styles.css`, `site.js` — the page ("Postcard" design).
- `contact.js` — inquiry form. Posts to a Google Apps Script web app ("Luttrell Inquiry Form", owned by leasing@theluttrellberkeley.com) that appends a row to the "Luttrell Inquiries" Google Sheet and emails leasing@.
- `assets/` — logo SVGs (built from the house drawing), hero video + poster, floor plans, retouched photos.

DNS is at Porkbun: apex A/AAAA → GitHub Pages, `www` → `alecswjo.github.io`, mail → Google Workspace.
