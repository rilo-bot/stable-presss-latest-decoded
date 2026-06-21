// TEMP: screenshot a cropped band of a premium page to inspect small icons.
import { chromium } from 'playwright';
const which = process.argv[2] || 'discussion-px';
const out = process.argv[3] || `crop-${which}.png`;
const topFrac = parseFloat(process.argv[4] ?? '0.45');
const hFrac = parseFloat(process.argv[5] ?? '0.32');
const port = process.argv[6] || '5174';
const browser = await chromium.launch({ channel: 'chrome' });
try {
  const page = await browser.newPage({ deviceScaleFactor: 3 });
  await page.setViewportSize({ width: 1100, height: 1300 });
  await page.goto(`http://localhost:${port}/__preview/premium`, { waitUntil: 'networkidle', timeout: 60000 });
  try { await page.evaluate(() => document.fonts.ready); } catch {}
  await page.waitForTimeout(2500);
  const el = await page.waitForSelector(`[data-page="${which}"]`, { timeout: 30000 });
  await el.evaluate((node) => node.scrollIntoView({ block: 'start' }));
  await page.waitForTimeout(300);
  const b = await el.boundingBox();
  await page.screenshot({ path: out, clip: { x: b.x, y: b.y + b.height * topFrac, width: b.width, height: b.height * hFrac } });
  console.log('OK wrote', out);
} catch (e) { console.error('ERR', e.message); process.exitCode = 1; }
finally { await browser.close(); }
