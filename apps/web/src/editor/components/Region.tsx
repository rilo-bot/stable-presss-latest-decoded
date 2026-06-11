/**
 * Region wrappers used by every page template. They branch on editor mode so a
 * page component is written ONCE and works in both the editor (interactive) and
 * the public viewer (static) — guaranteeing zero design drift.
 *
 *   <RText id="cover.title" />
 *   <RImage id="cover.hero" rounded="rounded-sm" />
 *   <RQr id="cover.join" size={64} />
 */

import { useEditorContext } from '../EditorContext';
import { EditableText } from './EditableText';
import { EditableImage } from './EditableImage';
import { EditableQr } from './EditableQr';
import { TextView, ImageView, QrView } from './readonly';
import type { TextContent, ImageContent, QrContent } from '@/types/magazine';

export function RText({ id, className }: { id: string; className?: string }) {
  const { mode, viewContent } = useEditorContext();
  if (mode === 'edit') return <EditableText regionId={id} className={className} />;
  const c = viewContent?.[id];
  if (!c || c.kind !== 'text') return null;
  return <TextView content={c as TextContent} className={className} />;
}

export function RImage({
  id,
  className,
  rounded,
}: {
  id: string;
  className?: string;
  rounded?: string;
}) {
  const { mode, viewContent } = useEditorContext();
  if (mode === 'edit') return <EditableImage regionId={id} className={className} rounded={rounded} />;
  const c = viewContent?.[id];
  if (!c || c.kind !== 'image') return null;
  return <ImageView content={c as ImageContent} className={className} rounded={rounded} />;
}

export function RQr({ id, size, className }: { id: string; size?: number; className?: string }) {
  const { mode, viewContent } = useEditorContext();
  if (mode === 'edit') return <EditableQr regionId={id} size={size} className={className} />;
  const c = viewContent?.[id];
  if (!c || c.kind !== 'qr') return null;
  return <QrView content={c as QrContent} size={size} className={className} />;
}
