// End-to-end test of the website editor against tests/fake-backend.mjs.
// Needs: fake backend on :8899, `wrangler pages dev . --port 8788` with the test .dev.vars.
// Usage: node tests/e2e.mjs <playwright index.mjs path> <media dir> <screenshot dir>

const [pwPath, mediaDir, shotDir] = process.argv.slice(2);
const { chromium } = await import(pwPath);

const BASE = "http://localhost:8788";
const FAKE = "http://127.0.0.1:8899";
let failures = 0;
const check = (cond, msg) => {
  console.log(`${cond ? "  ok" : "FAIL"}  ${msg}`);
  if (!cond) failures++;
};
const state = () => fetch(`${FAKE}/test/state`).then((r) => r.json());

await fetch(`${FAKE}/test/reset`, { method: "POST" });

const browser = await chromium.launch({ channel: "chrome" });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => m.type() === "error" && !/401|Failed to load resource/.test(m.text()) && errors.push(m.text()));
const shot = (name) => page.screenshot({ path: `${shotDir}/${name}.png` });
const frame = () => page.frameLocator("#preview");

// --- sign in ---
await page.goto(`${BASE}/admin/`);
await page.fill("#password", "nope");
await page.click("#signin-btn");
await page.waitForFunction(() => document.querySelector("#signin-error").textContent.length > 0);
check((await page.textContent("#signin-error")).includes("isn't right"), "wrong password is rejected with a plain message");
await page.fill("#password", "local-test-password");
await page.click("#signin-btn");
await page.click("text=Mom");
await frame().locator("#intro-title").waitFor();
check(await page.isVisible("#tip"), "first-run tip is shown");
check((await page.textContent("#publish")).trim() === "Published", "nothing to publish at start");
await shot("01-editor");

// --- edit text in place ---
const headline = frame().locator("#intro-title");
await headline.click();
await page.keyboard.press("Meta+A");
await page.keyboard.type("Furnished rooms, a short walk from campus.");
await page.waitForTimeout(200);
check((await page.textContent("#publish")).includes("Publish 1 change"), "editing a headline counts as one change");
const price = frame().locator('[data-edit="rooms.plans.1.prices.0.price"]');
await price.click();
await page.keyboard.press("Meta+A");
await page.keyboard.type("$1,450");
check((await page.textContent("#publish")).includes("2 changes"), "editing a price adds a change");

// Enter in a single-line field must not insert a line break.
await price.press("End");
await price.press("Enter");
check(!(await price.innerText()).includes("\n"), "Enter doesn't add a line break in a one-line field");

// --- undo / redo ---
await page.click("#undo");
await page.waitForTimeout(150);
check((await frame().locator('[data-edit="rooms.plans.1.prices.0.price"]').textContent()) === "$1,390", "Undo restores the old price");
await page.click("#redo");
await page.waitForTimeout(150);
check((await frame().locator('[data-edit="rooms.plans.1.prices.0.price"]').textContent()) === "$1,450", "Redo brings the new price back");

// --- draft survives a reload ---
await page.reload();
await frame().locator("#intro-title").waitFor();
check((await frame().locator("#intro-title").textContent()).includes("short walk"), "draft is kept after reloading the page");

// --- lists: reorder photos, add and remove a price ---
const hover = async (sel) => {
  await frame().locator(sel).evaluate((el) => el.scrollIntoView({ block: "center" }));
  await frame().locator(sel).hover();
};
const firstCaption = () => frame().locator('[data-edit="photos.items.0.caption"]').textContent();
const before = await firstCaption();
await hover('[data-item="photos.items"][data-index="0"]');
await frame().locator('[data-item="photos.items"][data-index="0"] .ed-tools button[title^="Move this photo right"]').click();
await page.waitForTimeout(150);
check((await frame().locator('[data-edit="photos.items.1.caption"]').textContent()) === before, "photo moved one place right");
await frame().locator('[data-add="rooms.plans.0.prices"]').click();
await page.waitForTimeout(300);
await page.keyboard.type("Parking");
await page.waitForTimeout(150);
check((await frame().locator('[data-edit="rooms.plans.0.prices.3.label"]').textContent()) === "Parking", "added a price row and typed its name");
await hover('[data-item="rooms.plans.0.prices"][data-index="3"]');
await frame().locator('[data-item="rooms.plans.0.prices"][data-index="3"] .ed-tools button.ed-danger').click();
await page.waitForTimeout(150);
check((await frame().locator('[data-item="rooms.plans.0.prices"]').count()) === 3, "removed the price row");
check(await page.isVisible("#toast >> text=Undo"), "removing offers Undo");

// --- availability label ---
await frame().locator('[data-status-for="rooms.plans.2"]').click();
await page.click("#panel >> text=Few left");
await page.waitForTimeout(150);
check((await frame().locator(".plan-status").first().textContent()) === "Few left", "preset availability label shows on the plan");
await page.click('#panel label.choice:has-text("Your own words") input');
await page.fill('#panel .field input[type="text"]', "2 rooms left for Fall");
await page.waitForTimeout(150);
check((await frame().locator(".plan-status").first().textContent()) === "2 rooms left for Fall", "custom availability label works");
await shot("02-status-panel");
await page.click("#panel .icon-btn");

// --- replace photos: JPEG, HEIC, a small one ---
await frame().locator('[data-media="photos.items.2"]').click();
await page.waitForFunction(() => document.querySelector("#panel .thumb img")?.complete);
check((await page.locator("#panel .thumb img").evaluate((i) => i.naturalWidth)) > 0, "photo panel shows the current photo");
await page.setInputFiles('#panel input[type="file"]', `${mediaDir}/large.jpg`);
await page.waitForFunction(() => document.querySelector("#busy").hidden);
await page.waitForTimeout(300);
let src = await frame().locator('[data-media="photos.items.2"] img').getAttribute("src");
check(src.startsWith("blob:"), "replaced photo shows from this computer before publishing");
await page.locator("#panel .thumb.can-focus").click({ position: { x: 40, y: 40 } });
await page.waitForTimeout(150);
check(/object-position/.test(await frame().locator('[data-media="photos.items.2"] img').getAttribute("style")), "clicking the thumbnail sets the photo's focus point");
await page.fill("#panel textarea", "Kitchen with stone counters.");
await shot("03-photo-panel");
await page.click("#panel .icon-btn");
await frame().locator('[data-media="photos.items.3"]').click();
await page.setInputFiles('#panel input[type="file"]', `${mediaDir}/photo.heic`);
await page.waitForFunction(() => document.querySelector("#busy").hidden, null, { timeout: 30000 });
await page.waitForTimeout(300);
src = await frame().locator('[data-media="photos.items.3"] img').getAttribute("src");
check(src.startsWith("blob:"), "iPhone HEIC photo is converted and shown");
await page.setInputFiles('#panel input[type="file"]', `${mediaDir}/small.jpg`);
await page.waitForFunction(() => document.querySelector("#busy").hidden);
await page.waitForTimeout(200);
check((await page.textContent("#toast")).includes("blurry"), "small photo gets a blurry warning");
await page.click("#panel .icon-btn");

// --- add a photo ---
const photoCount = await frame().locator('[data-item="photos.items"]').count();
const chooser = page.waitForEvent("filechooser");
await frame().locator('[data-add="photos.items"]').click();
await (await chooser).setFiles(`${mediaDir}/photo.jpg`);
await page.waitForFunction((n) => document.querySelector("#preview").contentDocument.querySelectorAll('[data-item="photos.items"]').length === n + 1, photoCount);
check(true, "added a new photo to the gallery");
await page.click("#panel .icon-btn");

// --- video ---
await frame().locator(".ed-media-btn", { hasText: "Change video" }).click();
await page.waitForFunction(() => document.querySelector("#panel .thumb-video")?.readyState >= 1, null, { timeout: 15000 }).catch(() => {});
check((await page.locator("#panel .thumb-video").evaluate((v) => v.videoWidth)) > 0, "video panel shows the current video");
await page.setInputFiles('#panel input[type="file"]', `${mediaDir}/clip.mp4`);
await page.locator('#panel input[type="range"]').waitFor();
await page.locator('#panel input[type="range"]').fill("3");
await page.click("#panel >> text=Use this video");
await page.waitForFunction(() => document.querySelector("#toast")?.textContent.includes("Video replaced") || document.querySelector("#toast")?.textContent.includes("couldn't"), null, { timeout: 120000 });
check((await page.textContent("#toast")).includes("Video replaced"), "video is trimmed and converted in the browser");
await page.click("#panel .icon-btn");

// --- Google settings ---
await page.click("#settings-btn");
await page.fill("#panel input", "The Luttrell · Student rooms in Berkeley");
check((await page.textContent(".serp-title")) === "The Luttrell · Student rooms in Berkeley", "Google preview updates as you type");
await page.click("#panel .icon-btn");

// --- phone preview ---
await page.click('[data-device="phone"]');
await page.waitForTimeout(300);
check((await page.locator("#preview").boundingBox()).width <= 392, "phone preview narrows the page");
await shot("04-phone");
await page.click('[data-device="desktop"]');

// --- publish ---
await page.click("#publish");
await page.locator("dialog .change-list li").first().waitFor();
const listed = await page.locator("dialog .change-list li").allInnerTexts();
console.log("      changes listed:", listed.length, listed.slice(0, 4));
check(listed.some((c) => c.includes("Intro headline")), "publish review lists the headline change in plain words");
await shot("05-publish-review");
await page.getByRole("button", { name: "Publish", exact: true }).click();
await page.waitForSelector("dialog .success", { timeout: 60000 });
check(true, "publish reports the site is live");
await shot("06-published");
await page.click("dialog >> text=Done");
let s = await state();
const c = s.content;
check(s.commits[0].author === "Mom" && s.commits[0].message.startsWith("Website update by Mom"), "commit is credited to Mom");
check(c.intro.headline === "Furnished rooms, a short walk from campus." && c.rooms.plans[1].prices[0].price === "$1,450", "content.json has the new text");
check(c.photos.items[2].src.startsWith("assets/uploads/") && s.commits[0].files.includes(c.photos.items[2].src), "uploaded photo is in the commit");
check(c.hero.video.startsWith("assets/uploads/") && c.hero.poster.startsWith("assets/uploads/"), "new video and poster are in the commit");
check(s.indexHtml.includes("a short walk from campus") && !s.indexHtml.includes("data-edit"), "index.html is rendered without editor markup");
check(s.notifications.length === 1 && s.notifications[0].subject === "Website updated by Mom", "leasing@ gets a publish email");
const video = await fetch(`${FAKE}/test/file?path=${c.hero.video}`).then((r) => r.arrayBuffer());
check(video.byteLength > 1000 && video.byteLength < 8e6, `video file is web-sized (${Math.round(video.byteLength / 1024)} KB)`);
check((await page.textContent("#publish")).trim() === "Published", "editor is clean after publishing");

// --- conflict: someone else publishes while Mom edits ---
await frame().locator('[data-edit="inquire.body"]').click();
await page.keyboard.press("Meta+A");
await page.keyboard.type("Tell us which term you want. We reply by email.");
await fetch(`${FAKE}/test/other-publish`, { method: "POST" });
await page.click("#publish");
await page.getByRole("button", { name: "Publish", exact: true }).click();
await page.waitForSelector("dialog >> text=Someone else just published");
await page.click("dialog >> text=OK");
check((await frame().locator('[data-edit="location.lead"]').textContent()) === "Changed by someone else.", "the other person's change is merged in");
check((await frame().locator('[data-edit="inquire.body"]').textContent()).includes("which term you want"), "Mom's change is kept");
await page.click("#publish");
await page.getByRole("button", { name: "Publish", exact: true }).click();
await page.waitForSelector("dialog .success", { timeout: 60000 });
await page.click("dialog >> text=Done");
s = await state();
check(s.content.location.lead === "Changed by someone else." && s.content.inquire.body.includes("which term you want"), "both changes are live after republishing");

// --- history: preview and restore ---
await page.click('[data-tab="history"]');
await page.locator(".version").first().waitFor();
const versions = await page.locator(".version").count();
check(versions >= 3, `history lists ${versions} versions`);
await shot("07-history");
await page.locator(".version").last().locator("text=Preview").click();
await page.locator("dialog iframe").waitFor();
await page.waitForTimeout(500);
await shot("08-history-preview");
await page.click("dialog >> text=Close");
await page.locator(".version").last().locator("text=Restore…").click();
await page.getByRole("button", { name: "Restore", exact: true }).click();
await page.waitForTimeout(300);
check((await frame().locator("#intro-title").textContent()).includes("five minutes"), "restoring loads the original version into the editor");
check(/Publish \d+ change/.test(await page.textContent("#publish")), "restored version waits for Publish");
await page.click("#discard");
await page.getByRole("button", { name: "Discard changes", exact: true }).last().click();
await page.waitForTimeout(200);
check((await page.textContent("#publish")).trim() === "Published", "Discard goes back to the live version");

// --- inquiries ---
await page.click('[data-tab="inquiries"]');
await page.locator(".inquiry").first().waitFor();
check((await page.locator(".inquiry").count()) === 1, "Waiting-for-reply shows only unanswered inquiries");
await page.click('[data-filter="all"]');
check((await page.locator(".inquiry").count()) === 2, "All shows every inquiry");
check((await page.locator(".inq-name").allInnerTexts()).includes("<script>alert(1)</script>"), "inquiry text is shown as text, never run as code");
await shot("09-inquiries");
await page.locator('.inquiry:has-text("Jamie Park") input[type="checkbox"]').check();
await page.waitForTimeout(300);
s = await state();
check(s.inquiries.find((r) => r.name === "Jamie Park").status === "Replied", "ticking Replied saves to the sheet");
check(await page.isHidden("#inquiry-badge"), "badge clears when everything is replied");

// --- sign out ---
await page.click("#who-menu");
await page.click("#sign-out");
await page.waitForSelector("#signin:not([hidden])");
const after = await page.evaluate(() => fetch("/api/content").then((r) => r.status));
check(after === 401, "API refuses requests after signing out");

check(errors.length === 0, `no browser errors${errors.length ? `: ${errors.join(" | ")}` : ""}`);
await browser.close();
console.log(failures ? `\n${failures} FAILED` : "\nALL PASSED");
process.exit(failures ? 1 : 0);
