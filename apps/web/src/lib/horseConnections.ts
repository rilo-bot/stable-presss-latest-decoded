/**
 * A horse's connections — ONE source of truth: the party edges.
 *
 * There used to be two. The same fact ("Ana trains Bilby") was stored both as a
 * party edge and as an id-array on the horse itself (`ownerIds`, `trainerIds`,
 * …), and the server accepted writes to both. Neither was authoritative, so five
 * files existed purely to merge them and mark one side read-only, and a
 * connection added in one place could be invisible in the other.
 *
 * The arrays are gone. An edge — `{ personId, role, horseId }` — IS the
 * connection, and this module is the only place that reads a horse's
 * connections out of them or writes them back.
 */
import type { Horse } from '@/types/horse';
import type { PartyRow } from '@/stores/authStore';
import { PARTY_ROLES, type PartyRole } from '@/types/party';

export interface HorseConnections {
  owner: string;
  trainer: string;
  jockey: string;
  breeder: string;
  syndicateManager: string;
  bloodstockAgent: string;
  personnel: string;
}

/** Role → the PERSON ids connected to one horse in that role. */
export type ConnectionMap = Record<PartyRole, string[]>;

export function emptyConnectionMap(): ConnectionMap {
  return {
    owner: [],
    trainer: [],
    jockey: [],
    breeder: [],
    'bloodstock agent': [],
    'syndicate manager': [],
    personnel: [],
  };
}

/** Person ids per role for one horse. The map is fresh, so callers may mutate it. */
export function connectionsForHorse(edges: PartyRow[], horseId: string): ConnectionMap {
  const map = emptyConnectionMap();
  if (!horseId) return map;
  for (const e of edges) {
    if (e.horseId !== horseId) continue;
    const list = map[e.role];
    // Guard the role: it crosses the wire as a string, and an edge carrying a
    // role this build doesn't know would otherwise throw on `.includes`.
    if (list && !list.includes(e.personId)) list.push(e.personId);
  }
  return map;
}

/**
 * Build a reusable display-name resolver from the edge list (indexes once, then
 * cheap per horse). Same `(horse) => HorseConnections` shape as before.
 *
 * Names come off the edge, where the server projects them from `people` — so a
 * renamed person is correct everywhere without touching a horse record.
 */
export function connectionResolver(edges: PartyRow[]): (horse: Horse) => HorseConnections {
  const byHorse = new Map<string, Record<PartyRole, string[]>>();
  for (const e of edges) {
    if (!e.horseId) continue;
    let roles = byHorse.get(e.horseId);
    if (!roles) {
      roles = emptyConnectionMap();
      byHorse.set(e.horseId, roles);
    }
    const list = roles[e.role];
    if (list && e.name && !list.includes(e.name)) list.push(e.name);
  }

  return (horse: Horse) => {
    const roles = byHorse.get(horse.id) ?? emptyConnectionMap();
    const join = (role: PartyRole) => (roles[role] ?? []).join(', ');
    return {
      owner: join('owner'),
      trainer: join('trainer'),
      jockey: join('jockey'),
      breeder: join('breeder'),
      syndicateManager: join('syndicate manager'),
      bloodstockAgent: join('bloodstock agent'),
      personnel: join('personnel'),
    };
  };
}

/** One-off convenience for a single horse. */
export function horseConnections(horse: Horse, edges: PartyRow[]): HorseConnections {
  return connectionResolver(edges)(horse);
}

export interface ReconcileApi {
  addParty: (draft: { personId: string; role: PartyRole; horseId?: string }) => Promise<string>;
  removeParty: (id: string) => Promise<boolean>;
}

export interface ReconcileResult {
  added: number;
  removed: number;
  failed: number;
}

/**
 * Create ONE edge unless it already exists. Returns true if it created one.
 *
 * Needed because POST /api/horses ALSO links the creator when a member registers
 * a horse (routes/horses/index.ts) — a deliberate safety net, so a member cannot
 * lose access to their own horse if the client forgets. Adding the same link
 * again from here would put the person in their connection box twice, so callers
 * must re-read the register after saving the horse and pass the fresh edges.
 */
export async function ensureConnection(
  edges: PartyRow[],
  horseId: string,
  personId: string,
  role: PartyRole,
  addParty: ReconcileApi['addParty'],
): Promise<boolean> {
  if (!horseId || !personId) return false;
  const exists = edges.some(
    (e) => e.horseId === horseId && e.personId === personId && e.role === role,
  );
  if (exists) return false;
  return Boolean(await addParty({ personId, role, horseId }));
}

/**
 * Make the horse's edges match `next`, creating and deleting only the difference.
 *
 * Writing connections is now a separate round trip from saving the horse, because
 * they are separate records. Callers must therefore have a horse id already — for
 * a NEW horse, save it first and reconcile against the returned id.
 */
export async function reconcileHorseConnections(
  horseId: string,
  next: ConnectionMap,
  edges: PartyRow[],
  api: ReconcileApi,
): Promise<ReconcileResult> {
  const result: ReconcileResult = { added: 0, removed: 0, failed: 0 };
  if (!horseId) return result;

  const current = edges.filter((e) => e.horseId === horseId);

  for (const role of PARTY_ROLES) {
    const wanted = new Set(next[role] ?? []);
    const held = current.filter((e) => e.role === role);

    // Drop edges nobody selected any more. A CLAIMED edge is somebody's identity
    // and their route to this horse, so it is never deleted from here — removing
    // it would silently revoke a member's access from a form about the horse.
    for (const edge of held) {
      if (wanted.has(edge.personId)) continue;
      if (edge.taken) continue;
      if (await api.removeParty(edge.id)) result.removed += 1;
      else result.failed += 1;
    }

    const alreadyHeld = new Set(held.map((e) => e.personId));
    for (const personId of wanted) {
      if (alreadyHeld.has(personId)) continue;
      if (await api.addParty({ personId, role, horseId })) result.added += 1;
      else result.failed += 1;
    }
  }

  return result;
}
