// Upload relay — storage.verifyPresignedPutUrl.
//
// The relay (POST /api/uploads/relay) stores a file server-side when the browser
// cannot PUT it to S3 directly (bucket CORS missing the site's address). It must
// accept ONLY presigned URLs this server issued and that are still valid, and it
// must derive the key from the URL, never from anything else the client sends.
// Offline: dummy credentials, no network — presigning is pure computation.
import { before, test } from 'node:test'
import assert from 'node:assert/strict'

process.env.S3_BUCKET = 'relay-test-bucket'
process.env.S3_REGION = 'ap-southeast-2'
process.env.AWS_ACCESS_KEY_ID = 'AKIATESTRELAY000000'
process.env.AWS_SECRET_ACCESS_KEY = 'test-secret-key-for-relay-verification'
delete process.env.S3_ENDPOINT

let storage: typeof import('../src/lib/storage.js')['storage']
before(async () => {
  // Imported after the env above is set — storage reads its config at load time.
  storage = (await import('../src/lib/storage.js')).storage
})

const KEY = 'public/uploads/u1/1700000000-photo.jpg'

test('accepts a URL this server presigned and returns its key', async () => {
  const url = await storage.presignPutUrl({ key: KEY, contentType: 'image/jpeg', expiresIn: 300 })
  assert.deepEqual(await storage.verifyPresignedPutUrl(url, 'image/jpeg'), { key: KEY })
})

test('the presigned URL carries no empty-body checksum (SDK default disabled)', async () => {
  const url = new URL(await storage.presignPutUrl({ key: KEY, contentType: 'image/jpeg' }))
  assert.equal([...url.searchParams.keys()].some((k) => /checksum/i.test(k)), false)
})

test('rejects a tampered signature', async () => {
  const url = new URL(await storage.presignPutUrl({ key: KEY, contentType: 'image/jpeg' }))
  const sig = url.searchParams.get('X-Amz-Signature')!
  url.searchParams.set('X-Amz-Signature', (sig[0] === 'a' ? 'b' : 'a') + sig.slice(1))
  assert.equal(await storage.verifyPresignedPutUrl(url.toString(), 'image/jpeg'), null)
})

test('rejects the signature replayed onto a different key', async () => {
  const url = new URL(await storage.presignPutUrl({ key: KEY, contentType: 'image/jpeg' }))
  url.pathname = '/public/uploads/u1/someone-elses-file.jpg'
  assert.equal(await storage.verifyPresignedPutUrl(url.toString(), 'image/jpeg'), null)
})

test('rejects an expired URL', async () => {
  const url = new URL(await storage.presignPutUrl({ key: KEY, contentType: 'image/jpeg', expiresIn: 1 }))
  // Pretend it was signed 10 minutes ago: re-dating breaks the signature too, but the
  // expiry check must reject it on its own — assert via a genuinely old signing date.
  url.searchParams.set('X-Amz-Date', '20200101T000000Z')
  assert.equal(await storage.verifyPresignedPutUrl(url.toString(), 'image/jpeg'), null)
})

test('rejects another host and non-URLs', async () => {
  const url = new URL(await storage.presignPutUrl({ key: KEY, contentType: 'image/jpeg' }))
  url.host = 'evil.example.com'
  assert.equal(await storage.verifyPresignedPutUrl(url.toString(), 'image/jpeg'), null)
  assert.equal(await storage.verifyPresignedPutUrl('not a url', 'image/jpeg'), null)
})

test('rejects keys outside the public prefix', async () => {
  const url = new URL(await storage.presignPutUrl({ key: KEY, contentType: 'image/jpeg' }))
  url.pathname = '/private/secret.jpg'
  assert.equal(await storage.verifyPresignedPutUrl(url.toString(), 'image/jpeg'), null)
})

// Path-style URLs ("/<bucket>/<key>") — the SDK uses them for bucket names that
// aren't valid hostnames and for custom endpoints. The compiled-build smoke test
// caught the first version rejecting these. Run in a child process so this
// file's module-level env (a DNS-safe bucket) stays untouched.
test('accepts path-style presigned URLs (non-DNS bucket name)', async () => {
  const { execFileSync } = await import('node:child_process')
  const script = `
    const { storage } = require('./src/lib/storage.ts');
    (async () => {
      const u = await storage.presignPutUrl({ key: 'public/uploads/u1/p.jpg', contentType: 'image/jpeg' });
      const ok = await storage.verifyPresignedPutUrl(u, 'image/jpeg');
      const bad = new URL(u); bad.pathname = bad.pathname.replace('p.jpg', 'q.jpg');
      const no = await storage.verifyPresignedPutUrl(bad.toString(), 'image/jpeg');
      process.stdout.write(JSON.stringify({ pathStyle: new URL(u).pathname.startsWith('/Not_DNS_Bucket/'), ok, no }));
    })();`
  const out = execFileSync(process.execPath, ['--import', 'tsx', '-e', script], {
    cwd: process.cwd(),
    env: { ...process.env, S3_BUCKET: 'Not_DNS_Bucket', S3_REGION: 'ap-southeast-2', AWS_ACCESS_KEY_ID: 'AKIATEST', AWS_SECRET_ACCESS_KEY: 'x', S3_ENDPOINT: '' },
    encoding: 'utf8',
  })
  const r = JSON.parse(out.trim().split('\n').pop()!)
  assert.equal(r.pathStyle, true)
  assert.deepEqual(r.ok, { key: 'public/uploads/u1/p.jpg' })
  assert.equal(r.no, null)
})
