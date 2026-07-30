// Media Records — an OWNED production-system collection.
//
// You see your own records plus anything shared with you; admin and superadmin
// see everything. Holding a staff role is not enough on its own — this route
// previously returned the entire collection to any caller, unauthenticated.
//
// Rules, and why Horses/People are excluded: lib/recordSharing.ts.

import { ownedRecordRouter } from '../lib/ownedRecordRoutes.js'

export default ownedRecordRouter({
  collection: 'mediaItems',
  label: 'media record',
  requiredField: 'title',
})
