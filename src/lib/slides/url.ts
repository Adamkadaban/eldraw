export type SlidesVariant = 'document' | 'published';

export interface SlidesId {
  id: string;
  variant: SlidesVariant;
}

export type ParseResult = { ok: true; value: SlidesId } | { ok: false; error: string };

const ID_RE = /^[A-Za-z0-9_-]+$/;

export function parseSlidesUrl(input: string): ParseResult {
  const trimmed = input.trim();
  if (!trimmed) return { ok: false, error: 'Enter a Google Slides URL.' };

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return { ok: false, error: 'That is not a valid URL.' };
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return { ok: false, error: 'URL must start with http(s)://' };
  }
  if (url.hostname.toLowerCase() !== 'docs.google.com') {
    return { ok: false, error: 'URL must be on docs.google.com.' };
  }

  const segments = url.pathname.split('/').filter(Boolean);
  if (segments.length < 3 || segments[0] !== 'presentation' || segments[1] !== 'd') {
    return { ok: false, error: 'Not a Google Slides URL.' };
  }

  let id: string;
  let variant: SlidesVariant;
  if (segments[2] === 'e') {
    if (segments.length < 4) return { ok: false, error: 'Missing deck id in URL.' };
    id = segments[3];
    variant = 'published';
  } else {
    id = segments[2];
    variant = 'document';
  }

  if (!id) return { ok: false, error: 'Missing deck id in URL.' };
  if (!ID_RE.test(id)) {
    return { ok: false, error: 'Deck id has unexpected characters.' };
  }

  return { ok: true, value: { id, variant } };
}
