/**
 * Resolve a horse's connection display names from its party-id links.
 *
 * Replaces the removed legacy free-text fields (horse.owner / .trainer / …):
 * names now come from the party records referenced by ownerIds/trainerIds/etc.
 * Build a resolver once per parties list, then call it per horse (cheap).
 */
import type { Horse } from '@/types/horse';
import type { RegisterPerson } from '@/lib/register';

export interface HorseConnections {
  owner: string;
  trainer: string;
  jockey: string;
  breeder: string;
  syndicateManager: string;
  bloodstockAgent: string;
  personnel: string;
}

/** Build a reusable resolver from a parties list (indexes once). */
export function connectionResolver(parties: RegisterPerson[]): (horse: Horse) => HorseConnections {
  const byId = new Map(parties.map((p) => [p.id, p]));
  const join = (ids?: string[]): string =>
    (ids ?? []).map((id) => byId.get(id)?.name).filter(Boolean).join(', ');
  return (horse: Horse) => ({
    owner: join(horse.ownerIds),
    trainer: join(horse.trainerIds),
    jockey: join(horse.jockeyIds),
    breeder: join(horse.breederIds),
    syndicateManager: join(horse.syndicateManagerIds),
    bloodstockAgent: join(horse.bloodstockAgentIds),
    personnel: join(horse.personnelIds),
  });
}

/** One-off convenience for a single horse. */
export function horseConnections(horse: Horse, parties: RegisterPerson[]): HorseConnections {
  return connectionResolver(parties)(horse);
}
