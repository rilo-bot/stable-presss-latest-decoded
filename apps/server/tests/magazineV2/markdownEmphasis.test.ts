// Markdown emphasis in model-written copy becomes real italics/bold (lib/magazineV2/sanitize.ts).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { markdownEmphasisToHtml } from '../../src/lib/magazineV2/sanitize.js';

test('the reported headlines: *word* → italic, **word** → bold', () => {
  assert.equal(markdownEmphasisToHtml('NZTROF: The People Behind the *Thoroughbred*'), 'NZTROF: The People Behind the <em>Thoroughbred</em>');
  assert.equal(markdownEmphasisToHtml('A warm welcome, *race fan*'), 'A warm welcome, <em>race fan</em>');
  assert.equal(markdownEmphasisToHtml('The **big** day.'), 'The <strong>big</strong> day.');
  assert.equal(markdownEmphasisToHtml('“*Quoted*” words'), '“<em>Quoted</em>” words');
});

test('stars that are not emphasis are left alone', () => {
  for (const s of ['Rated 5* by readers', 'Terms apply*', '* footnote', 'a * b * c', '2*3=6', 'no stars here']) {
    assert.equal(markdownEmphasisToHtml(s), s);
  }
});
