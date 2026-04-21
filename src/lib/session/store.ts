import { writable, type Readable } from 'svelte/store';
import type { SessionListEntry } from './types';

export interface ReplayState {
  active: boolean;
  session: SessionListEntry | null;
  audioUrl: string | null;
}

const initial: ReplayState = { active: false, session: null, audioUrl: null };

function createReplayStore() {
  const s = writable<ReplayState>(initial);
  return {
    subscribe: s.subscribe,
    enter(session: SessionListEntry, audioUrl: string) {
      s.set({ active: true, session, audioUrl });
    },
    exit() {
      s.update((prev) => {
        if (prev.audioUrl) URL.revokeObjectURL(prev.audioUrl);
        return initial;
      });
    },
  };
}

export const replay = createReplayStore();
export const replayState: Readable<ReplayState> = { subscribe: replay.subscribe };
