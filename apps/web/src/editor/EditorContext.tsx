/**
 * EditorContext — tells region primitives whether they're being edited or just
 * displayed, and where to read their content from.
 *
 * In 'edit' mode the primitives subscribe to the magazine store (narrow
 * per-region selectors → only the edited region re-renders). In 'view' mode
 * they read static content for the current page from `viewContent` and render
 * read-only, so the public bulletin viewer reuses the exact same page-template
 * components with zero interactivity.
 */

import { createContext, useContext } from 'react';
import type { RegionContent } from '@/types/magazine';

export interface EditorContextValue {
  mode: 'edit' | 'view';
  /** edit mode — identifies the magazine + page currently rendered. */
  magazineId?: string;
  pageId?: string;
  /** view mode — static content for the page currently rendered. */
  viewContent?: Record<string, RegionContent>;
}

const EditorContext = createContext<EditorContextValue>({ mode: 'view', viewContent: {} });

export const EditorProvider = EditorContext.Provider;

export function useEditorContext(): EditorContextValue {
  return useContext(EditorContext);
}
