import { Router } from 'express';
import { db } from '../lib/db.js';
import { attachAccount } from '../lib/auth.js';
import { withIdentityDefaults, PARTY_ROLES, type OrgRole } from '../lib/identity.js';
import { isAdmin, orgRoleIn, canManageOrg, isOrgOwner } from '../lib/rbac.js';

type WithMongoId = { _id: string; [key: string]: unknown };
function project<T extends WithMongoId>(doc: T): Omit<T, '_id'> & { id: string } {
  const { _id, ...rest } = doc;
  return { id: _id, ...rest } as Omit<T, '_id'> & { id: string };
}

const router = Router();

// Every organisation route requires authentication.
router.use(attachAccount);

// ── Create an organisation → creator becomes org_owner ────────────────────────
router.post('/', async (req, res) => {
  const account = req.account!;
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
  if (!name) {
    res.status(400).json({ error: 'Organisation name is required.' });
    return;
  }

  const orgId = await db.collection('parties').insertOne({
    party_type: 'organisation',
    roles: [],
    name,
    profession: typeof req.body?.profession === 'string' ? req.body.profession.trim() : undefined,
    base_location: typeof req.body?.base_location === 'string' ? req.body.base_location.trim() : undefined,
    country_of_birth:
      typeof req.body?.country_of_birth === 'string' ? req.body.country_of_birth.trim() : undefined,
    createdAt: new Date().toISOString(),
  });

  const userDoc = await db.collection('users').findById(account.id);
  const memberships = Array.isArray(userDoc?.orgMemberships) ? userDoc!.orgMemberships : [];
  await db.collection('users').updateOne(account.id, {
    orgMemberships: [...memberships, { orgId, orgRole: 'org_owner' }],
  });

  const org = await db.collection('parties').findById(orgId);
  const fresh = await db.collection('users').findById(account.id);
  res.status(201).json({
    org: project(org!),
    user: withIdentityDefaults({ id: fresh!._id, ...fresh }),
  });
});

// ── Organisations the current user belongs to ─────────────────────────────────
router.get('/mine', async (req, res) => {
  const account = req.account!;
  const out: Array<Record<string, unknown>> = [];
  for (const m of account.orgMemberships) {
    const org = await db.collection('parties').findById(m.orgId);
    if (org) out.push({ ...project(org), myRole: m.orgRole });
  }
  res.json(out);
});

// ── Organisation detail: members + managed parties + horse scope ──────────────
router.get('/:id', async (req, res) => {
  const account = req.account!;
  const orgId = req.params.id;
  if (!isAdmin(account) && !orgRoleIn(account, orgId)) {
    res.status(403).json({ error: 'You are not a member of this organisation.' });
    return;
  }
  const org = await db.collection('parties').findById(orgId);
  if (!org || org.party_type !== 'organisation') {
    res.status(404).json({ error: 'Organisation not found.' });
    return;
  }

  const users = await db.collection('users').find();
  const members = users
    .filter((u) => Array.isArray(u.orgMemberships) && u.orgMemberships.some((m: { orgId: string }) => m.orgId === orgId))
    .map((u) => ({
      userId: String(u._id),
      displayName: u.displayName,
      email: u.email,
      orgRole: u.orgMemberships.find((m: { orgId: string }) => m.orgId === orgId)?.orgRole as OrgRole,
    }));

  const parties = await db.collection('parties').find();
  const managedParties = parties.filter((p) => p.managedByOrgId === orgId).map(project);
  const managedIds = new Set(managedParties.map((p) => p.id));

  const links = await db.collection('horsePartyLinks').find();
  const horseIds = Array.from(
    new Set(
      links.filter((l) => l.party_id === orgId || managedIds.has(l.party_id)).map((l) => l.horse_id),
    ),
  );

  res.json({ org: project(org), members, managedParties, horseIds });
});

// ── Add a member by email (existing account) ──────────────────────────────────
router.post('/:id/members', async (req, res) => {
  const account = req.account!;
  const orgId = req.params.id;
  if (!canManageOrg(account, orgId)) {
    res.status(403).json({ error: 'Only org owners/managers can add members.' });
    return;
  }
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const requested = req.body?.orgRole;
  const orgRole: OrgRole =
    requested === 'org_manager' ? 'org_manager' : requested === 'org_owner' ? 'org_owner' : 'org_member';
  // Granting owner/manager is owner-only; managers can add plain members.
  if ((orgRole === 'org_owner' || orgRole === 'org_manager') && !isOrgOwner(account, orgId)) {
    res.status(403).json({ error: 'Only the org owner can grant owner/manager roles.' });
    return;
  }

  const target = (await db.collection('users').find({ email }))[0];
  if (!target) {
    res.status(404).json({ error: 'No account found with that email. Ask them to sign up first.' });
    return;
  }
  const memberships = Array.isArray(target.orgMemberships) ? target.orgMemberships : [];
  if (memberships.some((m: { orgId: string }) => m.orgId === orgId)) {
    res.status(409).json({ error: 'That person is already a member.' });
    return;
  }
  await db.collection('users').updateOne(target._id, {
    orgMemberships: [...memberships, { orgId, orgRole }],
  });
  res.status(201).json({
    ok: true,
    member: { userId: String(target._id), displayName: target.displayName, email: target.email, orgRole },
  });
});

// ── Remove a member (owner only) ──────────────────────────────────────────────
router.delete('/:id/members/:userId', async (req, res) => {
  const account = req.account!;
  const orgId = req.params.id;
  if (!isOrgOwner(account, orgId)) {
    res.status(403).json({ error: 'Only the org owner can remove members.' });
    return;
  }
  if (req.params.userId === account.id) {
    res.status(400).json({ error: 'The owner cannot remove themselves.' });
    return;
  }
  const target = await db.collection('users').findById(req.params.userId);
  if (!target) {
    res.status(404).json({ error: 'Member not found.' });
    return;
  }
  const memberships = (Array.isArray(target.orgMemberships) ? target.orgMemberships : []).filter(
    (m: { orgId: string }) => m.orgId !== orgId,
  );
  await db.collection('users').updateOne(req.params.userId, { orgMemberships: memberships });
  res.json({ ok: true });
});

// ── Create a managed party the org controls (no separate login) ───────────────
router.post('/:id/managed-parties', async (req, res) => {
  const account = req.account!;
  const orgId = req.params.id;
  if (!canManageOrg(account, orgId)) {
    res.status(403).json({ error: 'Only org owners/managers can add parties.' });
    return;
  }
  const name = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
  if (!name) {
    res.status(400).json({ error: 'Party name is required.' });
    return;
  }
  const roles = Array.isArray(req.body?.roles)
    ? req.body.roles.filter((r: unknown) => PARTY_ROLES.includes(r as never))
    : [];
  const id = await db.collection('parties').insertOne({
    party_type: req.body?.party_type === 'organisation' ? 'organisation' : 'person',
    roles,
    name,
    managedByOrgId: orgId,
    createdAt: new Date().toISOString(),
  });
  const created = await db.collection('parties').findById(id);
  res.status(201).json({ party: project(created!) });
});

export default router;
