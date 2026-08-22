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
    ".campaign-forge .cf-tree-row",
    ".campaign-forge .cf-editor",
    ".campaign-forge .cf-row-actions",
    ".campaign-forge button.icon"
  ]) assert.ok(css.includes(selector), selector);

  for (const selector of [
    /^\.cf-tabs\s*\{/m,
    /^\.cf-toolbar\s*\{/m,
    /^\.cf-panel\s*\{/m,
    /^\.cf-tree-row\s*\{/m,
    /^\.cf-editor\s*\{/m,
    /^button\.icon\s*[,\{]/m
  ]) assert.equal(selector.test(css), false);
});
