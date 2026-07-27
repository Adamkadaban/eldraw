import { describe, expect, it } from 'vitest';
import { graphFnCacheKey, liveCacheKeys, pruneCache } from '$lib/graph/compileCache';

function graph(id: string, fnIds: string[]) {
  return { id, functions: fnIds.map((fid) => ({ id: fid })) };
}

describe('graphFnCacheKey', () => {
  it('is stable for the same pair', () => {
    expect(graphFnCacheKey('g1', 'f1')).toBe(graphFnCacheKey('g1', 'f1'));
  });

  it('cannot collide across a boundary-ambiguous split', () => {
    // A naive `${a}-${b}` key would make these two pairs identical.
    expect(graphFnCacheKey('a', 'b-c')).not.toBe(graphFnCacheKey('a-b', 'c'));
  });
});

describe('liveCacheKeys', () => {
  it('covers every function of every graph', () => {
    const live = liveCacheKeys([graph('g1', ['f1', 'f2']), graph('g2', ['f3'])]);
    expect(live.size).toBe(3);
    expect(live.has(graphFnCacheKey('g1', 'f2'))).toBe(true);
    expect(live.has(graphFnCacheKey('g2', 'f3'))).toBe(true);
  });

  it('is empty for no graphs', () => {
    expect(liveCacheKeys([]).size).toBe(0);
  });
});

describe('pruneCache', () => {
  it('drops entries for deleted functions and keeps live ones', () => {
    const cache = new Map<string, unknown>([
      [graphFnCacheKey('g1', 'f1'), 'keep'],
      [graphFnCacheKey('g1', 'f2'), 'drop'],
      [graphFnCacheKey('gone', 'f9'), 'drop'],
    ]);
    const removed = pruneCache(cache, liveCacheKeys([graph('g1', ['f1'])]));
    expect(removed).toBe(2);
    expect([...cache.keys()]).toEqual([graphFnCacheKey('g1', 'f1')]);
  });

  it('empties the cache when every graph is deleted', () => {
    const cache = new Map<string, unknown>([
      [graphFnCacheKey('g1', 'f1'), 1],
      [graphFnCacheKey('g2', 'f2'), 2],
    ]);
    expect(pruneCache(cache, liveCacheKeys([]))).toBe(2);
    expect(cache.size).toBe(0);
  });

  it('does not grow across repeated churn', () => {
    const cache = new Map<string, unknown>();
    for (let i = 0; i < 500; i += 1) {
      const graphs = [graph(`g${i}`, ['f1'])];
      cache.set(graphFnCacheKey(`g${i}`, 'f1'), i);
      pruneCache(cache, liveCacheKeys(graphs));
    }
    expect(cache.size).toBe(1);
  });

  it('is a no-op when everything is live', () => {
    const cache = new Map<string, unknown>([[graphFnCacheKey('g1', 'f1'), 1]]);
    expect(pruneCache(cache, liveCacheKeys([graph('g1', ['f1'])]))).toBe(0);
    expect(cache.size).toBe(1);
  });
});
