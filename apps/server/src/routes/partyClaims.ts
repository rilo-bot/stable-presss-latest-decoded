import { Router } from 'express';
import crypto from 'crypto';
import { db } from '../lib/db.js';
import { attachAccount } from '../lib/auth.js';
import {
  withIdentityDefaults,
  PARTY_ROLES,
  type AccountUser,
  type PartyClaim,
  type PartyRole,
} from '../lib/identity.js';
import { isAdmin } from '../lib/rbac.js';

const router = Router();

// Every claim route requires authentication.
router.use(attachAccount);

const genClaimId = () => 'claim-' + crypto.randomUUID();

/** Org party-ids the given party is currently linked to. Phase D wires this up
 *  (managed parties + org members); until then it resolves to none, so only the
 *  admin verifier path is active. See RBAC.md §7. */
async function orgsForParty(partyId: string): Promise<string[]> {
  const party = await db.collection('parties').findById(partyId);
  const ids: string[] = [];
  if (party?.managedByOrgId) ids.push(String(party.managedByOrgId));
  return ids;
}

/** Which verifier path (if any) this account may use for a claim. */
async function verifierTypeFor(
  account: AccountUser,
  claim: PartyClaim,
): Promise<'admin' | 'org' | null> {
  if (isAdmin(account)) return 'admin';
  const orgs = await orgsForParty(claim.partyId);
  const canOrg = account.orgMemberships.some(
    (m) => (m.orgRole === 'org_owner' || m.orgRole === 'org_manager') && orgs.includes(m.orgId),
  );
  return canOrg ? 'org' : null;
}

/** Locate a claim by id across all users (claims are embedded on the user doc). */
async function findClaim(claimId: string) {
  const users = await db.collection('users').find();
  for (const u of users) {
    const claims: PartyClaim[] = Array.isArray(u.partyClaims) ? u.partyClaims : [];
    const idx = claims.findIndex((c) => c.id === claimId);
    if (idx >= 0) return { user: u, claims, idx };
  }
  return null;
}

// ── Create a claim for the current user ───────────────────────────────────────
// Claims an existing party (partyId) or creates a new person-party to claim.
router.post('/', async (req, res) => {
  const account = req.account!;
  const role = req.body?.role as PartyRole;
  if (!PARTY_ROLES.includes(role)) {
    res.status(400).json({ error: 'A valid party role is required.' });
    return;
  }
  const evidenceUrl = typeof req.body?.evidenceUrl === 'string' ? req.body.evidenceUrl : undefined;

  // One active claim per role — re-claiming is only allowed after a prior claim
  // for that role was rejected. (Checked before creating anything.)
  const userDoc = await db.collection('users').findById(account.id);
  const claims: PartyClaim[] = Array.isArray(userDoc?.partyClaims) ? userDoc!.partyClaims : [];
  if (claims.some((c) => c.role === role && c.status !== 'rejected')) {
    res.status(409).json({ error: `You already have a ${role} claim in progress.` });
    return;
  }

  // Resolve the party this role attaches to. An individual is ONE person-party
  // carrying multiple roles — so reuse the user's existing person-party across
  // claims rather than minting a new one per role.
  let partyId = typeof req.body?.partyId === 'string' ? req.body.partyId : '';
  if (partyId) {
    const party = await db.collection('parties').findById(partyId);
    if (!party) {
      res.status(404).json({ error: 'Party not found.' });
      return;
    }
  } else {
    const existingPartyId = claims.find((c) => c.partyId)?.partyId;
    if (existingPartyId) {
      partyId = existingPartyId;
      const party = await db.collection('parties').findById(partyId);
      const roles: string[] = Array.isArray(party?.roles) ? party!.roles : [];
      if (!roles.includes(role)) {
        await db.collection('parties').updateOne(partyId, { roles: [...roles, role] });
      }
    } else {
      const partyName =
        typeof req.body?.partyName === 'string' && req.body.partyName.trim()
          ? req.body.partyName.trim()
          : account.displayName;
      partyId = await db.collection('parties').insertOne({
        party_type: 'person',
        roles: [role],
        name: partyName,
        createdAt: new Date().toISOString(),
      });
    }
  }

  const claim: PartyClaim = { id: genClaimId(), partyId, role, status: 'pending', evidenceUrl };
  await db.collection('users').updateOne(account.id, { partyClaims: [...claims, claim] });
  const fresh = await db.collection('users').findById(account.id);
  res.status(201).json({ user: withIdentityDefaults({ id: fresh!._id, ...fresh }), claim });
});

// ── Pending verification queue ────────────────────────────────────────────────
// Admins see every pending claim; org owners/managers see claims for parties
// linked to their org (Phase D). Regular users get an empty list here.
router.get('/pending', async (req, res) => {
  const account = req.account!;
  const admin = isAdmin(account);
  const orgVerifier = account.orgMemberships.some(
    (m) => m.orgRole === 'org_owner' || m.orgRole === 'org_manager',
  );
  if (!admin && !orgVerifier) {
    res.status(403).json({ error: 'Not authorised to verify claims.' });
    return;
  }

  const users = await db.collection('users').find();
  const out: Array<PartyClaim & Record<string, unknown>> = [];
  for (const u of users) {
    const claims: PartyClaim[] = Array.isArray(u.partyClaims) ? u.partyClaims : [];
    for (const c of claims) {
      if (c.status !== 'pending') continue;
      if (!admin) {
        const orgs = await orgsForParty(c.partyId);
        const canOrg = account.orgMemberships.some(
          (m) => (m.orgRole === 'org_owner' || m.orgRole === 'org_manager') && orgs.includes(m.orgId),
        );
        if (!canOrg) continue;
      }
      const party = await db.collection('parties').findById(c.partyId);
      out.push({
        ...c,
        userId: String(u._id),
        claimantName: u.displayName,
        claimantEmail: u.email,
        partyName: party?.name,
      });
    }
  }
  res.json(out);
});

// ── Verify a claim → role becomes active ──────────────────────────────────────
router.post('/:id/verify', async (req, res) => {
  const account = req.account!;
  const found = await findClaim(req.params.id);
  if (!found) {
    res.status(404).json({ error: 'Claim not found.' });
    return;
  }
  const claim = found.claims[found.idx]!;
  if (claim.status !== 'pending') {
    res.status(409).json({ error: 'Claim is not pending.' });
    return;
  }
  const verifierType = await verifierTypeFor(account, claim);
  if (!verifierType) {
    res.status(403).json({ error: 'Not authorised to verify this claim.' });
    return;
  }

  const updatedClaim: PartyClaim = {
    ...claim,
    status: 'verified',
    verifiedBy: account.id,
    verifierType,
    verifiedAt: new Date().toISOString(),
  };
  const claims = [...found.claims];
  claims[found.idx] = updatedClaim;

  // Activate the role on the claimant.
  const roles: string[] = Array.isArray(found.user.roles) ? [...found.user.roles] : ['reader'];
  if (!roles.includes(claim.role)) roles.push(claim.role);

  await db.collection('users').updateOne(found.user._id, { partyClaims: claims, roles });
  res.json({ ok: true, claim: updatedClaim });
});

// ── Reject a claim ────────────────────────────────────────────────────────────
router.post('/:id/reject', async (req, res) => {
  const account = req.account!;
  const found = await findClaim(req.params.id);
  if (!found) {
    res.status(404).json({ error: 'Claim not found.' });
    return;
  }
  const claim = found.claims[found.idx]!;
  if (claim.status !== 'pending') {
    res.status(409).json({ error: 'Claim is not pending.' });
    return;
  }
  if (!(await verifierTypeFor(account, claim))) {
    res.status(403).json({ error: 'Not authorised to reject this claim.' });
    return;
  }

  const updatedClaim: PartyClaim = {
    ...claim,
    status: 'rejected',
    verifiedBy: account.id,
    verifiedAt: new Date().toISOString(),
    rejectionReason:
      typeof req.body?.reason === 'string' ? req.body.reason.trim() || undefined : undefined,
  };
  const claims = [...found.claims];
  claims[found.idx] = updatedClaim;
  await db.collection('users').updateOne(found.user._id, { partyClaims: claims });
  res.json({ ok: true, claim: updatedClaim });
});

export default router;
