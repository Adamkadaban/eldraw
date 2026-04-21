import { describe, it, expect } from 'vitest';
import {
  defaultSessionName,
  formatDurationMs,
  isValidSessionId,
  type Session,
} from '$lib/session/types';

function sampleSession(): Session {
  return {
    id: 'abc-123_XYZ',
    name: 'Lecture 1',
    createdAt: 1_700_000_000_000,
    durationMs: 42_000,
    audioFile: 'audio.webm',
    audioMime: 'audio/webm;codecs=opus',
    events: [
      { kind: 'pageChange', t: 0, page: 0 },
      { kind: 'pageChange', t: 5_000, page: 2 },
      {
        kind: 'objectDel',
        t: 6_000,
        page: 2,
        ids: ['o1', 'o2'],
      },
    ],
  };
}

describe('session types', () => {
  it('JSON round-trip preserves a session', () => {
    const s = sampleSession();
    const copy = JSON.parse(JSON.stringify(s)) as Session;
    expect(copy).toEqual(s);
  });

  it('isValidSessionId accepts safe ids and rejects traversal', () => {
    expect(isValidSessionId('abcDEF-123_45')).toBe(true);
    expect(isValidSessionId('')).toBe(false);
    expect(isValidSessionId('..')).toBe(false);
    expect(isValidSessionId('a/b')).toBe(false);
    expect(isValidSessionId('a\\b')).toBe(false);
    expect(isValidSessionId('a b')).toBe(false);
    expect(isValidSessionId('a'.repeat(129))).toBe(false);
  });

  it('formatDurationMs formats mm:ss with zero padding', () => {
    expect(formatDurationMs(0)).toBe('00:00');
    expect(formatDurationMs(5_000)).toBe('00:05');
    expect(formatDurationMs(65_000)).toBe('01:05');
    expect(formatDurationMs(599_500)).toBe('10:00');
  });

  it('defaultSessionName includes date and time', () => {
    const name = defaultSessionName(Date.UTC(2024, 0, 2, 12, 34));
    expect(name.startsWith('Session ')).toBe(true);
    expect(name).toMatch(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
  });
});
