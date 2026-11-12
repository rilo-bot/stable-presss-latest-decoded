// Run: npx tsx --test apps/web/src/lib/chatText.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanAssistantText, stripMachineText } from './chatText';

test('tool calls written out as code are dropped, the prose stays', () => {
  const t = 'Let me look that up.\n\n```tool_code\nprint(default_api.searchHorses(query="Winx"))\n```\n\nHere is Winx.';
  assert.equal(stripMachineText(t), 'Let me look that up.\n\nHere is Winx.');
  assert.equal(stripMachineText('print(default_api.searchHorses(query="Winx"))\nFound her.'), 'Found her.');
  assert.equal(stripMachineText('offer_choices({"questions":[]})\nPick one below.'), 'Pick one below.');
});

test('raw JSON objects and json blocks are dropped', () => {
  assert.equal(stripMachineText('Done.\n{"name": "navigateTo", "args": {"to": "bulletins"}}'), 'Done.');
  assert.equal(stripMachineText('Done.\n\n```json\n{"ok": true}\n```'), 'Done.');
});

test('trailing narration of its own tool use is dropped', () => {
  assert.equal(
    stripMachineText("Would you like to open it? Let me know what you'd like to do next! Let's offer some quick options:"),
    "Would you like to open it? Let me know what you'd like to do next!",
  );
});

test('normal replies — lists, tables, links, a genuine code-free answer — are untouched', () => {
  const t = "Here are two horses:\n\n* **[Winx](/horses/abc)** — 37 wins\n* Verry Elleegant\n\n| Horse | Wins |\n| :--- | :--- |\n| Winx | 37 |\n\nLet me know what you'd like next!";
  assert.equal(stripMachineText(t), t);
});

test('cleanAssistantText also hides ids', () => {
  assert.equal(
    cleanAssistantText('Open `/bulletins/6af5c3eaa98c20aa13ac0746` now.'),
    'Open [Open in Bulletins](/bulletins/6af5c3eaa98c20aa13ac0746) now.',
  );
});
