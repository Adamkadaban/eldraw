import { describe, expect, it } from 'vitest';
import { getCommands } from '$lib/command/commands';

describe('annotated PDF export command', () => {
  it('is available from the command palette', () => {
    const command = getCommands().find((candidate) => candidate.id === 'file.exportAnnotatedPdf');
    expect(command?.title).toBe('Export annotated PDF…');
  });
});
