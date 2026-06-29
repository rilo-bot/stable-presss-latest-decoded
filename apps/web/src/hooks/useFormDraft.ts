import { useEffect, useMemo, useRef, useCallback } from 'react';

/**
 * Auto-draft persistence for forms.
 *
 * If a user accidentally closes a form (clicks away, hits the X, refreshes the
 * tab) before saving, their in-progress data is kept in localStorage so it can
 * be restored when they re-open the form. The draft is cleared once the form is
 * successfully submitted.
 *
 * Usage:
 *   const draft = useMemo(() => loadDraft<Shape>(KEY), []);   // read once, in render
 *   const [name, setName] = useState(initial?.name ?? draft?.name ?? '');
 *   ...
 *   const { clearDraft, restored } = useFormDraft(KEY, { name, ... }, { enabled: !isEdit });
 *   // call clearDraft() on successful save
 */

const PREFIX = 'sp:draft:';

function storageKey(key: string) {
  return PREFIX + key;
}

/** Synchronously read a saved draft. Safe to call inside `useState` initialisers. */
export function loadDraft<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(storageKey(key));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { data?: T } | null;
    return (parsed?.data ?? null) as T | null;
  } catch {
    return null;
  }
}

/** Remove a saved draft. */
export function clearDraftFor(key: string): void {
  try {
    localStorage.removeItem(storageKey(key));
  } catch {
    /* ignore */
  }
}

interface UseFormDraftOptions<T> {
  /** When false, drafting is disabled (e.g. edit mode). Default true. */
  enabled?: boolean;
  /** Debounce before writing to storage, ms. Default 500. */
  debounceMs?: number;
  /** Return true when `data` should be treated as empty (not worth saving). */
  isEmpty?: (data: T) => boolean;
}

interface UseFormDraftResult {
  /** Delete the persisted draft. Call this after a successful save. */
  clearDraft: () => void;
  /** True when a draft existed in storage at mount time (restored into the form). */
  restored: boolean;
}

/**
 * Debounced auto-save of `data` to localStorage under `key`.
 * Returns `clearDraft()` (call on successful submit) and `restored`
 * (whether a draft was present at mount, for an optional "draft restored" hint).
 */
export function useFormDraft<T>(
  key: string,
  data: T,
  options: UseFormDraftOptions<T> = {},
): UseFormDraftResult {
  const { enabled = true, debounceMs = 500, isEmpty } = options;

  // Capture whether a draft existed at mount — used for the restore hint.
  const restoredRef = useRef<boolean>(false);
  const mountedRef = useRef(false);
  if (!mountedRef.current) {
    mountedRef.current = true;
    try {
      restoredRef.current = enabled && localStorage.getItem(storageKey(key)) != null;
    } catch {
      restoredRef.current = false;
    }
  }

  // Keep latest isEmpty without making it a dependency.
  const isEmptyRef = useRef(isEmpty);
  isEmptyRef.current = isEmpty;

  // Stable string view of the data so the effect only fires on real changes.
  const serialized = useMemo(() => {
    try {
      return JSON.stringify(data);
    } catch {
      return null;
    }
  }, [data]);

  useEffect(() => {
    if (!enabled || serialized == null) return;
    const handle = setTimeout(() => {
      try {
        if (isEmptyRef.current?.(data)) {
          localStorage.removeItem(storageKey(key));
          return;
        }
        localStorage.setItem(
          storageKey(key),
          JSON.stringify({ data: JSON.parse(serialized) }),
        );
      } catch {
        /* quota exceeded / serialisation failure — drafting is best-effort */
      }
    }, debounceMs);
    return () => clearTimeout(handle);
    // `data` intentionally omitted: `serialized` already tracks its content.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled, debounceMs, serialized]);

  const clearDraft = useCallback(() => clearDraftFor(key), [key]);

  return { clearDraft, restored: restoredRef.current };
}
