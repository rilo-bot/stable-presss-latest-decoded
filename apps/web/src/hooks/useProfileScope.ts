import { useMemo, useEffect } from 'react';
import { useHorseStore } from '@/stores/horseStore';
import { usePartyStore } from '@/stores/partyStore';
import { useRacingEntryStore } from '@/stores/racingEntryStore';
import { useRegister, useLoadRegister } from '@/lib/register';
import type { PartyRole } from '@/types/party';
import type { Horse } from '@/types/horse';
import { ROLE_BINDINGS } from '@/lib/profile/roleMap';
import { horsesForPersonInRole } from '@/rbac/scope';
import type { PanelParty, ProfileSubject, CentralSummary } from '@/lib/profile/types';

export interface ProfileScope {
  /** The set of horses every record module draws from. */
  horseIds: string[];
  horses: Horse[];
  /** People connected to ANY in-scope horse, grouped by role and deduped. */
  relationshipTiles: Record<PartyRole, PanelParty[]>;
  summary: CentralSummary;
}

const EMPTY_TILES = (): Record<PartyRole, PanelParty[]> => ({
  owner: [], trainer: [], jockey: [], breeder: [],
  'bloodstock agent': [], 'syndicate manager': [], personnel: [],
});

/**
 * Resolves the universal scope for a profile subject. Horse-central is the
 * degenerate 1-horse case of person-central: both produce a `horseIds` set that
 * drives every record module, plus relationship tiles gathered across that set.
 */
export function useProfileScope(subject: ProfileSubject | null): ProfileScope {
  const horses = useHorseStore((s) => s.horses);
  const parties = usePartyStore((s) => s.parties);
  const allEntries = useRacingEntryStore((s) => s.entries);
  const fetchEntries = useRacingEntryStore((s) => s.fetchEntries);
  const register = useRegister();
  useLoadRegister();

  useEffect(() => { fetchEntries(); }, [fetchEntries]);

  // ── 1. horseIds in scope ──
  // Person-central scope comes from the shared pure resolver (rbac/scope.ts),
  // the same one the permission engine uses, so display and access never diverge.
  const horseIds = useMemo<string[]>(() => {
    if (!subject) return [];
    if (subject.kind === 'horse') return [subject.horse.id];
    return horsesForPersonInRole(subject.party.id, subject.role, { parties, horses });
  }, [subject, parties, horses]);

  const scopedHorses = useMemo(
    () => horses.filter((h) => horseIds.includes(h.id)),
    [horses, horseIds],
  );

  // ── 2. relationship tiles across the in-scope horses ──
  const relationshipTiles = useMemo(() => {
    const tiles = EMPTY_TILES();
    const idSet = new Set(horseIds);
    // role → map(personId → PanelParty), deduped across horses
    const acc: Record<PartyRole, Map<string, PanelParty>> = {
      owner: new Map(), trainer: new Map(), jockey: new Map(), breeder: new Map(),
      'bloodstock agent': new Map(), 'syndicate manager': new Map(), personnel: new Map(),
    };
    const personById = (id: string) => register.find((p) => p.id === id);

    // The edge IS the relationship — its `role` is the tile it belongs in.
    parties.forEach((edge) => {
      if (!edge.horseId || !idSet.has(edge.horseId)) return;
      const person = personById(edge.personId);
      if (!person) return;
      if (!acc[edge.role].has(person.id)) {
        acc[edge.role].set(person.id, { party: person, isCurrent: true });
      }
    });

    // Fold in the legacy direct id-array fields from each in-scope horse.
    scopedHorses.forEach((h) => {
      (Object.keys(ROLE_BINDINGS) as PartyRole[]).forEach((role) => {
        const arr = h[ROLE_BINDINGS[role].horseField] as string[] | undefined;
        if (!Array.isArray(arr)) return;
        arr.forEach((personId) => {
          if (acc[role].has(personId)) return;
          const person = personById(personId);
          if (person) acc[role].set(personId, { party: person, isCurrent: true });
        });
      });
    });

    (Object.keys(acc) as PartyRole[]).forEach((role) => {
      tiles[role] = Array.from(acc[role].values());
    });
    return tiles;
  }, [horseIds, scopedHorses, parties, register]);

  // ── 3. central career summary aggregated across the set ──
  const summary = useMemo<CentralSummary>(() => {
    const idSet = new Set(horseIds);
    const totalWinnings = scopedHorses.reduce((s, h) => s + (h.careerWinnings ?? 0), 0);
    let topRating: number | undefined;
    scopedHorses.forEach((h) => {
      if (h.currentRating !== undefined && (topRating === undefined || h.currentRating > topRating)) topRating = h.currentRating;
    });

    // Wins: finished entries placed 1st across the set. For a jockey or trainer
    // subject, narrow to entries where THEY were the jockey/trainer.
    let personId: string | undefined;
    let winRole: 'jockey' | 'trainer' | undefined;
    if (subject?.kind === 'party') {
      if (subject.role === 'jockey') { personId = subject.party.id; winRole = 'jockey'; }
      else if (subject.role === 'trainer') { personId = subject.party.id; winRole = 'trainer'; }
    }
    const wins = allEntries.filter((e) => {
      if (!idSet.has(e.horse_id)) return false;
      if (e.finish_position !== 1) return false;
      if (winRole === 'jockey' && personId) return e.jockey_id === personId;
      if (winRole === 'trainer' && personId) return e.trainer_id === personId;
      return true;
    }).length;

    return { horseCount: horseIds.length, totalWinnings, wins, topRating };
  }, [horseIds, scopedHorses, allEntries, subject]);

  return { horseIds, horses: scopedHorses, relationshipTiles, summary };
}
