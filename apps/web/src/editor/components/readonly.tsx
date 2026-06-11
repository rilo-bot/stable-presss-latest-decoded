/**
 * Read-only region views for the public bulletin viewer. They render the exact
 * same content/styles as the editable primitives but are static (no inputs, no
 * store writes), with rich text sanitized on read.
 */

import { QRCodeSVG } from 'qrcode.react';
import { useMagazineStore } from '@/stores/magazineStore';
import { textStyleToCss } from './regionStyle';
import { sanitizeRichText } from '../lib/sanitize';
import type { TextContent, ImageContent, QrContent } from '@/types/magazine';
import { cn } from '@/lib/utils';

export function TextView({ content, className }: { content: TextContent; className?: string }) {
  return (
    <div
      className={className}
      style={textStyleToCss(content.style)}
      dangerouslySetInnerHTML={{ __html: sanitizeRichText(content.html) }}
    />
  );
}

export function ImageView({
  content,
  className,
  rounded,
}: {
  content: ImageContent;
  className?: string;
  rounded?: string;
}) {
  const resolveImage = useMagazineStore((s) => s.resolveImage);
  const src = resolveImage(content.src);
  return (
    <div className={cn('w-full h-full overflow-hidden', rounded, className)}>
      {src && (
        <img
          src={src}
          alt={content.alt ?? ''}
          className="w-full h-full"
          style={{
            objectFit: content.fit,
            objectPosition: `${(content.focalX ?? 0.5) * 100}% ${(content.focalY ?? 0.5) * 100}%`,
          }}
        />
      )}
    </div>
  );
}

export function QrView({
  content,
  size = 72,
  className,
}: {
  content: QrContent;
  size?: number;
  className?: string;
}) {
  return (
    <span className={cn('inline-flex bg-white p-1 rounded-[2px]', className)}>
      <QRCodeSVG
        value={content.targetUrl || 'https://raceowners.co.nz'}
        size={size}
        fgColor={content.fg ?? '#0a2342'}
        bgColor={content.bg ?? '#ffffff'}
        level="M"
        marginSize={0}
      />
    </span>
  );
}
