// Racing Data — an OWNED production-system collection.
//
// Same access model as Media Records: your own plus anything shared with you;
// admin and superadmin see everything. See lib/recordSharing.ts.

import { ownedRecordRouter } from '../../lib/ownedRecordRoutes.js'

export default ownedRecordRouter({
  collection: 'racingEntries',
  label: 'racing entry',
  requiredField: 'horse_id',
})
