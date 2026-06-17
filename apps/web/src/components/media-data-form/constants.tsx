import type { MediaType } from '@/types/mediaItem';
import { MEDIA_TYPES } from '@/types/mediaItem';

export { MEDIA_TYPES };

export const serifStyle: React.CSSProperties = {
  fontFamily: "'IM Fell English', 'Palatino Linotype', Georgia, serif",
};

export const ACCEPTED_IMAGE_TYPES = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'avif'];

export const MAX_FILE_SIZE_MB = 50;

export const MEDIA_TYPE_ICONS: Record<MediaType, string> = {
  Article: '📰',
  Photo: '📷',
  Video: '🎬',
  'Press Release': '📢',
  Publication: '📖',
};
