// ---------------------------------------------------------------------------
// The `upload` client tool — put a file the user attached in the Operator chat
// into a file input on the page ("use the photo I sent as the cover").
//
// A person would press "Upload…" and pick the file in the OS chooser. Nothing in
// the page can drive that chooser, so instead the input's FileList is set
// directly (DataTransfer) and the same `input` / `change` events a real pick
// fires are dispatched — React's onChange for a file input listens to `change`,
// so the app's own upload handler runs exactly as for a person's pick.
//
// The ghost cursor still goes to the visible control first (the styled button
// the input hides behind), so the user sees WHERE the file went.
// ---------------------------------------------------------------------------

import { useOperator } from '../operatorStore';
import { presence } from '../presence/presenceApi';
import { attachmentToFile, resolveOperatorAttachment, type OperatorAttachment } from './attachmentsStore';
import { nameFromAgentId } from './humanRef';
import {
  abortError,
  fileInputProxy,
  findAgentEl,
  isAbortError,
  isVisible,
  labelOf,
  notFoundError,
  resolveFileInput,
} from './dom';

const LOOKUP_GRACE_MS = 1500;

async function guard(): Promise<void> {
  await useOperator.getState().waitUntilRunning();
  if (useOperator.getState().abortSignal().aborted) throw abortError();
}

async function visual(fn: () => Promise<void> | void): Promise<void> {
  try {
    await fn();
  } catch (e) {
    if (isAbortError(e)) throw e;
  }
}

async function findEl(agentId: string): Promise<HTMLElement> {
  const end = Date.now() + LOOKUP_GRACE_MS;
  for (;;) {
    const el = findAgentEl(agentId);
    if (el) return el;
    if (Date.now() > end) throw notFoundError(agentId);
    await new Promise((r) => setTimeout(r, 100));
    await guard();
  }
}

/** Does `file` satisfy an <input accept="…"> list? (Browsers do not enforce it
 *  for programmatic files, so the app would receive something it never offers.) */
function accepts(accept: string, file: File): boolean {
  const list = accept.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  if (list.length === 0) return true;
  const type = file.type.toLowerCase();
  const name = file.name.toLowerCase();
  return list.some((a) => {
    if (a.startsWith('.')) return name.endsWith(a) || (a === '.jpeg' && name.endsWith('.jpg')) || (a === '.jpg' && name.endsWith('.jpeg'));
    if (a.endsWith('/*')) return type.startsWith(a.slice(0, -1));
    return type === a;
  });
}

/** The attachment the call means (resolved early so the step can name it). */
export function pickAttachment(ref: number | string | undefined): OperatorAttachment {
  const r = resolveOperatorAttachment(ref);
  if ('error' in r) throw new Error(r.error);
  return r;
}

export async function uploadToInput(
  agentId: string,
  att: OperatorAttachment,
): Promise<{ ok: true; fileName: string; size: number; mediaType: string; input: string }> {
  await guard();
  const el = await findEl(agentId);
  const resolved = resolveFileInput(el);
  if ('error' in resolved) throw new Error(resolved.error);
  const input = resolved;
  if (input.disabled) {
    // A control disabled ON PURPOSE says why in its title — the magazine studio's
    // paperclip does, for a page this user cannot change ("Submitted for review — ask
    // the owner to reopen it…"). Pass that on rather than a bare "disabled".
    const why = (el as HTMLButtonElement).disabled ? el.getAttribute('title') : null;
    throw new Error(why || `“${labelOf(el) || nameFromAgentId(agentId)}” is disabled right now.`);
  }

  const file = await attachmentToFile(att);
  if (input.accept && !accepts(input.accept, file)) {
    throw new Error(
      `That upload only takes ${input.accept}; “${file.name}” is ${file.type || 'an unknown type'}. Pick a matching attachment or ask the user for one.`,
    );
  }

  // Cursor to what a person would press: the anchor if it is visible, else the
  // button / label the hidden input stands behind.
  const target = isVisible(el) ? el : fileInputProxy(input);
  if (target && isVisible(target)) {
    await visual(() => presence.moveCursorTo(target, `Attach “${file.name}”`, useOperator.getState().abortSignal()));
    await guard();
    await visual(() => presence.clickPulse());
  }
  await guard();

  const dt = new DataTransfer();
  dt.items.add(file);
  input.files = dt.files;
  input.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));

  if (target) {
    try {
      presence.flash(target);
    } catch {
      /* visual only */
    }
  }
  const label = (target && labelOf(target)) || labelOf(input) || agentId;
  return { ok: true, fileName: file.name, size: file.size, mediaType: file.type, input: label };
}
