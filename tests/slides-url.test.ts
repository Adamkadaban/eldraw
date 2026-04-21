import { describe, expect, it } from 'vitest';
import { parseSlidesUrl } from '$lib/slides/url';

function ok(url: string) {
  const r = parseSlidesUrl(url);
  if (!r.ok) throw new Error(`expected ok, got: ${r.error}`);
  return r.value;
}

function err(url: string): string {
  const r = parseSlidesUrl(url);
  if (r.ok) throw new Error('expected error');
  return r.error;
}

describe('parseSlidesUrl', () => {
  it('parses edit URLs', () => {
    const id = ok('https://docs.google.com/presentation/d/ABC_def-123/edit');
    expect(id).toEqual({ id: 'ABC_def-123', variant: 'document' });
  });

  it('parses edit URLs with query and fragment', () => {
    const id = ok(
      'https://docs.google.com/presentation/d/ABC_def-123/edit?usp=sharing#slide=id.p1',
    );
    expect(id.id).toBe('ABC_def-123');
    expect(id.variant).toBe('document');
  });

  it('parses present URLs', () => {
    const id = ok('https://docs.google.com/presentation/d/DECKID/present?slide=id.p3');
    expect(id.id).toBe('DECKID');
    expect(id.variant).toBe('document');
  });

  it('parses pub URLs', () => {
    const id = ok('https://docs.google.com/presentation/d/DECKID/pub?start=false&delayms=3000');
    expect(id).toEqual({ id: 'DECKID', variant: 'document' });
  });

  it('parses published /d/e/ URLs', () => {
    const id = ok('https://docs.google.com/presentation/d/e/2PACX-1vPUBKEY/pub?start=false');
    expect(id).toEqual({ id: '2PACX-1vPUBKEY', variant: 'published' });
  });

  it('parses embed URLs', () => {
    const id = ok('https://docs.google.com/presentation/d/DECKID/embed');
    expect(id.id).toBe('DECKID');
  });

  it('parses bare /d/{ID} URL', () => {
    const id = ok('https://docs.google.com/presentation/d/DECKID');
    expect(id.id).toBe('DECKID');
  });

  it('strips trailing fragment', () => {
    const id = ok('https://docs.google.com/presentation/d/DECKID/edit#slide=id.p1');
    expect(id.id).toBe('DECKID');
  });

  it('accepts mixed-case host', () => {
    const id = ok('https://Docs.Google.COM/presentation/d/DECKID/edit');
    expect(id.id).toBe('DECKID');
  });

  it('rejects empty input', () => {
    expect(err('')).toMatch(/enter/i);
    expect(err('   ')).toMatch(/enter/i);
  });

  it('rejects malformed URL', () => {
    expect(err('not a url')).toMatch(/valid url/i);
  });

  it('rejects non-google host', () => {
    expect(err('https://evil.example.com/presentation/d/DECKID/edit')).toMatch(/docs\.google\.com/);
  });

  it('rejects non-slides google URL', () => {
    expect(err('https://docs.google.com/document/d/DECKID/edit')).toMatch(/slides/i);
  });

  it('rejects missing deck id', () => {
    expect(err('https://docs.google.com/presentation/d/')).toMatch(/slides/i);
    expect(err('https://docs.google.com/presentation/d/e/')).toMatch(/id/i);
  });

  it('rejects deck id with invalid chars', () => {
    expect(err('https://docs.google.com/presentation/d/bad.id/edit')).toMatch(/id/i);
  });
});
