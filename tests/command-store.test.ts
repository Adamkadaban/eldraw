import { describe, expect, it, beforeEach } from 'vitest';
import { get } from 'svelte/store';
import { commandPalette, openCommandPalette, closeCommandPalette } from '../src/lib/command/store';
import { getCommands } from '../src/lib/command/commands';
import { DEFAULT_BINDINGS } from '../src/lib/app/shortcutRegistry';

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

describe('F5 binding (#122)', () => {
  it('palette command "view.toggle-zen" advertises F5 as its shortcut', () => {
    const cmd = getCommands().find((c) => c.id === 'view.toggle-zen');
    expect(cmd?.shortcut).toBe('F5');
  });

  it('palette command "presenter.toggle" no longer advertises F5', () => {
    const cmd = getCommands().find((c) => c.id === 'presenter.toggle');
    expect(cmd).toBeDefined();
    expect(cmd?.shortcut).toBeUndefined();
  });

  it('keyboard registry default for view.toggleZen is F5', () => {
    expect(DEFAULT_BINDINGS['view.toggleZen']).toBe('F5');
  });

  it('keyboard registry keeps Shift+Z as a secondary zen binding', () => {
    expect(DEFAULT_BINDINGS['view.toggleZenAlt']).toBe('Shift+Z');
  });

  it('keyboard registry no longer exposes a view.togglePresenter binding', () => {
    expect((DEFAULT_BINDINGS as Record<string, string>)['view.togglePresenter']).toBeUndefined();
  });
});
