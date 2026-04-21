import { describe, expect, it, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import { presenter } from '../src/lib/store/presenter';

describe('presenter store', () => {
  beforeEach(() => presenter.reset());

  it('starts inactive with no window', () => {
    expect(get(presenter).active).toBe(false);
    expect(get(presenter).windowOpen).toBe(false);
    expect(presenter.isActive()).toBe(false);
    expect(presenter.isWindowOpen()).toBe(false);
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

  it('toggle flips in-window state', () => {
    presenter.toggle();
    expect(presenter.isActive()).toBe(true);
    presenter.toggle();
    expect(presenter.isActive()).toBe(false);
  });

  it('setWindowOpen tracks window state and is idempotent', () => {
    presenter.setWindowOpen(true);
    expect(presenter.isWindowOpen()).toBe(true);
    presenter.setWindowOpen(true);
    expect(presenter.isWindowOpen()).toBe(true);
    presenter.setWindowOpen(false);
    expect(presenter.isWindowOpen()).toBe(false);
  });

  it('reset returns to inactive with no window', () => {
    presenter.enter();
    presenter.setWindowOpen(true);
    presenter.reset();
    expect(presenter.isActive()).toBe(false);
    expect(presenter.isWindowOpen()).toBe(false);
  });
});
