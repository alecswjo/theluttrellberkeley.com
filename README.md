# theluttrellberkeley.com

Marketing and leasing site for **The Luttrell**, 2328 Channing Way, Berkeley, CA 94704.
Plain HTML, CSS and JavaScript. There is no build step: edit a file, commit, push.

## Files

| Path | What it is |
| --- | --- |
| `index.html`, `floorplans.html`, `amenities.html`, `gallery.html`, `neighborhood.html`, `contact.html`, `404.html` | The pages |
| `assets/js/config.js` | **Edit this** for email, phone, Apply/Tour links, the announcement bar, prices and availability |
| `assets/js/photos.js` | Photo manifest: every photo's file name, alt text, caption and gallery group |
| `assets/js/photos-available.js` | List of photo files that exist (written by `tools/import-photos.sh`) |
| `assets/js/site.js` | Page behavior (menu, banner, gallery lightbox, filling in prices and photos) |
| `assets/css/site.css` | All styles. Colors and fonts are variables at the top |
| `assets/floorplans/*.webp` | Floor plan drawings, cut from `assets/Luttrell_House_Floor_Plans.pdf` |
| `assets/photos/*.jpg` | Property photos |
| `tools/import-photos.sh` | Copies the owner's photos in with clean names |
| `CNAME`, `.nojekyll`, `robots.txt`, `sitemap.xml` | GitHub Pages and search engine files |

## Common edits

### Prices

Open `assets/js/config.js` and fill in `PRICING`. Each floor plan has a `private` price (per bed)
and a `shared` price (per person in a shared room). `null` means the plan has no shared rooms.
An empty string shows "Contact for pricing".

```js
PRICING: {
  "layout-1": { private: "$1,950", shared: "$1,450" },
  "layout-3": { private: "From $1,900", shared: null },
  ...
}
```

The floor plans page says "All advertised prices include required fees", so enter all-in prices.

### Availability

In the same file, `AVAILABILITY` holds the labels shown on each card, for example
`["Spring 2027 available", "Fall 2027"]`. An empty list shows "Contact for availability".

### Apply and Book a Tour buttons

Set `APPLY_URL` and `TOUR_URL` in `config.js`. They default to a pre-filled email to
leasing@theluttrellberkeley.com. Paste a Google Form link (or any URL) to replace them.

### Phone number

Set `PHONE` in `config.js`, for example `"(510) 555-0123"`. While it is empty, every phone
icon and link stays hidden.

### Announcement bar

`ANNOUNCEMENT` in `config.js`. Set `enabled: false` to hide it. Change `id` when you change the
text, so visitors who closed the old message see the new one.

### Floor plan text

Room lists, unit numbers and furniture are written directly in `floorplans.html`, one
`<article class="plan">` per plan. The `data-plan` id on each card must match the keys in
`PRICING` and `AVAILABILITY`.

## Photos

1. Put the owner's photos in `~/Downloads` (or any folder) with their original names
   (`KItchen_E3.jpeg`, `Washer&dryer_Laundry.jpeg`, ...).
2. Run `tools/import-photos.sh` (or `tools/import-photos.sh /path/to/folder`).
   It copies each known file to `assets/photos/` with a kebab-case name, shrinks anything over
   2000px on the long edge, and updates `assets/js/photos-available.js`.
3. Open `assets/js/photos.js` and fix any alt text that starts with `DRAFT:`. That text was
   written before the photo arrived, so describe what the photo actually shows.

To add a photo the script does not know, copy it to `assets/photos/` yourself, add an entry to
`photos.js`, and add its file name to `photos-available.js` (or add a line to the `map_name`
list in the script and re-run it).

A photo appears on a page wherever an element has `data-photo="<id>"`. Missing photos show a
labeled cream-and-green placeholder. To hide the placeholders on the gallery page before launch,
set `SHOW_GALLERY_PLACEHOLDERS: false` in `config.js`.

The home page hero uses `exterior-east-side`. To change it, edit the `data-photo` value on the
`hero__media` element in `index.html`. Use a landscape exterior photo at least 1600px wide;
the current one is 640 x 480 and looks soft on large screens.

## Preview locally

```sh
python3 -m http.server 8000
```

Then open http://localhost:8000. (The custom 404 page only appears on GitHub Pages.)

## Deploy to GitHub Pages

1. Create a GitHub repository and push this folder to its `main` branch.
2. In the repository, open **Settings > Pages**. Under **Build and deployment**, pick
   **Deploy from a branch**, branch `main`, folder `/ (root)`.
3. The `CNAME` file already sets the custom domain to `theluttrellberkeley.com`. At the domain
   registrar, add DNS records for GitHub Pages:
   - `A` records for `@`: `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`
   - `CNAME` record for `www`: `<your-github-username>.github.io`
4. After DNS resolves, tick **Enforce HTTPS** in **Settings > Pages**.

When pages change, update the `<lastmod>` dates in `sitemap.xml`.

## Content notes

- Do not say "Cal" or suggest any link to UC Berkeley. Mention UC Berkeley only to describe
  location. The footer states the property is not affiliated with the University of California.
- Walking times on the neighborhood page come from OpenStreetMap walking routes from
  2328 Channing Way, rounded up.
