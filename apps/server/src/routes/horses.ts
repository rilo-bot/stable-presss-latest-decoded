import { Router } from 'express';
import { db } from '../lib/db.js';
import { canAccessNewsroom } from '../lib/rbac.js';
import { visibleHorseIds, manageablePartyIds } from '../lib/scope.js';

type WithMongoId = { _id: string; [key: string]: unknown };
function project<T extends WithMongoId>(doc: T): Omit<T, '_id'> & { id: string } {
  const { _id, ...rest } = doc;
  return { id: _id, ...rest } as Omit<T, '_id'> & { id: string };
}

const router = Router();

// Mirror of the web ROLE_BINDINGS (lib/profile/roleMap.ts): which legacy *Ids
// field on a Horse maps to which HorsePartyLink relationship_type. Used to link
// the CREATING party under its own role (trainer → Trainers box, not Owners).
// `syndicateManagerIds` has no relationship_type — handled by the fallback.
const ROLE_LINK_FIELDS: { field: string; rel: string }[] = [
  { field: 'ownerIds', rel: 'ownership' },
  { field: 'trainerIds', rel: 'training' },
  { field: 'jockeyIds', rel: 'riding' },
  { field: 'breederIds', rel: 'bred-by' },
  { field: 'bloodstockAgentIds', rel: 'agent' },
  { field: 'personnelIds', rel: 'personnel' },
];

router.get('/', async (req, res) => {
  const items = await db.collection('horses').find();
  const account = req.account;
  if (canAccessNewsroom(account)) {
    res.json(items.map(project));
    return;
  }
  // Non-staff callers: hide horses that are still unverified, except the viewer's
  // own created/authorised horses (so an owner can see the pending horse they
  // just registered).
  let allowed = new Set<string>();
  if (account) {
    const links = await db.collection('horsePartyLinks').find();
    allowed = new Set(visibleHorseIds(account, { horses: items, links }));
  }
  const visible = items.filter(
    (h) =>
      h.verificationStatus !== 'unverified' ||
      (account ? h.createdByUserId === account.id : false) ||
      allowed.has(String(h._id)),
  );
  res.json(visible.map(project));
});

router.post('/', async (req, res) => {
  const body = req.body as Partial<{
    name: string;
    isUnnamed: boolean;
    sex: string;
    dob: string;
    colour: string;
    country: string;
    handsSize: number;
    metricSize: number;
    sire: string;
    sireSire: string;
    sireDam: string;
    dam: string;
    damYob: number;
    damSire: string;
    damDam: string;
    ownerIds: string[];
    trainerIds: string[];
    jockeyIds: string[];
    breederIds: string[];
    bloodstockAgentIds: string[];
    syndicateManagerIds: string[];
    personnelIds: string[];
    careerRecord: string;
    careerWinnings: number;
    lastTenForm: string;
    seasonRecord: string;
    currentRating: number;
    pedigreeNotes: string;
    pullQuote: string;
    imageUrl: string;
    verificationStatus: string;
  }>;

  // A name is required UNLESS this is an un-named draft (foal / yearling), which
  // members create photo-first and name later. Un-named drafts store name: ''.
  if (!body || (!body.name && !body.isUnnamed)) {
    res.status(400).json({ error: 'name is required' });
    return;
  }

  const account = req.account;
  const staff = canAccessNewsroom(account);
  const now = new Date().toISOString();

  // Staff-created horses are live; member-created horses are unverified (hidden
  // from the public site) until staff/NZTR verification. Members never self-verify.
  const verificationStatus: 'verified' | 'unverified' = staff
    ? body.verificationStatus === 'unverified'
      ? 'unverified'
      : 'verified'
    : 'unverified';

  const doc: Record<string, unknown> = {
    ...body,
    name: body.name ?? '',
    verificationStatus,
    createdByUserId: account?.id,
    createdAt: now,
    updatedAt: now,
  };
  delete (doc as { id?: unknown }).id;

  const id = await db.collection('horses').insertOne(doc);

  // A member registering a horse is auto-linked to it UNDER THEIR OWN ROLE, so
  // they show up in the matching connection box (an owner in Owners, a trainer in
  // Trainers, etc.) and keep authorised access via the standard scope rules. The
  // role is taken from whichever *Ids field the client populated with a party the
  // member manages; if none was provided, we fall back to linking their owner
  // party (or first manageable party) as ownership.
  if (account && !staff) {
    const manageable = account.partyClaims.filter(
      (c) => c.status === 'verified' || (c.status === 'pending' && c.selfRegistered !== false),
    );
    const manageablePartyIds = new Set(manageable.map((c) => c.partyId));
    const insertLink = (party_id: string, relationship_type: string) =>
      db.collection('horsePartyLinks').insertOne({
        horse_id: id, party_id, relationship_type, start_date: now.slice(0, 10), createdAt: now, updatedAt: now,
      });

    let linkedAny = false;
    const rec = body as Record<string, unknown>;
    for (const { field, rel } of ROLE_LINK_FIELDS) {
      const ids = Array.isArray(rec[field]) ? (rec[field] as string[]) : [];
      for (const pid of ids) {
        if (!manageablePartyIds.has(pid)) continue; // only auto-link parties the member manages
        await insertLink(pid, rel);
        linkedAny = true;
      }
    }
    if (!linkedAny) {
      const ownerClaim = manageable.find((c) => c.role === 'owner') ?? manageable[0];
      if (ownerClaim) await insertLink(ownerClaim.partyId, 'ownership');
    }
  }

  const created = await db.collection('horses').findById(id);
  if (!created) {
    res.status(500).json({ error: 'failed to create' });
    return;
  }
  res.status(201).json(project(created));
});

router.put('/:id', async (req, res) => {
  const body = req.body as Partial<{
    name: string;
    isUnnamed: boolean;
    sex: string;
    dob: string;
    colour: string;
    country: string;
    handsSize: number;
    metricSize: number;
    sire: string;
    sireSire: string;
    sireDam: string;
    dam: string;
    damYob: number;
    damSire: string;
    damDam: string;
    ownerIds: string[];
    trainerIds: string[];
    jockeyIds: string[];
    breederIds: string[];
    bloodstockAgentIds: string[];
    syndicateManagerIds: string[];
    personnelIds: string[];
    careerRecord: string;
    careerWinnings: number;
    lastTenForm: string;
    seasonRecord: string;
    currentRating: number;
    pedigreeNotes: string;
    pullQuote: string;
    imageUrl: string;
    verificationStatus: string;
  }>;

  const account = req.account;
  const staff = canAccessNewsroom(account);
  const now = new Date().toISOString();
  const update: Record<string, unknown> = { ...body, updatedAt: now };
  delete (update as { id?: unknown }).id;
  delete (update as { createdByUserId?: unknown }).createdByUserId; // never client-settable
  if (!staff) delete (update as { verificationStatus?: unknown }).verificationStatus; // members can't self-verify
  const updated_flag = await db.collection('horses').updateOne(req.params.id, update);
  if (!updated_flag) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  const updated = await db.collection('horses').findById(req.params.id);
  if (!updated) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  res.json(project(updated));
});

router.delete('/:id', async (req, res) => {
  const deleted = await db.collection('horses').deleteOne(req.params.id);
  if (!deleted) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  res.json({ success: true });
});

export default router;