import { invoke } from '@tauri-apps/api/core';
import type { Session, SessionListEntry } from './types';

export async function listSessions(pdfPath: string): Promise<SessionListEntry[]> {
  return invoke('list_sessions', { pdfPath });
}

export async function readSession(pdfPath: string, sessionId: string): Promise<Session> {
  return invoke('read_session', { pdfPath, sessionId });
}

export async function writeSession(
  pdfPath: string,
  sessionId: string,
  session: Session,
): Promise<void> {
  return invoke('write_session', { pdfPath, sessionId, session });
}

export async function writeAudioChunk(
  pdfPath: string,
  sessionId: string,
  bytes: Uint8Array,
  reset: boolean,
): Promise<void> {
  return invoke('write_audio_chunk', {
    pdfPath,
    sessionId,
    bytes: Array.from(bytes),
    reset,
  });
}

export async function readSessionAudio(pdfPath: string, sessionId: string): Promise<Uint8Array> {
  const arr = await invoke<number[]>('read_session_audio', { pdfPath, sessionId });
  return new Uint8Array(arr);
}

export async function deleteSession(pdfPath: string, sessionId: string): Promise<void> {
  return invoke('delete_session', { pdfPath, sessionId });
}
