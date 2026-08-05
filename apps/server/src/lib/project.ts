// ---------------------------------------------------------------------------
// `_id` → `id` on the way out.
//
// This was copied character-for-character into 19 route files. One copy means the
// wire shape cannot drift between two endpoints that both claim to return the
// same record.
// ---------------------------------------------------------------------------

export type WithMongoId = { _id: string; [key: string]: unknown }

/** Strip Mongo's `_id` and expose it as `id`. */
export function project<T extends WithMongoId>(doc: T): Omit<T, '_id'> & { id: string } {
  const { _id, ...rest } = doc
  return { id: String(_id), ...rest } as Omit<T, '_id'> & { id: string }
}
