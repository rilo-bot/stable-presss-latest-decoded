// ---------------------------------------------------------------------------
// People, by name — for The Stable Hand's confirm cards and step lines.
//
// The model refers to staff by userId (findStaff / listStaff hand it ids). A
// confirm card must say "Share page 2 with Ahmed Khan?", never the id, even for
// someone the current screen has not loaded (not a collaborator yet, not on the
// Team screen). So names come from, in order:
//
//   extra            what the action already holds (a magazine's collaborators)
//   staff directory  GET /api/staff/directory, the SAME list the magazine Share
//                    dialog and RecordShareDialog offer (staff-gated, not
//                    team.view), cached here for every pack
//   team roster      useStaffStore (the Team screen's GET /api/staff), if loaded
//   you              the signed-in user
//
// and when nobody matches: the email if the reference is one, else a neutral
// phrase ("this staff member"); see humanRef.describePersonRef.
//
// Reads only. Nothing here writes anything.
// ---------------------------------------------------------------------------

import { authFetchRetry } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import { useStaffStore } from '@/stores/staffStore';
import { describePersonRef, findPerson, NEUTRAL_PERSON, type PersonRecord } from './humanRef';

/** A row of /api/staff/directory. */
export interface StaffDirectoryEntry {
  userId: string;
  name: string;
  email: string;
}

const TTL_MS = 5 * 60_000;
/** After a failure (a non-staff user gets 403), don't ask again for a minute. */
const FAIL_TTL_MS = 60_000;

let directory: { at: number; list: StaffDirectoryEntry[]; ok: boolean } | null = null;
let inflight: Promise<StaffDirectoryEntry[]> | null = null;

function toEntries(data: unknown): StaffDirectoryEntry[] {
  if (!Array.isArray(data)) return [];
  return data
    .filter((r): r is Record<string, unknown> => !!r && typeof r === 'object' && typeof (r as { userId?: unknown }).userId === 'string')
    .map((r) => ({ userId: String(r.userId), name: typeof r.name === 'string' ? r.name : '', email: typeof r.email === 'string' ? r.email : '' }));
}

/**
 * The staff directory (cached for five minutes; `force` refetches). Throws when
 * the request fails, with the server's reason, so a read action (magazine.listStaff)
 * can report it. Concurrent callers share one request.
 */
export function loadStaffDirectory(force = false): Promise<StaffDirectoryEntry[]> {
  if (!force && directory && directory.ok && Date.now() - directory.at < TTL_MS) return Promise.resolve(directory.list);
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const res = await authFetchRetry('/api/staff/directory');
      const body: unknown = await res.json().catch(() => null);
      if (!res.ok) {
        const reason = body && typeof body === 'object' && typeof (body as { error?: unknown }).error === 'string' ? (body as { error: string }).error : `HTTP ${res.status}`;
        throw new Error(`Could not load the staff directory: ${reason}`);
      }
      const list = toEntries(body);
      directory = { at: Date.now(), list, ok: true };
      return list;
    } catch (e) {
      directory = { at: Date.now(), list: directory?.list ?? [], ok: false };
      throw e;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

/** The directory as last loaded (null if it never loaded). No request. */
export function cachedStaffDirectory(): StaffDirectoryEntry[] | null {
  return directory && (directory.ok || directory.list.length > 0) ? directory.list : null;
}

/** Load the directory for a NAME lookup: never throws, and does not re-ask
 *  soon after a failure. */
async function warmDirectory(): Promise<void> {
  if (directory && !directory.ok && Date.now() - directory.at < FAIL_TTL_MS) return;
  try {
    await loadStaffDirectory();
  } catch {
    /* no directory for this user (not staff) or offline: names fall back */
  }
}

/** Everyone this page already knows by name, `extra` first. No request. */
export function knownPeople(extra: readonly PersonRecord[] = []): PersonRecord[] {
  const me = useAuthStore.getState().currentUser;
  return [
    ...extra,
    ...(directory?.list ?? []),
    ...(useStaffStore.getState().staff ?? []),
    ...(me ? [{ userId: me.id, name: me.name, email: me.email }] : []),
  ];
}

/** A display name for a userId / email / name, from what is loaded already. */
export function personLabelNow(ref: string, extra: readonly PersonRecord[] = [], fallback = NEUTRAL_PERSON): string {
  return describePersonRef(ref, knownPeople(extra), fallback).label;
}

/**
 * A display name for a userId / email / name; fetches the staff directory when
 * the person is not loaded yet. Name → email → `fallback`; never the id. Never
 * throws. For async confirm() cards (the runtime gives them ~4s).
 */
export async function personLabel(ref: string, extra: readonly PersonRecord[] = [], fallback = NEUTRAL_PERSON): Promise<string> {
  const now = describePersonRef(ref, knownPeople(extra), fallback);
  if (now.found) return now.label;
  await warmDirectory();
  return describePersonRef(ref, knownPeople(extra), fallback).label;
}

/** The person record a reference means (fetching the directory if needed). */
export async function findPersonAnywhere(ref: string, extra: readonly PersonRecord[] = []): Promise<PersonRecord | undefined> {
  const now = findPerson(ref, knownPeople(extra));
  if (now) return now;
  await warmDirectory();
  return findPerson(ref, knownPeople(extra));
}
