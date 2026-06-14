import { useMemo, useEffect } from 'react';
import { useHorseStore } from '@/stores/horseStore';
import { usePartyStore } from '@/stores/partyStore';
import { useHorsePartyLinkStore } from '@/stores/horsePartyLinkStore';
import { useRacingEntryStore } from '@/stores/racingEntryStore';
import { isCurrentLink } from '@/types/horsePartyLink';
import type { PartyRole } from '@/types/party';
import type { Horse } from '@/types/horse';
import { ROLE_BINDINGS } from '@/lib/profile/roleMap';
import { horsesInScopeForParty } from '@/rbac/scope';
import type { PanelParty, ProfileSubject, CentralSummary } from '@/lib/profile/types';

export interface ProfileScope {
  /** The set of horses every record module draws from. */
  horseIds: string[];
  horses: Horse[];
  /** Parties linked to ANY in-scope horse, grouped by role, deduped, current-first. */
  relationshipTiles: Record<PartyRole, PanelParty[]>;
  summary: CentralSummary;
}

const EMPTY_TILES = (): Record<PartyRole, PanelParty[]> => ({
  owner: [], trainer: [], jockey: [], breeder: [],
  'bloodstock agent': [], 'syndicate manager': [], personnel: [],
});

/**
 * Resolves the universal scope for a profile subject. Horse-central is the
 * degenerate 1-horse case of party-central: both produce a `horseIds` set that
 * drives every record module, plus relationship tiles gathered across that set.
 */
export function useProfileScope(subject: ProfileSubject | null): ProfileScope {
  const horses = useHorseStore((s) => s.horses);
  const allParties = usePartyStore((s) => s.parties);
  const allLinks = useHorsePartyLinkStore((s) => s.links);
  const fetchLinks = useHorsePartyLinkStore((s) => s.fetchHorsePartyLinks);
  const allEntries = useRacingEntryStore((s) => s.entries);
  const fetchEntries = useRacingEntryStore((s) => s.fetchEntries);

  useEffect(() => { fetchLinks(); fetchEntries(); }, [fetchLinks, fetchEntries]);

  // ── 1. horseIds in scope ──
  // Party-central scope now comes from the shared pure resolver (rbac/scope.ts),
  // the same one the permission engine uses, so display and access never diverge.
  const horseIds = useMemo<string[]>(() => {
    if (!subject) return [];
    if (subject.kind === 'horse') return [subject.horse.id];
    return horsesInScopeForParty(subject.party.id, subject.role, { horses, links: allLinks });
  }, [subject, allLinks, horses]);

  const scopedHorses = useMemo(
    () => horses.filter((h) => horseIds.includes(h.id)),
    [horses, horseIds],
  );

  // ── 2. relationship tiles across the in-scope horses ──
  const relationshipTiles = useMemo(() => {
    const tiles = EMPTY_TILES();
    const idSet = new Set(horseIds);
    // role → map(party_id → PanelParty) for dedup across horses
    const acc: Record<PartyRole, Map<string, PanelParty>> = {
      owner: new Map(), trainer: new Map(), jockey: new Map(), breeder: new Map(),
      'bloodstock agent': new Map(), 'syndicate manager': new Map(), personnel: new Map(),
    };
    const relToRole: Record<string, PartyRole> = {
      ownership: 'owner', training: 'trainer', riding: 'jockey',
      'bred-by': 'breeder', agent: 'bloodstock agent', personnel: 'personnel',
    };

    allLinks.forEach((l) => {
      if (!idSet.has(l.horse_id)) return;
      const party = allParties.find((p) => p.id === l.party_id);
      if (!party) return;
      const current = isCurrentLink(l);
      const place = (role: PartyRole) => {
        const m = acc[role];
        const existing = m.get(party.id);
        if (existing) {
          if (current) existing.isCurrent = true;
        } else {
          m.set(party.id, { party, startDate: l.start_date, endDate: l.end_date, context: l.context, isCurrent: current });
        }
      };
      const role = relToRole[l.relationship_type];
      if (role) place(role);
      // A party may also carry the syndicate-manager role regardless of link type.
      if (party.roles.includes('syndicate manager')) place('syndicate manager');
    });

    // Fold in legacy direct id-array fields from each in-scope horse.
    scopedHorses.forEach((h) => {
      (Object.keys(ROLE_BINDINGS) as PartyRole[]).forEach((role) => {
        const field = ROLE_BINDINGS[role].horseField;
        const arr = h[field] as string[] | undefined;
        if (!Array.isArray(arr)) return;
        arr.forEach((pid) => {
          if (acc[role].has(pid)) return;
          const party = allParties.find((p) => p.id === pid);
          if (party) acc[role].set(pid, { party, isCurrent: true });
        });
      });
    });

    (Object.keys(acc) as PartyRole[]).forEach((role) => {
      tiles[role] = Array.from(acc[role].values())
        .sort((a, b) => (b.isCurrent ? 1 : 0) - (a.isCurrent ? 1 : 0));
    });
    return tiles;
  }, [horseIds, scopedHorses, allLinks, allParties]);

  // ── 3. central career summary aggregated across the set ──
  const summary = useMemo<CentralSummary>(() => {
    const idSet = new Set(horseIds);
    const totalWinnings = scopedHorses.reduce((s, h) => s + (h.careerWinnings ?? 0), 0);
    let topRating: number | undefined;
    scopedHorses.forEach((h) => {
      if (h.currentRating !== undefined && (topRating === undefined || h.currentRating > topRating)) topRating = h.currentRating;
    });

    // Wins: count finished entries placed 1st across the set. For jockey/trainer
    // subjects, scope to entries where this party is the jockey/trainer.
    let partyId: string | undefined;
    let winRole: 'jockey' | 'trainer' | undefined;
    if (subject?.kind === 'party') {
      if (subject.role === 'jockey') { partyId = subject.party.id; winRole = 'jockey'; }
      else if (subject.role === 'trainer') { partyId = subject.party.id; winRole = 'trainer'; }
    }
    const wins = allEntries.filter((e) => {
      if (!idSet.has(e.horse_id)) return false;
      if (e.finish_position !== 1) return false;
      if (winRole === 'jockey' && partyId) return e.jockey_id === partyId;
      if (winRole === 'trainer' && partyId) return e.trainer_id === partyId;
      return true;
    }).length;

    return { horseCount: horseIds.length, totalWinnings, wins, topRating };
  }, [horseIds, scopedHorses, allEntries, subject]);

  return { horseIds, horses: scopedHorses, relationshipTiles, summary };
}
