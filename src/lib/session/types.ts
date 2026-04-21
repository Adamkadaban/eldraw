import type { AnyObject, ObjectId, StrokeObject } from '$lib/types';

export type SessionEvent =
  | { kind: 'stroke'; t: number; page: number; stroke: StrokeObject }
  | { kind: 'objectAdd'; t: number; page: number; obj: AnyObject }
  | { kind: 'objectDel'; t: number; page: number; ids: ObjectId[] }
  | { kind: 'objectUpdate'; t: number; page: number; id: ObjectId; after: AnyObject }
  | { kind: 'pageChange'; t: number; page: number };

export interface SessionMeta {
  id: string;
  name: string;
  createdAt: number;
  durationMs: number;
  audioFile: string;
  audioMime: string;
}

export interface Session extends SessionMeta {
  events: SessionEvent[];
}

export interface SessionListEntry extends SessionMeta {
  hasAudio: boolean;
}

const SESSION_ID_RE = /^[A-Za-z0-9_-]+$/;

export function isValidSessionId(id: string): boolean {
  return id.length > 0 && id.length <= 128 && SESSION_ID_RE.test(id);
}

export function makeSessionId(): string {
  return crypto.randomUUID();
}

export function defaultSessionName(createdAt: number): string {
  const d = new Date(createdAt);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `Session ${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function formatDurationMs(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}
