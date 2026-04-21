import { describe, it, expect } from 'vitest';
import { getCommands } from '$lib/command/commands';

describe('command palette commands', () => {
  it('registers Reload PDF', () => {
    const ids = getCommands().map((c) => c.id);
    expect(ids).toContain('pdf.reload');
    const titles = getCommands().map((c) => c.title);
    expect(titles).toContain('Reload PDF');
  });

  it('registers reload behavior commands', () => {
    const ids = getCommands().map((c) => c.id);
    expect(ids).toContain('pdf.reload-behavior.keep');
    expect(ids).toContain('pdf.reload-behavior.discard');
  });
});
