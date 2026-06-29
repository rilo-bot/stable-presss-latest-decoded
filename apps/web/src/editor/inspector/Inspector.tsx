/**
 * Inspector shell. Subscribes narrowly to the selected region (resolved within
 * the current magazine) and renders the matching panel. When nothing is
 * selected it shows a hint. Because it reads only the selected region's slice,
 * typing in a region re-renders the inspector at most, never the whole magazine.
 */

import { useMagazineStore } from '@/stores/magazineStore';
import { TextInspector } from './TextInspector';
import { ImageInspector } from './ImageInspector';
import { QrInspector } from './QrInspector';
import { IconInspector } from './IconInspector';
import { regionDisplayName } from '../templates/regionNames';
import { MousePointerClick, Type, Image as ImageIcon, QrCode, Shapes } from 'lucide-react';
import type { RegionContent } from '@/types/magazine';

interface Resolved {
  magazineId: string;
  pageId: string;
  pageLabel: string;
  regionId: string;
  content: RegionContent;
}

const KIND_META: Record<RegionContent['kind'], { label: string; icon: typeof Type }> = {
  text: { label: 'Text', icon: Type },
  image: { label: 'Image', icon: ImageIcon },
  qr: { label: 'QR Code', icon: QrCode },
  icon: { label: 'Icon', icon: Shapes },
};

export function Inspector() {
  const resolved = useMagazineStore((s): Resolved | null => {
    if (!s.currentId || !s.selectedRegionId) return null;
    const m = s.magazines.find((x) => x.id === s.currentId);
    if (!m) return null;
    // Target the exact page the region was selected on — region ids repeat across
    // pages of the same type, so a first-match scan would edit the wrong page.
    const page = s.selectedPageId
      ? m.pages.find((p) => p.id === s.selectedPageId)
      : m.pages.find((p) => s.selectedRegionId! in p.content);
    if (!page) return null;
    const c = page.content[s.selectedRegionId];
    if (!c) return null;
    return { magazineId: m.id, pageId: page.id, pageLabel: page.label, regionId: s.selectedRegionId, content: c };
  });

  if (!resolved) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-6 text-center">
        <MousePointerClick size={26} className="mb-3 text-white/25" />
        <p className="text-sm font-semibold text-white/70">Nothing selected</p>
        <p className="mt-1 text-xs leading-relaxed text-white/40">
          Click any headline, paragraph, photo, or QR code on the page to edit it here.
        </p>
      </div>
    );
  }

  const meta = KIND_META[resolved.content.kind];
  const Icon = meta.icon;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-white/10 px-3.5 py-3">
        <span className="flex h-7 w-7 items-center justify-center rounded-sm bg-sky-500/20 text-sky-300">
          <Icon size={14} />
        </span>
        <div className="min-w-0">
          <p className="truncate text-xs font-bold text-white">{regionDisplayName(resolved.regionId)}</p>
          <p className="truncate text-[10px] text-white/40">{meta.label} · {resolved.pageLabel}</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {resolved.content.kind === 'text' && (
          <TextInspector
            magazineId={resolved.magazineId}
            pageId={resolved.pageId}
            regionId={resolved.regionId}
            content={resolved.content}
          />
        )}
        {resolved.content.kind === 'image' && (
          <ImageInspector
            magazineId={resolved.magazineId}
            pageId={resolved.pageId}
            regionId={resolved.regionId}
            content={resolved.content}
          />
        )}
        {resolved.content.kind === 'qr' && (
          <QrInspector
            magazineId={resolved.magazineId}
            pageId={resolved.pageId}
            regionId={resolved.regionId}
            content={resolved.content}
          />
        )}
        {resolved.content.kind === 'icon' && (
          <IconInspector
            magazineId={resolved.magazineId}
            pageId={resolved.pageId}
            regionId={resolved.regionId}
            content={resolved.content}
          />
        )}
      </div>
    </div>
  );
}
