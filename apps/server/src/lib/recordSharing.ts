// ---------------------------------------------------------------------------
// Per-record ownership + explicit sharing, for production-system records.
//
// THE RULE
//   platform.admin (admin / superadmin)  →  sees and manages everything
//   the creator                          →  sees and manages their own records
//   anyone the record is shared with     →  SEES it (read-only)
//   everyone else                        →  cannot see it at all
//
// `newsroom.access` deliberately does NOT grant visibility here. Holding a
// staff role gets you into the newsroom; it does not get you other people's
// records. That is the whole point of this module.
//
// A SHARE IS READ-ONLY. Editing and deleting stay with the creator and admins,
// and only they can change who a record is shared with — otherwise a viewer
// could widen their own access, which is the same hole the magazine
// collaborator rules avoid by keeping management owner-only.
//
// Applies to Media Records and Racing Data. Horses and People are deliberately
// excluded: they are a shared REGISTER, and hiding entries from colleagues
// produces duplicate horses and duplicate trainers rather than privacy.
// ---------------------------------------------------------------------------

import type { AccountUser } from './effectiveAccess.js'
import { accountCan } from './effectiveAccess.js'

export interface RecordShare {
  userId: string
  email: string
  displayName: string
  sharedAt: string
  /** User id of whoever granted it — for the audit line in the UI. */
  sharedBy: string
}

/** The ownership fields every shareable record carries. */
export interface OwnedRecord {
  createdByUserId?: string
  createdByName?: string
  sharedWith?: RecordShare[]
  [key: string]: unknown
}

export function sharesOf(doc: OwnedRecord | null | undefined): RecordShare[] {
  return Array.isArray(doc?.sharedWith) ? (doc!.sharedWith as RecordShare[]) : []
}

/** Stamped onto every newly created record. */
export function ownershipFields(account: AccountUser): {
  createdByUserId: string
  createdByName: string
  sharedWith: RecordShare[]
} {
  return {
    createdByUserId: account.id,
    createdByName: account.name || account.email,
    sharedWith: [],
  }
}

/** Unrestricted visibility. Admin and superadmin only. */
export function seesEverything(account: AccountUser | undefined): boolean {
  return accountCan(account, 'platform.admin')
}

export function isCreator(account: AccountUser | undefined, doc: OwnedRecord): boolean {
  return !!account && !!doc.createdByUserId && doc.createdByUserId === account.id
}

export function isSharedWith(account: AccountUser | undefined, doc: OwnedRecord): boolean {
  return !!account && sharesOf(doc).some((s) => s.userId === account.id)
}

/** May the account SEE this record? */
export function canViewRecord(account: AccountUser | undefined, doc: OwnedRecord): boolean {
  if (!account) return false
  if (seesEverything(account)) return true
  return isCreator(account, doc) || isSharedWith(account, doc)
}

/**
 * May the account EDIT, DELETE, or change who it is shared with?
 * Creator and admins only — a share grants reading, never re-sharing.
 */
export function canManageRecord(account: AccountUser | undefined, doc: OwnedRecord): boolean {
  if (!account) return false
  return seesEverything(account) || isCreator(account, doc)
}

/** Filter a collection down to what this account may see. */
export function visibleRecords<T extends OwnedRecord>(
  account: AccountUser | undefined,
  docs: T[],
): T[] {
  if (!account) return []
  if (seesEverything(account)) return docs
  return docs.filter((d) => isCreator(account, d) || isSharedWith(account, d))
}

/**
 * Viewer-relative flags for the client, so the UI can render a Share button and
 * a read-only badge without re-deriving the rules (and getting them wrong).
 */
export function viewerFlags(
  account: AccountUser | undefined,
  doc: OwnedRecord,
): { mine: boolean; canEdit: boolean; canShare: boolean; sharedWithMe: boolean } {
  const mine = isCreator(account, doc)
  const manage = canManageRecord(account, doc)
  return {
    mine,
    canEdit: manage,
    canShare: manage,
    sharedWithMe: !mine && isSharedWith(account, doc),
  }
}
