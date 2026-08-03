import { Router } from 'express';
import { db } from '../lib/db.js';
import { createNotification, usersForParty } from '../lib/notify.js';

type WithMongoId = { _id: string; [key: string]: unknown };
function project<T extends WithMongoId>(doc: T): Omit<T, '_id'> & { id: string } {
  const { _id, ...rest } = doc;
  return { id: _id, ...rest } as Omit<T, '_id'> & { id: string };
}

const router = Router();

router.get('/', async (req, res) => {
  const items = await db.collection('horsePartyLinks').find();
  res.json(items.map(project));
});

router.post('/', async (req, res) => {
  const body = req.body as {
    horse_id?: string;
    party_id?: string;
    relationship_type?: string;
    start_date?: string;
    end_date?: string | null;
    context?: string;
  };
  if (!body || !body.horse_id) {
    res.status(400).json({ error: 'horse_id is required' });
    return;
  }
  if (!body.party_id) {
    res.status(400).json({ error: 'party_id is required' });
    return;
  }
  if (!body.relationship_type) {
    res.status(400).json({ error: 'relationship_type is required' });
    return;
  }
  const now = new Date().toISOString();
  const doc: Record<string, unknown> = {
    ...body,
    createdAt: now,
    updatedAt: now,
  };
  delete (doc as { id?: unknown }).id;
  const id = await db.collection('horsePartyLinks').insertOne(doc);
  const created = await db.collection('horsePartyLinks').findById(id);
  if (!created) {
    res.status(500).json({ error: 'failed to create' });
    return;
  }

  // Notify the account(s) behind the linked party that they've been connected to
  // this horse (informational only — no accept/decline). Skip the actor.
  const actorId = req.account?.id;
  const recipients = (await usersForParty(String(body.party_id))).filter((uid) => uid !== actorId);
  if (recipients.length > 0) {
    const horse = await db.collection('horses').findById(String(body.horse_id));
    const horseName = horse?.name ?? 'a horse';
    const actorName = req.account?.displayName ?? 'Someone';
    const rel = String(body.relationship_type);
    await Promise.all(
      recipients.map((uid) =>
        createNotification({
          recipientUserId: uid,
          type: 'horse_link',
          message: `${actorName} linked you to ${horseName} as ${rel}.`,
          horseId: String(body.horse_id),
          partyId: String(body.party_id),
          linkId: id,
          actorUserId: actorId,
        }),
      ),
    );
  }

  res.status(201).json(project(created));
});

router.put('/:id', async (req, res) => {
  const body = req.body as {
    horse_id?: string;
    party_id?: string;
    relationship_type?: string;
    start_date?: string;
    end_date?: string | null;
    context?: string;
  };
  const now = new Date().toISOString();
  const updateData: Record<string, unknown> = {
    ...body,
    updatedAt: now,
  };
  delete (updateData as { id?: unknown }).id;
  // WHICH HORSE a link points at is not an editable field. A link IS the
  // (horse, party) pair — changing the horse is a different relationship, so it
  // is a delete plus a create, not an edit. Allowing it re-pointed the caller's
  // own party onto a horse they don't manage, which authorisedHorseIds() then
  // read as write access to that horse (docs/AUTH-RBAC-REVIEW.md C1).
  //
  // No UI ever changes it: HorsePartyLinkPanel is scoped to one horse and echoes
  // that same id back, and useRoleConnections sends only the dates. `party_id`
  // deliberately STAYS writable — re-pointing the party of a horse you already
  // manage is a legitimate edit and grants the caller no new reach.
  //
  // horseScopedWriteGate also authorises the destination horse; this strip is the
  // narrower guarantee that the field cannot move at all.
  delete (updateData as { horse_id?: unknown }).horse_id;
  const found = await db.collection('horsePartyLinks').findById(req.params.id);
  if (!found) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  await db.collection('horsePartyLinks').updateOne(req.params.id, updateData);
  const updated = await db.collection('horsePartyLinks').findById(req.params.id);
  if (!updated) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  res.json(project(updated));
});

router.delete('/:id', async (req, res) => {
  const found = await db.collection('horsePartyLinks').findById(req.params.id);
  if (!found) {
    res.status(404).json({ error: 'Not found' });
    return;
  }
  await db.collection('horsePartyLinks').deleteOne(req.params.id);
  res.json({ success: true });
});

export default router;