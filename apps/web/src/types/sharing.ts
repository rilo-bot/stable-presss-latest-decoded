/**
 * Per-record ownership + sharing, for production-system records.
 *
 * Mirrors apps/server/src/lib/recordSharing.ts. The flags are computed
 * SERVER-side per caller and arrive on every record — the client never derives
 * them, because the rules depend on the viewer's permissions and getting them
 * wrong here would show a Share button that 403s (or hide one that works).
 */

export interface RecordShare {
  userId: string;
  email: string;
  displayName: string;
  sharedAt: string;
  /** User id of whoever granted it. */
  sharedBy: string;
}

/** Mixed into every owned record type. */
export interface Shareable {
  createdByUserId?: string;
  createdByName?: string;
  sharedWith?: RecordShare[];
  /** The viewer created this. */
  mine?: boolean;
  /** The viewer may edit and delete it — creator or admin. */
  canEdit?: boolean;
  /** The viewer may change who it is shared with — creator or admin. */
  canShare?: boolean;
  /** Someone else's record, visible because it was shared. Read-only. */
  sharedWithMe?: boolean;
}
