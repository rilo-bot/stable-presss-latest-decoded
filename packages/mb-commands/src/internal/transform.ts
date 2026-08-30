// ---------------------------------------------------------------------------
// Group transform maths.
//
// Per LANE-1 §7.4 and D-21, a group's frame is the BOUNDING BOX of its children,
// not an independent rectangle. Children keep page coordinates, so transforming
// a group means applying one affine map to every descendant.
//
// Three rules from that section, all load-bearing:
//   move    — children shift by the same delta
//   resize  — children scale proportionally, GEOMETRY ONLY, never type size
//   turn    — children rotate about the GROUP's centre, changing both their
//             position and their own rotation
//
// WHAT A GROUP'S OWN FRAME AND ROTATION MEAN. Children hold all the geometry, in
// page space, and the renderer draws them there — it never composes a group
// transform on top. `Group.frame` is the axis-aligned box of the children's
// frames, recomputed after every transform, and `Group.rotation` records the
// accumulated turn so a panel can show it. Applying both would rotate every
// child twice.
//
// This is what makes ungrouping exact: it moves children into the parent array
// and changes no coordinates at all, so nothing can drift (LANE-1 §12 gate 5).
// The box ignores child rotation, so a turned child's painted extent can exceed
// it — a selection overlay that needs the visual extent computes its own.
//
// Scaling by 1/ratio to undo drifts by an ulp per round trip, and that gate
// allows none, so inverses restore recorded numbers instead — see
// `snapshotSubtree`.
// ---------------------------------------------------------------------------

import type { Group, Id, Item, Rect } from '@rilo/mb-schema';
import { isGroup } from '@rilo/mb-schema';
import type { FrameSnapshot } from '../types.js';

const HALF = 0.5;
const FULL_TURN_DEGREES = 360;
const HALF_TURN_DEGREES = 180;
const DEGREES_TO_RADIANS = Math.PI / HALF_TURN_DEGREES;

/** Keeps rotation inside the range invariant 14 documents. */
export function normaliseDegrees(degrees: number): number {
  return ((degrees % FULL_TURN_DEGREES) + FULL_TURN_DEGREES) % FULL_TURN_DEGREES;
}

export function centreOf(frame: Rect): { x: number; y: number } {
  return { x: frame.x + frame.w * HALF, y: frame.y + frame.h * HALF };
}

/**
 * Every descendant, each visited once.
 *
 * All coordinates are page-space, so one map applied to each descendant is
 * correct — a nested group's own frame is transformed like any other item, and
 * its children are transformed by the same map rather than by a composed one.
 */
function eachDescendant(group: Group, visit: (item: Item) => void): void {
  const descend = (items: Item[]): void => {
    for (const item of items) {
      visit(item);
      if (isGroup(item)) descend(item.children);
    }
  };
  descend(group.children);
}

/**
 * The item and every descendant's geometry, for an inverse to restore verbatim.
 *
 * Typed non-empty so callers can read the root snapshot without a guard —
 * `snapshots[0]` is always the item itself.
 */
export function snapshotSubtree(item: Item): [FrameSnapshot, ...FrameSnapshot[]] {
  const snapshots: [FrameSnapshot, ...FrameSnapshot[]] = [
    { itemId: item.id, frame: { ...item.frame }, rotation: item.rotation },
  ];
  if (isGroup(item)) {
    eachDescendant(item, (child) => {
      snapshots.push({
        itemId: child.id,
        frame: { ...child.frame },
        rotation: child.rotation,
      });
    });
  }
  return snapshots;
}

/**
 * Puts recorded geometry back.
 *
 * Returns false when the subtree no longer holds every recorded id, which means
 * the document changed under the history entry — the caller rejects rather than
 * applying a partial restore.
 */
export function restoreSubtree(item: Item, snapshots: readonly FrameSnapshot[]): boolean {
  const wanted = new Map<Id, FrameSnapshot>();
  for (const snapshot of snapshots) wanted.set(snapshot.itemId, snapshot);

  const apply = (target: Item): boolean => {
    const snapshot = wanted.get(target.id);
    if (snapshot === undefined) return false;
    target.frame = { ...snapshot.frame };
    target.rotation = snapshot.rotation;
    wanted.delete(target.id);
    return true;
  };

  if (!apply(item)) return false;

  let complete = true;
  if (isGroup(item)) {
    eachDescendant(item, (child) => {
      if (!apply(child)) complete = false;
    });
  }

  return complete && wanted.size === 0;
}

/** Shifts an item and, when it is a group, every descendant. */
export function translateSubtree(item: Item, dx: number, dy: number): void {
  item.frame = { ...item.frame, x: item.frame.x + dx, y: item.frame.y + dy };
  if (isGroup(item)) {
    eachDescendant(item, (child) => {
      child.frame = { ...child.frame, x: child.frame.x + dx, y: child.frame.y + dy };
    });
  }
}

/**
 * Maps a group's descendants from one bounding box to another.
 *
 * Geometry only. Font size is deliberately untouched (LANE-1 §7.3): scaling type
 * on a group resize produces sizes nobody chose, scattered through a document
 * that is supposed to be consistent.
 */
export function scaleSubtree(group: Group, before: Rect, after: Rect): void {
  const sx = after.w / before.w;
  const sy = after.h / before.h;

  eachDescendant(group, (child) => {
    child.frame = {
      x: after.x + (child.frame.x - before.x) * sx,
      y: after.y + (child.frame.y - before.y) * sy,
      w: child.frame.w * sx,
      h: child.frame.h * sy,
    };
  });
}

/**
 * The axis-aligned box around a set of frames, or null when there are none.
 *
 * Child rotation is not accounted for — see the note at the top of this file.
 */
export function boundingBoxOf(items: readonly Item[]): Rect | null {
  const first = items[0];
  if (first === undefined) return null;

  let minX = first.frame.x;
  let minY = first.frame.y;
  let maxX = first.frame.x + first.frame.w;
  let maxY = first.frame.y + first.frame.h;

  for (const item of items) {
    minX = Math.min(minX, item.frame.x);
    minY = Math.min(minY, item.frame.y);
    maxX = Math.max(maxX, item.frame.x + item.frame.w);
    maxY = Math.max(maxY, item.frame.y + item.frame.h);
  }

  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

/**
 * Brings a group's frame back into agreement with its children.
 *
 * Called after every transform, so the derived frame is never stale. A group
 * with no children keeps its frame — an empty group is not something the command
 * set can produce, and silently collapsing one to zero would break invariant 8.
 */
export function recomputeGroupFrame(group: Group): void {
  const box = boundingBoxOf(group.children);
  if (box !== null) group.frame = box;
}

/** Rotates a group's descendants about the group's centre, and turns each in place. */
export function rotateSubtree(group: Group, degrees: number): void {
  const centre = centreOf(group.frame);
  const radians = degrees * DEGREES_TO_RADIANS;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);

  eachDescendant(group, (child) => {
    const own = centreOf(child.frame);
    const dx = own.x - centre.x;
    const dy = own.y - centre.y;
    const x = centre.x + dx * cos - dy * sin;
    const y = centre.y + dx * sin + dy * cos;

    child.frame = {
      ...child.frame,
      x: x - child.frame.w * HALF,
      y: y - child.frame.h * HALF,
    };
    child.rotation = normaliseDegrees(child.rotation + degrees);
  });
}
