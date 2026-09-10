import { readFile, mkdir, writeFile, copyFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";

const dist = resolve("dist-google");
const out = resolve("../outputs/google-apps-script");
await mkdir(out, { recursive: true });
const assets = await readdir(resolve(dist, "assets"));
const js = assets.filter(name => name.endsWith(".js"));
const css = assets.filter(name => name.endsWith(".css"));
if (js.length !== 1 || css.length !== 1 || assets.some(name => !/\.(js|css)$/.test(name))) throw new Error("Expected one self-contained script and stylesheet");
const script = await readFile(resolve(dist, "assets", js[0]), "utf8");
const style = await readFile(resolve(dist, "assets", css[0]), "utf8");
const html = `<!doctype html><html lang="th"><head><meta charset="utf-8"><base target="_top"><style>${style.replace(/<\/style/gi, "<\\/style")}</style></head><body><div id="root"></div><script type="module">${script.replace(/<\/script/gi, "<\\/script")}</script></body></html>`;
await writeFile(resolve(out, "Index.html"), html);
for (const name of ["Code.gs", "appsscript.json"]) await copyFile(resolve("../google-apps-script", name), resolve(out, name));
console.log(`Apps Script package: ${out}`);
