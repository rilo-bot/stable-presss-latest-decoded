// Client for the AI field-composer (/api/agent/compose). Sends the field label,
// entity kind, the facts the form already holds, and an optional typed/dictated
// brief; gets back drafted text for that one field. Key stays server-side.

import { apiUrl } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';

export interface ComposeArgs {
  /** Human label of the field, e.g. "Summary / lead paragraph". */
  label: string;
  /** Optional stable field key, e.g. "summary". */
  key?: string;
  /** What the record is — "article" | "horse" | "party" | "media" … */
  entityKind: string;
  /** Facts the form already knows (title, sire/dam, roles, etc.) to ground the text. */
  context?: Record<string, unknown>;
  /** Optional typed or dictated steer from the user. */
  instruction?: string;
  /** The field's current value, if any (the model may improve/rewrite it). */
  currentValue?: string;
}

export async function composeField(args: ComposeArgs): Promise<string> {
  const token = useAuthStore.getState().token;
  const res = await fetch(apiUrl('/api/agent/compose'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({
      field: { key: args.key, label: args.label },
      entityKind: args.entityKind,
      context: args.context ?? {},
      instruction: args.instruction ?? '',
      currentValue: args.currentValue ?? '',
    }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => null);
    throw new Error(data?.error || `compose ${res.status}`);
  }
  const data = await res.json();
  return typeof data.text === 'string' ? data.text : '';
}
