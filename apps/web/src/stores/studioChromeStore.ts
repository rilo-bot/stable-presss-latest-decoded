// ---------------------------------------------------------------------------
// One flag: is a full-screen Studio open?
//
// When it is, the global Stablehand launcher hides — two floating assistants in
// opposite corners of the same screen is a worse experience than either alone,
// and the Studio that is open already has the better context.
//
// This was `editorAgentUiStore`, and it carried the v1 magazine builder's whole
// assistant: the open flag, the current page id, a one-shot pending prompt, a
// staging buffer of proposed edits and an undo stack. All of that belonged to the
// template builder's named-region edit model and went with it — every remaining
// consumer (Magazine Builder v2, the Article/Blog Studios, the profile onboarding
// guide, and the launcher itself) only ever read or set `suppressGlobal`.
//
// Renamed rather than trimmed in place, because a store called "editorAgentUi"
// with no editor agent behind it is a false trail for the next reader.
// ---------------------------------------------------------------------------

import { create } from 'zustand';

interface StudioChromeState {
  /** While true, the global site Stablehand launcher stays hidden. */
  suppressGlobal: boolean;
  setSuppressGlobal: (v: boolean) => void;
}

export const useStudioChrome = create<StudioChromeState>((set) => ({
  suppressGlobal: false,
  setSuppressGlobal: (v) => set({ suppressGlobal: v }),
}));
