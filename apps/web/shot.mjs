// TEMP visual-QA: screenshot one premium page from the no-auth preview route.
import { chromium } from 'playwright';

const which = process.argv[2] || 'discussion-px';
const out = process.argv[3] || `shot-${which}.png`;
const url = `http://localhost:${process.argv[4] || '5174'}/__preview/premium`;

const browser = await chromium.launch({ channel: 'chrome' });
try {
  const page = await browser.newPage({ deviceScaleFactor: 2 });
  await page.setViewportSize({ width: 1100, height: 1300 });
  await page.goto(url, { waitUntil: 'networkidle', timeout: 60000 });
  // let Google Fonts + images settle
  try { await page.evaluate(() => document.fonts.ready); } catch {}
  await page.waitForTimeout(3000);
  const el = await page.waitForSelector(`[data-page="${which}"]`, { timeout: 30000 });
  await el.screenshot({ path: out });
  console.log('OK wrote', out);
} catch (e) {
  console.error('ERR', e.message);
  process.exitCode = 1;
} finally {
  await browser.close();
}
