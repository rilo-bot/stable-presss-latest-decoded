// ---------------------------------------------------------------------------
// Notifications — server-side emit helpers.
//
// Persistent, in-app notifications (distinct from the web's ephemeral toasts).
// Informational only for now: recipients read/dismiss them, there is no
// accept/decline. Emitted when a party is linked to a horse, when a party
// claim is resolved, etc. See the member-horse-studio milestone.
// ---------------------------------------------------------------------------

import { db } from './db.js'
import { PARTIES } from './collections.js'

export type NotificationType = 'horse_link' | 'claim_verified' | 'claim_rejected' | 'org_join'

export interface NotificationInput {
  recipientUserId: string
  type: NotificationType
  message: string
  horseId?: string
  partyId?: string
  linkId?: string
  actorUserId?: string
}

/** Persist one notification for one recipient. */
export async function createNotification(n: NotificationInput): Promise<void> {
  await db.collection('notifications').insertOne({
    ...n,
    read: false,
    createdAt: new Date().toISOString(),
  })
}

/**
 * User ids whose VERIFIED claim attaches them to this party — i.e. the
 * account(s) "behind" a party record, who should hear about changes to it.
 */
export async function usersForParty(partyId: string): Promise<string[]> {
  // P2: one indexed lookup on {partyId, status}. Was a full users scan, run on
  // EVERY horse-link write. A person may hold several roles on the same party, so
  // de-duplicate — two verified rows (owner + jockey) are one recipient.
  const rows = await db.collection(PARTIES).find({ partyId, status: 'verified' })
  return [...new Set(rows.map((r) => String(r.userId)))]
}
