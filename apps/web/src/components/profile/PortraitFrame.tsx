/**
 * PortraitFrame — the gold-framed hero portrait. Thin wrapper over HeroImageEdit
 * (already dual-mode: read = photo or "No photo on file"; edit = direct upload),
 * so the public view and the editable studio render the exact same component —
 * only `editable` differs.
 */
import { HeroImageEdit } from '@/components/profile/editable';
import type { UploadKind } from '@/lib/upload';

const noop = () => {};

export function PortraitFrame({ src, alt, editable, kind, onUpload, caption, containerStyle, label }: {
  src?: string;
  alt: string;
  editable: boolean;
  kind: UploadKind;
  onUpload?: (url: string) => void | Promise<void>;
  /** Role / name block overlaid on the bottom of the portrait. */
  caption?: React.ReactNode;
  containerStyle?: React.CSSProperties;
  /** Upload-button label shown in the empty editable state (e.g. onboarding CTA). */
  label?: string;
}) {
  return (
    <HeroImageEdit
      src={src}
      alt={alt}
      editable={editable}
      kind={kind}
      onUpload={onUpload ?? noop}
      containerStyle={containerStyle}
      label={label}
    >
      {caption}
    </HeroImageEdit>
  );
}
