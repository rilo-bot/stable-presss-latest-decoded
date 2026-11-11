// ---------------------------------------------------------------------------
// Operator action registry. Screens register named actions while mounted:
//
//   useAgentAction({
//     name: 'magazine.sharePages',
//     description: 'Share pages of this magazine with a staff member',
//     args: z.object({ userId: z.string(), pages: z.array(z.number()) }),
//     confirm: (a) => `Share page(s) ${a.pages.join(', ')} with …?`,
//     run: async (a, ui) => { await ui.click('mag.share-button'); … },
//   });
//
// The hook always calls the LATEST def (kept in a ref), so run() may close over
// fresh component state without re-registering every render. Registration
// order is preserved; a later registration of the same name wins until it
// unmounts (then the earlier one is visible again).
// ---------------------------------------------------------------------------

import { useEffect, useRef } from 'react';
import type { OperatorActionDef } from '../contracts';

type Entry = { key: number; get: () => OperatorActionDef };

let keySeq = 0;
const entries: Entry[] = [];

/** Register imperatively (non-React code). Returns an unregister function. */
export function registerAction(def: OperatorActionDef | (() => OperatorActionDef)): () => void {
  const get = typeof def === 'function' ? def : () => def;
  const entry: Entry = { key: keySeq++, get };
  entries.push(entry);
  return () => {
    const i = entries.indexOf(entry);
    if (i >= 0) entries.splice(i, 1);
  };
}

/** Register an action for as long as the calling component is mounted. */
export function useAgentAction<A>(def: OperatorActionDef<A>, enabled = true): void {
  const ref = useRef(def);
  ref.current = def;
  const name = def.name;
  useEffect(() => {
    if (!enabled) return;
    return registerAction(() => ref.current as OperatorActionDef);
  }, [name, enabled]);
}

/** The currently visible action with this name (latest registration wins). */
export function getAction(name: string): OperatorActionDef | undefined {
  for (let i = entries.length - 1; i >= 0; i--) {
    const d = entries[i].get();
    if (d.name === name) return d;
  }
  return undefined;
}

/** All currently registered actions (deduped by name, latest wins). */
export function listActions(): OperatorActionDef[] {
  const seen = new Map<string, OperatorActionDef>();
  for (const e of entries) {
    const d = e.get();
    seen.set(d.name, d);
  }
  return [...seen.values()];
}
