import { writable } from 'svelte/store';

export const slidesDialogOpen = writable(false);

export function openSlidesDialog(): void {
  slidesDialogOpen.set(true);
}

export function closeSlidesDialog(): void {
  slidesDialogOpen.set(false);
}
