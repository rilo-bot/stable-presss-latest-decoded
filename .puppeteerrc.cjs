// ---------------------------------------------------------------------------
// Puppeteer — where the downloaded Chromium lives.
//
// WHY THIS FILE EXISTS. Puppeteer defaults its browser cache to
// `$HOME/.cache/puppeteer`. On Render that resolves to `/opt/render/.cache/
// puppeteer`, which is OUTSIDE the project directory — and Render carries only
// the project directory from the build container into the runtime container. So
// `npm install` downloaded Chromium at build time, the runtime container started
// with an empty $HOME, and every PDF render failed with:
//
//   Could not find Chrome (ver. 150.0.7871.24) ... your cache path is
//   incorrectly configured (which is: /opt/render/.cache/puppeteer).
//
// That is the 500 behind "Download PDF" on every published issue: renderBulletinPdf
// cannot launch a browser, retries once with a fresh launch (which fails the same
// way, because a missing binary is not a crashed browser), and the route 500s.
//
// Pointing the cache inside the repo puts the binary somewhere that survives the
// hand-off. __dirname is the repo root, and the server is started from the root
// (`node apps/server/dist/index.js`), so install-time and launch-time resolve to
// the same directory.
//
// STILL REQUIRED ON THE BUILD SIDE: Render caches node_modules between builds, and
// a restored cache means npm skips puppeteer's postinstall — so the download never
// happens and this path stays empty. The build command has to fetch the browser
// explicitly:
//
//   npm ci && npx puppeteer browsers install chrome && npm run build
//
// Local dev uses this path too, deliberately: one cache location everywhere beats
// a prod-only override that nobody can reproduce. Run the same
// `npx puppeteer browsers install chrome` once after pulling this change.
// ---------------------------------------------------------------------------

const { join } = require('path')

/** @type {import('puppeteer').Configuration} */
module.exports = {
  cacheDirectory: join(__dirname, '.cache', 'puppeteer'),
}
