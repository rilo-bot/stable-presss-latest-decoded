/**
 * Lazily inject the editor's curated Google Fonts stylesheet.
 *
 * Mirrors App.tsx's `useVintageFonts` pattern (inject one <link> guarded by id),
 * but only mounts when the magazine editor or viewer opens, so the heavier face
 * set is never requested on the lean public app pages that don't need it.
 */

import { useEffect } from 'react';
import { buildGoogleFontsHref } from './registry';

const LINK_ID = 'stablepress-editor-fonts';

export function useEditorFonts(): void {
  useEffect(() => {
    if (document.getElementById(LINK_ID)) return;
    const link = document.createElement('link');
    link.id = LINK_ID;
    link.rel = 'stylesheet';
    link.href = buildGoogleFontsHref();
    document.head.appendChild(link);
    // Intentionally NOT removed on unmount — keeps fonts warm if the editor or a
    // bulletin viewer is reopened in the same session.
  }, []);
}
