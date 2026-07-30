const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");

const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const script = fs.readFileSync(path.join(root, "script.js"), "utf8");
const utils = fs.readFileSync(path.join(root, "image-utils.js"), "utf8");
const css = fs.readFileSync(path.join(root, "style.css"), "utf8");

assert.doesNotMatch(html, /\{\/\*/, "JSX形式のコメントをHTMLへ残さない");
assert.doesNotMatch(html, /https?:\/\//, "外部リソースへ接続しない");
assert.match(html, /lang="ja"/);
assert.match(html, /<meta name="description"/);
assert.match(html, /http-equiv="Content-Security-Policy"/);
assert.match(html, /connect-src 'none'/);
assert.match(html, /id="upload-error"[^>]+role="alert"/);
assert.match(html, /id="render-status"[^>]+aria-live="polite"/);
assert.match(html, /<fieldset>/);
assert.match(html, /<legend>/);
assert.doesNotMatch(html, /class="visually-hidden" type="submit"/);
assert.match(html, /id="preview-title" tabindex="-1"/);
assert.match(script, /URL\.revokeObjectURL/);
assert.match(script, /createImageBitmap/);
assert.match(script, /blob\.type !== type/);
assert.match(script, /settingsRevision/);
assert.match(utils, /maxSourcePixels/);
assert.match(utils, /maxOutputPixels/);
assert.match(utils, /maxPreviewPixels/);
assert.match(utils, /parseImageDimensions/);
assert.match(css, /prefers-reduced-motion/);
assert.match(css, /prefers-color-scheme: dark/);

const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map(match => match[1]);
assert.equal(new Set(ids).size, ids.length, "HTMLのidは重複できません");

for (const [, target] of html.matchAll(/\sfor="([^"]+)"/g)) {
  assert.ok(ids.includes(target), `label/outputのfor="${target}"に対応するidが必要です`);
}

console.log("static-check: HTML、プライバシー、安全制限、アクセシビリティ構造を確認しました");
