// Run: npx tsx --test apps/web/src/lib/humanizeIds.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { humanizeIds, labelForPath } from './humanizeIds';

const MID = '6af5c3eaa98c20aa13ac0746';
const UID = '0b6f2c1e-8a4d-4e3b-9c7a-2f1d5e6a7b8c';

test('the reported reply: a path in code becomes a friendly link', () => {
  const out = humanizeIds(`It's live on the public Bulletins page at \`/bulletins/${MID}\`.`);
  assert.equal(out, `It's live on the public Bulletins page at [Open in Bulletins](/bulletins/${MID}).`);
});

test('bare paths and links whose text is a path get a label', () => {
  assert.equal(humanizeIds(`See /horses/${MID} for more`), `See [Open the horse profile](/horses/${MID}) for more`);
  assert.equal(
    humanizeIds(`[/production-system/magazine-v2/${MID}](/production-system/magazine-v2/${MID})`),
    `[Open the magazine](/production-system/magazine-v2/${MID})`,
  );
});

test('a good link label is kept, only the id-bearing label is replaced', () => {
  const ok = `[Turf & Terrace](/bulletins/${MID})`;
  assert.equal(humanizeIds(ok), ok);
});

test('loose ids are removed with their wrappers', () => {
  assert.equal(humanizeIds(`Shared with Sam Lee (ID: ${MID}).`), 'Shared with Sam Lee.');
  assert.equal(humanizeIds(`Invited Jo, id ${UID}, as editor.`), 'Invited Jo, as editor.');
  assert.equal(humanizeIds(`Done: \`${MID}\``), 'Done:');
});

test('text without ids and fenced code are untouched; external URLs are not linkified', () => {
  assert.equal(humanizeIds('No ids here, page 4 of 10.'), 'No ids here, page 4 of 10.');
  const fenced = '```\n' + MID + '\n```';
  assert.equal(humanizeIds(fenced), fenced);
  assert.equal(humanizeIds('Colour #d4a843 stays.'), 'Colour #d4a843 stays.');
});

test('labels by route', () => {
  assert.equal(labelForPath(`/production-system/blogs/${MID}`), 'Open the blog post');
  assert.equal(labelForPath(`/orgs/${MID}`), 'Open the organisation');
  assert.equal(labelForPath(`/somewhere/${MID}`), 'Open it');
});
