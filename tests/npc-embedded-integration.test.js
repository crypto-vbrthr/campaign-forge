import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(new URL("../scripts/app/campaign-forge-app.js", import.meta.url), "utf8");
const template = fs.readFileSync(new URL("../templates/npc-forge-host.hbs", import.meta.url), "utf8");

test("NPC Forge embedded host uses a dedicated ApplicationV2 and the public editor lifecycle", () => {
  assert.match(source, /class CampaignNpcForgeHostApp extends HandlebarsApplicationMixin\(ApplicationV2\)/);
  assert.match(source, /template: `modules\/\$\{MODULE_ID\}\/templates\/npc-forge-host\.hbs`/);
  assert.match(source, /this\.session\?\.mount\?\.\(host\)/);
  assert.match(source, /await this\.session\?\.whenRendered\?\.\(\)/);
  assert.match(template, /data-action="npcGenerate"/);
  assert.match(template, /data-action="npcCommit"/);
  assert.match(template, /data-action="npcCancel"/);

  const start = source.indexOf("static async _actionCreateKeyPlayerWithNpcForge()");
  const end = source.indexOf("static _actionCancelEditor()", start);
  const block = source.slice(start, end);
  assert.match(block, /actionBar:\s*"host"/);
  assert.match(block, /capabilities:\s*\{\s*createActor:\s*true/);
  assert.match(block, /new CampaignNpcForgeHostApp\(session/);
  assert.match(block, /await hostApp\.render\(\{ force: true \}\)/);
  assert.match(block, /onCommit:\s*async \(\) =>/);
  assert.match(block, /session\?\.createActor\?\.\(\{ renderSheet: false \}\)/);
  assert.match(block, /onError:/);
});
