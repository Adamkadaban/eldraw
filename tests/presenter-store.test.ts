import { describe, expect, it, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import { presenter } from '../src/lib/store/presenter';

describe('presenter store', () => {
  beforeEach(() => presenter.reset());

  it('starts inactive', () => {
    expect(get(presenter).active).toBe(false);
    expect(presenter.isActive()).toBe(false);
  });

  it('enter activates and is idempotent', () => {
    presenter.enter();
    expect(presenter.isActive()).toBe(true);
    presenter.enter();
    expect(presenter.isActive()).toBe(true);
  });

  it('exit deactivates and is idempotent', () => {
    presenter.enter();
    presenter.exit();
    expect(presenter.isActive()).toBe(false);
    presenter.exit();
    expect(presenter.isActive()).toBe(false);
  });

  it('toggle flips state', () => {
    presenter.toggle();
    expect(presenter.isActive()).toBe(true);
    presenter.toggle();
    expect(presenter.isActive()).toBe(false);
  });

  it('reset returns to inactive', () => {
    presenter.enter();
    presenter.reset();
    expect(presenter.isActive()).toBe(false);
  });
});
