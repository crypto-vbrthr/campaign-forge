import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const css = fs.readFileSync(path.join(root, "styles", "campaign-forge.css"), "utf8");

test("Campaign Forge critical UI rules are module-scoped", () => {
  for (const selector of [
    ".campaign-forge .cf-tabs",
    ".campaign-forge .cf-toolbar",
    ".campaign-forge .cf-panel",
    ".campaign-forge .cf-tree"
  ]) assert.ok(css.includes(selector));

  assert.equal(/^\.cf-tabs\s*\{/m.test(css), false);
  assert.equal(/^\.cf-toolbar\s*\{/m.test(css), false);
});
