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
import { canVerifyClaims, isPlatformAdmin } from '../lib/rbac.js';
import { accountCan } from '../lib/effectiveAccess.js';
import { createNotification } from '../lib/notify.js';
import { PARTY_MEMBERSHIPS, mirrorPartyMemberships } from '../lib/membership.js';

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
 *
 * `claims.verify` — the narrower permission, split out so the queue can be staffed
 * without granting platform administration — IS subject to the self-check. The
 * exemption above rests on `platform.admin` being unrestrictable in practice; that
 * argument does not extend to a records clerk, and separation of duty is worth more
 * here than the convenience. Their own claim gets verified by an admin.
 */
async function verifierTypeFor(
  account: AccountUser,
  claim: PartyClaim,
  claimantUserId: string,
): Promise<'admin' | 'org' | null> {
  if (isPlatformAdmin(account)) return 'admin';
  if (claimantUserId === account.id) return null;
  if (accountCan(account, 'claims.verify')) return 'admin';
  const orgs = await verifiedOrgsForParty(claim.partyId);
  const canOrg = account.orgMemberships.some(
    (m) => (m.orgRole === 'org_owner' || m.orgRole === 'org_manager') && orgs.includes(m.orgId),
  );
  return canOrg ? 'org' : null;
}

/**
 * Locate a claim by id, plus the user it belongs to.
 *
 * P2: two indexed lookups (membership by `claimId`, then the user by `_id`) instead
 * of scanning every user to verify ONE claim. The returned shape is unchanged —
 * callers still mutate `claims[idx]` and write the whole array back, and the mirror
 * keeps the edge collection in step, so this stays correct until P3 drops the array.
 */
async function findClaim(claimId: string) {
  const row = (await db.collection(PARTY_MEMBERSHIPS).find({ claimId }))[0];
  if (!row) return null;
  const user = await db.collection('users').findById(String(row.userId));
  if (!user) return null;
  const claims: PartyClaim[] = Array.isArray(user.partyClaims) ? user.partyClaims : [];
  const idx = claims.findIndex((c) => c.id === claimId);
  if (idx < 0) return null;
  return { user, claims, idx };
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
  const nextClaims = [...claims, claim];
  await db.collection('users').updateOne(account.id, { partyClaims: nextClaims });
  // P1 dual-write (docs/USER-MODEL-PLAN.md §8). The reconciler takes the FINAL
  // array, so it stays correct however the array was derived.
  await mirrorPartyMemberships(account.id, nextClaims);
  const fresh = await db.collection('users').findById(account.id);
  res.status(201).json({ user: withIdentityDefaults({ id: fresh!._id, ...fresh }), claim });
});

// ── Pending verification queue ────────────────────────────────────────────────
// Platform admins and `claims.verify` holders see every pending claim; org
// owners/managers see claims for parties linked to their org (Phase D). Regular
// users get an empty list here.
router.get('/pending', async (req, res) => {
  const account = req.account!;
  const admin = canVerifyClaims(account);
  const orgVerifier = account.orgMemberships.some(
    (m) => m.orgRole === 'org_owner' || m.orgRole === 'org_manager',
  );
  if (!admin && !orgVerifier) {
    res.status(403).json({ error: 'Not authorised to verify claims.' });
    return;
  }

  // P2: query the PENDING rows directly, oldest first, instead of scanning every
  // user and every claim on them. The `{status, createdAt}` index serves this, so
  // it is also the shape a paginated queue needs (P3).
  const pending = await db.collection(PARTY_MEMBERSHIPS).find({ status: 'pending' });
  pending.sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)));

  // Resolve claimants and parties in ONE pass each rather than per row — the old
  // loop did a `parties.findById` inside a nested loop.
  const userIds = [...new Set(pending.map((r) => String(r.userId)))];
  const partyIds = [...new Set(pending.map((r) => String(r.partyId)))];
  const [claimants, parties] = await Promise.all([
    Promise.all(userIds.map((id) => db.collection('users').findById(id))),
    Promise.all(partyIds.map((id) => db.collection('parties').findById(id))),
  ]);
  const userById = new Map(claimants.filter(Boolean).map((u) => [String(u!._id), u!]));
  const partyById = new Map(parties.filter(Boolean).map((p) => [String(p!._id), p!]));

  // Only `platform.admin` is exempt from the self-verify check in verifierTypeFor,
  // so only a platform admin may be shown their own claim. A `claims.verify` holder
  // sees the whole queue MINUS their own — otherwise the queue would list a row that
  // 403s the moment they act on it.
  const platformAdmin = isPlatformAdmin(account);

  const out: Array<Record<string, unknown>> = [];
  for (const r of pending) {
    const u = userById.get(String(r.userId));
    if (!u) continue; // claimant gone
    // An org officer is not a verifier of themselves, and neither is a records clerk.
    if (!platformAdmin && String(u._id) === account.id) continue;
    if (!admin) {
      // Same rules the verify route enforces, so the queue never lists a claim the
      // viewer would be refused on.
      const orgs = await verifiedOrgsForParty(String(r.partyId));
      const canOrg = account.orgMemberships.some(
        (m) => (m.orgRole === 'org_owner' || m.orgRole === 'org_manager') && orgs.includes(m.orgId),
      );
      if (!canOrg) continue;
    }
    out.push({
      // Same wire shape as before: the client sends `id` back to verify/reject, so
      // it must stay the original claim id.
      id: String(r.claimId),
      partyId: String(r.partyId),
      role: r.role,
      status: r.status,
      evidenceUrl: r.evidenceKey ?? undefined,
      selfRegistered: r.selfRegistered !== false,
      userId: String(u._id),
      claimantName: u.displayName,
      claimantEmail: u.email,
      partyName: partyById.get(String(r.partyId))?.name,
    });
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

  // `roles[]` is no longer written here. It is DERIVED from verified party
  // memberships in toClientUser (lib/effectiveAccess.ts), so activating the role is
  // now a consequence of the claim reaching 'verified' rather than a second write
  // that a future code path could forget. See docs/USER-MODEL-PLAN.md §4.
  await db.collection('users').updateOne(found.user._id, { partyClaims: claims });
  await mirrorPartyMemberships(String(found.user._id), claims); // P1 dual-write
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
  await mirrorPartyMemberships(String(found.user._id), claims); // P1 dual-write
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
