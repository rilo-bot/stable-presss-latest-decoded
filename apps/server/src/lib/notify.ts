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

