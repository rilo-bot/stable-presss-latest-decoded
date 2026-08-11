// ---------------------------------------------------------------------------
// Copy a database into a scratch one on the SAME cluster, so a migration can be
// rehearsed against real-shaped data without touching the original.
//
// In-cluster on purpose: client data never leaves the Atlas project it already
// lives in. Nothing is written to the SOURCE — it is opened read-only and the
// script refuses if source and target are the same name.
//
// Usage:
//   MONGODB_URI="<uri>" npx tsx scripts/clone-db.ts <source> <target>
//   MONGODB_URI="<uri>" npx tsx scripts/clone-db.ts <source> <target> --apply
//
// The target is DROPPED and rebuilt, so re-rehearsing is one command.
// ---------------------------------------------------------------------------

import { MongoClient } from 'mongodb'

const [source, target] = process.argv.slice(2).filter((a) => !a.startsWith('--'))
const APPLY = process.argv.includes('--apply')
const uri = (process.env.MONGODB_URI ?? '').trim()

if (!uri || !source || !target) {
  console.error('Usage: MONGODB_URI="<uri>" npx tsx scripts/clone-db.ts <source> <target> [--apply]')
  process.exit(1)
}
if (source === target) {
  console.error('Source and target must differ. Refusing.')
  process.exit(1)
}
// A rehearsal target must LOOK like one. This is the guard against a typo that
// would otherwise drop a real database.
if (!/(rehearsal|scratch|copy|test)/i.test(target)) {
  console.error(`Target "${target}" does not look like a scratch database.`)
  console.error('Its name must contain rehearsal / scratch / copy / test. Refusing.')
  process.exit(1)
}

async function main() {
  const client = new MongoClient(uri)
  await client.connect()
  const from = client.db(source)
  const to = client.db(target)

  const cols = (await from.listCollections().toArray()).map((c) => c.name).sort()
  console.log(`\n${source}  →  ${target}`)
  console.log(APPLY ? '(APPLY — the target will be dropped and rebuilt)\n' : '(DRY RUN — nothing written)\n')

  if (APPLY) await to.dropDatabase()

  let total = 0
  for (const name of cols) {
    const docs = await from.collection(name).find({}).toArray()
    total += docs.length
    console.log(`  ${name.padEnd(28)} ${String(docs.length).padStart(5)}`)
    if (APPLY && docs.length) await to.collection(name).insertMany(docs)
  }

  console.log(`\n${cols.length} collection(s), ${total} document(s)`)
  if (APPLY) {
    console.log(`✓ ${target} is a copy of ${source}. ${source} was not modified.`)
  } else {
    console.log('Dry run. Re-run with --apply.')
  }
  await client.close()
}

main().catch((err) => {
  console.error('FAILED:', err instanceof Error ? (err.stack ?? err.message) : err)
  process.exit(1)
})
