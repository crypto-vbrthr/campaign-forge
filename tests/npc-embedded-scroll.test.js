import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const css = fs.readFileSync(new URL("../styles/campaign-forge.css", import.meta.url), "utf8");
const template = fs.readFileSync(new URL("../templates/npc-forge-host.hbs", import.meta.url), "utf8");

test("NPC Forge embedded ApplicationV2 provides a height-constrained scroll layout", () => {
  assert.match(template, /class="cf-npc-forge-host npc-forge-editor-host"/);
  assert.match(css, /\.campaign-forge\.cf-npc-forge-host-app \.window-content\{[\s\S]*?min-height:\s*0;[\s\S]*?overflow:\s*hidden;/);
  assert.match(css, /\.campaign-forge\.cf-npc-forge-host-app \.cf-npc-forge-app-shell\{[\s\S]*?height:\s*100%;[\s\S]*?grid-template-rows:\s*minmax\(0, 1fr\) auto;/);
  assert.match(css, /\.campaign-forge\.cf-npc-forge-host-app \.cf-npc-forge-host\{[\s\S]*?height:\s*100%;[\s\S]*?min-height:\s*0;[\s\S]*?overflow:\s*hidden;/);
  assert.match(css, /\.campaign-forge\.cf-npc-forge-host-app \.cf-npc-forge-host > \.npc-forge-shell\{[\s\S]*?height:\s*100%;[\s\S]*?min-height:\s*0;/);
});
