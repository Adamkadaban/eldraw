import { describe, expect, it, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import { commandPalette, openCommandPalette, closeCommandPalette } from '../src/lib/command/store';

describe('commandPalette store', () => {
  beforeEach(() => commandPalette.reset());

  it('starts closed', () => {
    expect(get(commandPalette).open).toBe(false);
    expect(commandPalette.isOpen()).toBe(false);
  });

  it('openCommandPalette sets open to true', () => {
    openCommandPalette();
    expect(commandPalette.isOpen()).toBe(true);
  });

  it('closeCommandPalette sets open to false', () => {
    openCommandPalette();
    closeCommandPalette();
    expect(commandPalette.isOpen()).toBe(false);
  });

  it('toggle flips state', () => {
    commandPalette.toggle();
    expect(commandPalette.isOpen()).toBe(true);
    commandPalette.toggle();
    expect(commandPalette.isOpen()).toBe(false);
  });

  it('open is idempotent', () => {
    openCommandPalette();
    openCommandPalette();
    expect(commandPalette.isOpen()).toBe(true);
  });
});
