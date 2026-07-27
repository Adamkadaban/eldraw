import type { Command } from '$lib/command/commands';

export type SlideCommandAction =
  | 'new'
  | 'new-from-template'
  | 'edit'
  | 'duplicate'
  | 'change-layout'
  | 'delete';

export const SLIDE_COMMAND_EVENT = 'eldraw:slide-command';

export function dispatchSlideCommand(action: SlideCommandAction): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent<SlideCommandAction>(SLIDE_COMMAND_EVENT, { detail: action }),
  );
}

function command(id: string, title: string, action: SlideCommandAction): Command {
  return { id, title, run: () => dispatchSlideCommand(action) };
}

export const slideCommands: Command[] = [
  command('slide.new', 'New slide', 'new'),
  command('slide.newFromTemplate', 'New slide from template…', 'new-from-template'),
  command('slide.edit', 'Edit slide', 'edit'),
  command('slide.duplicate', 'Duplicate slide', 'duplicate'),
  command('slide.changeLayout', 'Change slide layout', 'change-layout'),
  command('slide.delete', 'Delete slide', 'delete'),
];
