/**
 * Migrate articles from the twelve-status workflow to five statuses + channels.
 *
 *   npx tsx scripts/migrate-article-status.ts            # dry run, prints a plan
 *   npx tsx scripts/migrate-article-status.ts --apply    # writes
 *
 * Why this is required rather than optional: `buckets` on the board does
 * `if (s in map) … else map['draft'].push(article)`, so any document left on a
 * retired status silently reappears as a Draft — an approved, scheduled story
 * would look unwritten. And `newsletter`/`bulletin` were *live* statuses, so
 * leaving them behind takes those stories off the public site entirely.
 *
 * Mapping — chosen to preserve exactly what each story did before:
 *
 *   editorial_review  → submitted          (was queued for a reviewer)
 *   legal_review      → submitted          (same queue; the gate is gone)
 *   compliance        → submitted          (same)
 *   publisher_review  → approved           (it sat AFTER approval)
 *   revision          → draft + changesRequested: true
 *   published         → published + channels ['news']
 *   newsletter        → published + channels ['newsletter']
 *   bulletin          → published + channels ['bulletin']
 *   archived          → draft              (type-only value; no UI ever set it)
 *   draft/submitted/approved/scheduled     unchanged, channels default ['news']
 *
 * NewsIndex split those last three into three mutually exclusive groups, so the
 * channel mapping reproduces the previous page exactly.
 *
 * Also rewrites `roles.workflowStages`, which stores stage ids that no longer
 * exist.
 */
import 'dotenv/config'
import { MongoClient } from 'mongodb'

const STATUS_MAP: Record<string, { status: string; channels?: string[]; changesRequested?: boolean }> = {
  editorial_review: { status: 'submitted' },
  legal_review: { status: 'submitted' },
  compliance: { status: 'submitted' },
  publisher_review: { status: 'approved' },
  revision: { status: 'draft', changesRequested: true },
  published: { status: 'published', channels: ['news'] },
  newsletter: { status: 'published', channels: ['newsletter'] },
  bulletin: { status: 'published', channels: ['bulletin'] },
  archived: { status: 'draft' },
}

const VALID = new Set(['draft', 'submitted', 'approved', 'scheduled', 'published'])

/** Retired stage ids → the stage that replaced them, for role.workflowStages. */
const STAGE_MAP: Record<string, string | null> = {
  editorial_review: 'submitted',
  legal_review: 'submitted',
  compliance: 'submitted',
  publisher_review: 'approved',
  revision: 'draft',
  newsletter: 'published',
  bulletin: 'published',
}

async function main() {
  const apply = process.argv.includes('--apply')
  const uri = (process.env.MONGODB_URI ?? '').trim()
  if (!uri) throw new Error('MONGODB_URI is required (apps/server/.env)')

  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 8000 })
  await client.connect()
  console.log(`[migrate] connected: ${uri.replace(/:([^@]+)@/, ':***@')}`)
  console.log(`[migrate] mode: ${apply ? 'APPLY (writing)' : 'DRY RUN (no writes)'}\n`)

  const db = client.db()

  // ── Articles ──
  const articles = await db.collection('articles').find({}).toArray()
  const planned: { id: string; title: string; from: string; to: string; extra: string }[] = []
  let alreadyFine = 0

  for (const doc of articles) {
    const from = String(doc.status ?? 'draft')
    const mapped = STATUS_MAP[from]

    if (!mapped) {
      if (VALID.has(from)) {
        // Valid status; may still need the default channel stamped so the
        // public news index has something to filter on.
        if (from === 'published' && !Array.isArray(doc.channels)) {
          planned.push({ id: String(doc._id), title: String(doc.title ?? ''), from, to: from, extra: "channels ['news']" })
          if (apply) {
            await db.collection('articles').updateOne({ _id: doc._id }, { $set: { channels: ['news'] } })
          }
        } else {
          alreadyFine++
        }
        continue
      }
      // Unknown value that is not a known legacy one — park it in Draft rather
      // than leave a story that no column will ever show.
      planned.push({ id: String(doc._id), title: String(doc.title ?? ''), from, to: 'draft', extra: 'unrecognised status' })
      if (apply) {
        await db.collection('articles').updateOne({ _id: doc._id }, { $set: { status: 'draft' } })
      }
      continue
    }

    const set: Record<string, unknown> = { status: mapped.status }
    const notes: string[] = []
    // Never overwrite channels a story already has.
    if (mapped.channels && !Array.isArray(doc.channels)) {
      set.channels = mapped.channels
      notes.push(`channels ${JSON.stringify(mapped.channels)}`)
    }
    if (mapped.changesRequested) {
      set.changesRequested = true
      notes.push('changesRequested')
    }

    planned.push({
      id: String(doc._id),
      title: String(doc.title ?? ''),
      from,
      to: mapped.status,
      extra: notes.join(', '),
    })
    if (apply) {
      await db.collection('articles').updateOne({ _id: doc._id }, { $set: set })
    }
  }

  console.log(`── Articles: ${articles.length} total, ${planned.length} to change, ${alreadyFine} already fine`)
  const byTransition = new Map<string, number>()
  for (const p of planned) {
    const key = `${p.from} → ${p.to}${p.extra ? ` (+ ${p.extra})` : ''}`
    byTransition.set(key, (byTransition.get(key) ?? 0) + 1)
  }
  for (const [key, n] of [...byTransition].sort((a, b) => b[1] - a[1])) {
    console.log(`   ${String(n).padStart(4)}  ${key}`)
  }

  // ── Roles: workflowStages ──
  const roles = await db.collection('roles').find({}).toArray()
  let rolesChanged = 0
  for (const role of roles) {
    const stages: unknown = role.workflowStages
    if (!Array.isArray(stages)) continue
    const next = [
      ...new Set(
        stages
          .map((s) => String(s))
          .map((s) => (s in STAGE_MAP ? STAGE_MAP[s] : s))
          .filter((s): s is string => !!s && VALID.has(s)),
      ),
    ]
    const before = stages.map(String)
    if (before.length === next.length && before.every((s, i) => s === next[i])) continue

    rolesChanged++
    console.log(`\n── Role "${role.slug ?? role._id}" stages`)
    console.log(`   before: ${JSON.stringify(before)}`)
    console.log(`   after:  ${JSON.stringify(next)}`)
    if (apply) {
      await db.collection('roles').updateOne({ _id: role._id }, { $set: { workflowStages: next } })
    }
  }
  console.log(`\n── Roles: ${roles.length} total, ${rolesChanged} to change`)

  if (!apply) {
    console.log('\n[migrate] DRY RUN — nothing was written. Re-run with --apply to commit.')
  } else {
    console.log('\n[migrate] done.')
  }

  await client.close()
}

main().catch((err) => {
  console.error('[migrate] failed:', err)
  process.exit(1)
})
