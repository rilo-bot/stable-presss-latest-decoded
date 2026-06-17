import { createElement } from 'react';
import { FileText, Image as ImageIcon, File as FileIcon, FileArchive } from 'lucide-react';

export function fmtDate(d?: Date | string | null): string {
  if (!d) return '';
  try {
    return new Date(d as string).toLocaleDateString('en-AU', {
      day: 'numeric', month: 'short', year: 'numeric',
    });
  } catch { return String(d); }
}

export function fmtFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function getFileIcon(name: string) {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'avif'].includes(ext)) return createElement(ImageIcon, { size: 16 });
  if (['mp4', 'mov', 'avi', 'mkv', 'webm'].includes(ext)) return createElement(FileIcon, { size: 16 });
  if (['pdf'].includes(ext)) return createElement(FileText, { size: 16 });
  if (['zip', 'tar', 'gz', 'rar'].includes(ext)) return createElement(FileArchive, { size: 16 });
  return createElement(FileIcon, { size: 16 });
}
