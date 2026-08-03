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
import { isPlatformAdmin } from '../lib/rbac.js';
import { createNotification } from '../lib/notify.js';

const router = Router();

// Every claim route requires authentication.
router.use(attachAccount);

const genClaimId = () => 'claim-' + crypto.randomUUID();

/**
 * Org party-ids the given party is linked to, RESTRICTED to organisations that
 * have themselves been verified by staff.
 *
 * The previous version returned `party.managedByOrgId` unconditionally, and its
 * comment claimed the org verifier path "resolves to none, so only the admin
 * verifier path is active". That stopped being true the moment
 * POST /api/organisations/:id/managed-parties shipped — it stamps managedByOrgId,
 * which is the only input this function reads. The result was a complete bypass of
 * claim verification in four self-service calls: create an organisation (you are
 * its org_owner, no approval), mint a managed party under it, claim that party,
 * then approve yourself. That minted a PUBLICLY "verified" racing identity with no
 * staff involvement at all. See docs/AUTH-RBAC-REVIEW.md C2, RBAC.md §7.
 *
 * Organisations carry no verificationStatus yet (POST /api/organisations does not
 * write one), so requiring 'verified' here closes the path completely and restores
 * the behaviour the old comment described. When org verification is built, orgs
 * that pass it light this path up without further change.
 */
async function verifiedOrgsForParty(partyId: string): Promise<string[]> {
  const party = await db.collection('parties').findById(partyId);
  if (!party?.managedByOrgId) return [];
  const org = await db.collection('organisations').findById(String(party.managedByOrgId));
  if (org?.verificationStatus !== 'verified') return [];
  return [String(party.managedByOrgId)];
}

/**
 * Which verifier path (if any) this account may use for a claim.
 *
 * NO SELF-VERIFICATION ON THE ORG PATH. `org_owner` is self-granted — anyone can
 * create an organisation — so without this the claimant is also the verifier.
 *
 * `platform.admin` is deliberately NOT subject to that check. It would restrict
 * nothing: an admin may already verify every claim on the platform, so they could
 * route their own through a second account. Blocking it would only strand a
 * single-admin install whose one admin is also a trainer — their claim could never
 * be verified by anyone. Provisional access already covers them while pending;
 * this is about who may flip the public trust signal.
 */
async function verifierTypeFor(
  account: AccountUser,
  claim: PartyClaim,
  claimantUserId: string,
): Promise<'admin' | 'org' | null> {
  if (isPlatformAdmin(account)) return 'admin';
  if (claimantUserId === account.id) return null;
  const orgs = await verifiedOrgsForParty(claim.partyId);
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

  // Resolve the party this role attaches to. Providing `partyId` means claiming a
  // PRE-EXISTING party (someone else's record on the register) — that stays
  // view-only until verified. Omitting it means the member is registering
  // THEMSELVES: we reuse/mint their own person-party and grant provisional access.
  const providedPartyId = typeof req.body?.partyId === 'string' ? req.body.partyId : '';
  const selfRegistered = !providedPartyId;
  let partyId = providedPartyId;
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
      // A self-registered party is provisional: unverified (hidden from the public
      // site) and owned by its creator until staff verify the claim.
      partyId = await db.collection('parties').insertOne({
        roles: [role],
        name: partyName,
        verificationStatus: 'unverified',
        createdByUserId: account.id,
        createdAt: new Date().toISOString(),
      });
    }
  }

  const claim: PartyClaim = { id: genClaimId(), partyId, role, status: 'pending', evidenceUrl, selfRegistered };
  await db.collection('users').updateOne(account.id, { partyClaims: [...claims, claim] });
  const fresh = await db.collection('users').findById(account.id);
  res.status(201).json({ user: withIdentityDefaults({ id: fresh!._id, ...fresh }), claim });
});

// ── Pending verification queue ────────────────────────────────────────────────
// Admins see every pending claim; org owners/managers see claims for parties
// linked to their org (Phase D). Regular users get an empty list here.
router.get('/pending', async (req, res) => {
  const account = req.account!;
  const admin = isPlatformAdmin(account);
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
        // Same rules the verify route enforces, so the queue never lists a claim
        // the viewer would be refused on. Notably it hides their OWN claim: an
        // org officer is not a verifier of themselves.
        if (String(u._id) === account.id) continue;
        const orgs = await verifiedOrgsForParty(c.partyId);
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
  const verifierType = await verifierTypeFor(account, claim, String(found.user._id));
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
  // Verification is the public-trust upgrade: flip the party live so it surfaces
  // on the public site (a provisional self-registered party was unverified).
  await db.collection('parties').updateOne(claim.partyId, { verificationStatus: 'verified' });
  await createNotification({
    recipientUserId: String(found.user._id),
    type: 'claim_verified',
    message: `Your ${claim.role} claim has been verified — your profile and horses are now live on the public site.`,
    partyId: claim.partyId,
    actorUserId: account.id,
  });
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
  if (!(await verifierTypeFor(account, claim, String(found.user._id)))) {
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
  await createNotification({
    recipientUserId: String(found.user._id),
    type: 'claim_rejected',
    message: `Your ${claim.role} claim was not approved${updatedClaim.rejectionReason ? `: ${updatedClaim.rejectionReason}` : '.'}`,
    partyId: claim.partyId,
    actorUserId: account.id,
  });
  res.json({ ok: true, claim: updatedClaim });
});

export default router;
