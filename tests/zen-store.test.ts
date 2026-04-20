import { describe, expect, it, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import { zen } from '../src/lib/store/zen';

describe('zen store', () => {
  beforeEach(() => zen.reset());

  it('starts inactive', () => {
    expect(get(zen).active).toBe(false);
    expect(zen.isActive()).toBe(false);
  });

  it('enter activates and is idempotent', () => {
    zen.enter();
    expect(zen.isActive()).toBe(true);
    zen.enter();
    expect(zen.isActive()).toBe(true);
  });

  it('exit deactivates and is idempotent', () => {
    zen.enter();
    zen.exit();
    expect(zen.isActive()).toBe(false);
    zen.exit();
    expect(zen.isActive()).toBe(false);
  });

  it('toggle flips state', () => {
    zen.toggle();
    expect(zen.isActive()).toBe(true);
    zen.toggle();
    expect(zen.isActive()).toBe(false);
  });

  it('reset returns to inactive', () => {
    zen.enter();
    zen.reset();
    expect(zen.isActive()).toBe(false);
  });
});
