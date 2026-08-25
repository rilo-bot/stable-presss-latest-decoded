// ---------------------------------------------------------------------------
// Pull attachable files off a clipboard paste.
//
// Pasting is the fastest way to get a screenshot into a chat, and it is the only
// way to attach one that was never a file — a region grab (Win+Shift+S, Cmd+Ctrl+
// Shift+4), a "Copy image" from a web page, a crop from an image editor. None of
// those exist on disk, so the 📎 picker cannot reach them at all.
//
// TWO SHAPES, AND YOU HAVE TO READ BOTH. A pasted file arrives either in
// `clipboardData.files` (Chrome, Edge, current Firefox) or only in
// `clipboardData.items` as a `kind: 'file'` entry (Safari, and some Linux/Firefox
// paths where `files` comes back empty). Reading one of them loses the paste on
// whichever browsers use the other — and it fails SILENTLY: the user presses
// Ctrl+V and nothing appears, with nothing to tell them why. So both are read and
// the result is de-duplicated.
//
// NAMES ARE NOT INTERNAL HERE. A pasted screenshot carries a browser-generated
// name — Chrome calls every single one `image.png` — or no name at all. That name
// becomes the chip in the composer, the label on the sent message, and the alt
// text stored with the image in the magazine's media library. Three chips all
// reading "image.png" is not a label, so a generic name is replaced with a
// numbered one; a real filename (dragged from Explorer, copied from Finder) is
// always left exactly as it is.
// ---------------------------------------------------------------------------

/** Raster images every attachment path here can read (matches lib/upload's set). */
const IMAGE_TYPES = /^image\/(jpeg|png|webp|gif|avif)$/i;

/** Document MIME types the assistant ingests (mirrors ATTACH_ACCEPT). */
const DOC_TYPES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'text/csv',
  'text/markdown',
]);

/** Fallback for a clipboard file whose `type` the browser left blank. */
const DOC_EXT = /\.(pdf|docx|txt|csv|md|markdown)$/i;

/** Can this pasted file be staged as an attachment at all? */
export function isPasteAttachable(file: File): boolean {
  if (IMAGE_TYPES.test(file.type)) return true;
  if (DOC_TYPES.has(file.type)) return true;
  // A blank `type` is common for files copied out of a file manager; fall back
  // to the extension rather than dropping something we can plainly read.
  return !file.type && DOC_EXT.test(file.name);
}

export const isPasteImage = (file: File): boolean => IMAGE_TYPES.test(file.type);

/** File extension for a pasted image's MIME type. */
function extFor(type: string): string {
  const sub = type.toLowerCase().replace(/^image\//, '').split(/[;+]/)[0] ?? '';
  return sub === 'jpeg' ? 'jpg' : sub || 'png';
}

/**
 * A name the browser invented rather than one the user gave the file.
 *
 * Matches an empty name, a bare extension, and the handful of stems browsers use
 * for clipboard bitmaps. Anything else is a real filename and is left alone —
 * renaming `spring-carnival-hero.jpg` to "Pasted image 1" would be losing
 * information, not tidying it.
 */
const GENERIC_NAME = /^(?:image|unknown|blob|untitled|screenshot)?(?:\s*\(\d+\))?(?:\.[a-z0-9]+)?$/i;

/**
 * Every attachable file on the clipboard, de-duplicated across `files`/`items`
 * and with browser-generated image names replaced by numbered ones.
 *
 * `startIndex` is how many pasted images the composer already holds, so the
 * numbering continues across separate pastes instead of restarting at 1 and
 * producing two chips with the same label.
 */
export function filesFromClipboard(
  data: DataTransfer | null | undefined,
  opts: { startIndex?: number } = {},
): File[] {
  if (!data) return [];

  // `files` is the shape to trust when it has anything; `items` is the fallback for
  // the browsers that leave `files` empty. Deliberately NOT merged: `getAsFile()`
  // mints a fresh File on every call, so reading both would stage every pasted
  // image twice on the browsers that populate both.
  const collected: File[] = data.files?.length ? [...data.files] : [];
  if (collected.length === 0) {
    for (const item of data.items ?? []) {
      if (item.kind !== 'file') continue;
      const file = item.getAsFile();
      if (file) collected.push(file);
    }
  }

  // Belt and braces on top of the either/or above. Keyed WITHOUT `lastModified`:
  // some browsers stamp it at access time, so two reads of one clipboard entry can
  // differ by a millisecond and defeat the very check meant to catch them. Two
  // genuinely different files sharing a name, a byte count AND a type on one
  // clipboard is not a case worth keeping the weaker key for.
  const seen = new Set<string>();
  const unique: File[] = [];
  for (const file of collected) {
    const key = `${file.name}|${file.size}|${file.type}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (isPasteAttachable(file)) unique.push(file);
  }

  // Rename AFTER de-duplication: two copies of one clipboard bitmap are only
  // recognisable as duplicates while they still share their generated name.
  let pasted = Math.max(0, opts.startIndex ?? 0);
  return unique.map((file) => {
    if (!isPasteImage(file) || !GENERIC_NAME.test(file.name)) return file;
    pasted += 1;
    const renamed = `Pasted image ${pasted}.${extFor(file.type)}`;
    return new File([file], renamed, { type: file.type, lastModified: file.lastModified });
  });
}
