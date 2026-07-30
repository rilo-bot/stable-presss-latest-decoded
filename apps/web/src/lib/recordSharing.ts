/**
 * Share/unshare calls for owned production-system records.
 *
 * Media Records and Racing Data have identical endpoints, so the transport
 * lives here once rather than being duplicated in two stores that would then
 * drift — which is exactly what happened to the routes these back.
 *
 * Both return the FULL updated record, so the caller replaces its copy and the
 * server-computed `canEdit` / `sharedWith` flags stay authoritative.
 */
import { authFetch } from '@/lib/api';

export interface ShareResult<T = unknown> {
  ok: boolean;
  error?: string;
  /** The updated record, on success. */
  record?: T;
}

async function call<T>(path: string, init: RequestInit, fallback: string): Promise<ShareResult<T>> {
  try {
    const res = await authFetch(path, init);
    const data = await res.json().catch(() => null);
    if (!res.ok) return { ok: false, error: data?.error ?? fallback };
    return { ok: true, record: data as T };
  } catch {
    return { ok: false, error: 'Network error. Please try again.' };
  }
}

export function shareRecord<T>(collection: string, id: string, email: string): Promise<ShareResult<T>> {
  return call<T>(
    `/api/${collection}/${id}/share`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    },
    'Could not share this record.',
  );
}

export function unshareRecord<T>(collection: string, id: string, userId: string): Promise<ShareResult<T>> {
  return call<T>(
    `/api/${collection}/${id}/share/${userId}`,
    { method: 'DELETE' },
    'Could not remove access.',
  );
}
