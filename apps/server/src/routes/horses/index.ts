import { Router } from 'express';
import { db } from '../../lib/db.js';
import { isAdmin } from '../../lib/rbac.js';
import { PARTIES } from '../../lib/collections.js';
import { visibleHorseIds } from '../../lib/scope.js';
import { project } from '../../lib/project.js';

const router = Router();

router.get('/', async (req, res) => {
  const items = await db.collection('horses').find();
  const account = req.account;
  if (isAdmin(account)) {
    res.json(items.map(project));
    return;
  }
  // Non-admin callers: hide horses that are still unverified, except the viewer's
  // own created/authorised horses (so an owner can see the pending horse they
  // just registered).
  const allowed = new Set<string>(account ? await visibleHorseIds(account) : []);
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
  const staff = isAdmin(account);
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

  // A user registering a horse gets a `parties` row pointing at it, UNDER THEIR
  // OWN ROLE — so they appear in the matching connection box (an owner in Owners,
  // a trainer in Trainers) and keep authorised access through the standard scope
  // rules in lib/scope.ts.
  //
  // ONE ROW PER (person, role, horse). There is no link table any more: the party
  // row carries `horseId`, which is what makes `writableHorseIds` a single indexed
  // query. The role comes from a party they have already claimed — preferring
  // 'owner', because that is what registering a horse usually means — and the row
  // is created already claimed, since they are demonstrably that person.
  if (account && !staff && account.parties.length > 0) {
    const identity =
      account.parties.find((p) => p.role === 'owner') ?? account.parties[0]!;
    // Only if they are not already on this horse under that role.
    const dupe = await db
      .collection(PARTIES)
      .find({ userId: account.id, role: identity.role, horseId: id });
    if (dupe.length === 0) {
      await db.collection(PARTIES).insertOne({
        name: identity.name,
        role: identity.role,
        horseId: id,
        orgId: identity.orgId,
        taken: true,
        userId: account.id,
        createdAt: now,
        updatedAt: now,
      });
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
  const staff = isAdmin(account);
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