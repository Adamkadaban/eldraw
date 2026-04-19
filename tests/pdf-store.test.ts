import { describe, it, expect, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import { pdf, setLoading, setMeta, setError, reset } from '$lib/store/pdf';

describe('pdf store', () => {
  beforeEach(() => reset());

  it('starts empty', () => {
    const s = get(pdf);
    expect(s.meta).toBeNull();
    expect(s.error).toBeNull();
    expect(s.loading).toBe(false);
  });

  it('tracks loading and meta transitions', () => {
    setLoading(true);
    expect(get(pdf).loading).toBe(true);

    setMeta({ path: '/tmp/a.pdf', hash: 'h', pageCount: 2, pages: [] });
    const s = get(pdf);
    expect(s.loading).toBe(false);
    expect(s.meta?.pageCount).toBe(2);
    expect(s.error).toBeNull();
  });

  it('captures errors', () => {
    setError('boom');
    expect(get(pdf).error).toBe('boom');
    expect(get(pdf).loading).toBe(false);
  });
});
