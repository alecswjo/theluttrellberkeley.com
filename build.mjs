// Renders index.html from content.json. The editor's publish step does the same thing on the server.
import { readFileSync, writeFileSync } from "node:fs";
import { renderPage } from "./render.mjs";

const content = JSON.parse(readFileSync(new URL("./content.json", import.meta.url), "utf8"));
writeFileSync(new URL("./index.html", import.meta.url), renderPage(content));
console.log("index.html written");
