// TEMPORARY preview route (no auth) so the premium pages can be screenshot for
// visual QA against the source PDF. Delete this file + its route when done.
import { EditorProvider } from '@/editor/EditorContext';
import { useEditorFonts } from '@/editor/fonts/useEditorFonts';
import { PAGE_COMPONENTS } from '@/editor/templates/registry';
import { BLUEPRINT_BY_TYPE } from '@/editor/templates/blueprints';
import { PAGE_W, PAGE_H } from '@/editor/templates/parts';
import type { PageTypeKey } from '@/types/magazine';

const PAGES: PageTypeKey[] = ['cover-px', 'president-px', 'editor-px', 'discussion-px', 'headline-px'];

export default function PremiumPreview() {
  useEditorFonts();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24, alignItems: 'center', padding: 24, background: '#3a3a3a' }}>
      {PAGES.map((pt) => {
        const Comp = PAGE_COMPONENTS[pt];
        const content = BLUEPRINT_BY_TYPE[pt]?.defaultContent ?? {};
        return (
          <div key={pt} style={{ width: PAGE_W, height: PAGE_H, flexShrink: 0 }} data-page={pt}>
            <EditorProvider value={{ mode: 'view', viewContent: content }}>
              <Comp />
            </EditorProvider>
          </div>
        );
      })}
    </div>
  );
}
