import { writable } from 'svelte/store';
import type { ProtractorState } from '$lib/geometry/protractor';
import type { RulerState } from '$lib/geometry/ruler';

export interface OverlaysState {
  protractor: ProtractorState;
  ruler: RulerState;
}

function initial(): OverlaysState {
  return {
    protractor: {
      center: { x: 200, y: 200 },
      radius: 140,
      rotation: 0,
      shape: 'semi',
    },
    ruler: {
      from: { x: 60, y: 60 },
      rotation: 0,
      length: 360,
      unit: 'cm',
    },
  };
}

function createOverlaysStore() {
  const store = writable<OverlaysState>(initial());
  const { subscribe, update, set } = store;

  return {
    subscribe,
    set,
    reset: () => set(initial()),

    moveProtractor(center: ProtractorState['center']) {
      update((s) => ({ ...s, protractor: { ...s.protractor, center } }));
    },
    rotateProtractor(rotation: number) {
      update((s) => ({ ...s, protractor: { ...s.protractor, rotation } }));
    },
    setProtractorShape(shape: ProtractorState['shape']) {
      update((s) => ({ ...s, protractor: { ...s.protractor, shape } }));
    },
    setProtractorRadius(radius: number) {
      const clamped = Math.max(40, Math.min(600, radius));
      update((s) => ({ ...s, protractor: { ...s.protractor, radius: clamped } }));
    },

    moveRuler(from: RulerState['from']) {
      update((s) => ({ ...s, ruler: { ...s.ruler, from } }));
    },
    rotateRuler(rotation: number) {
      update((s) => ({ ...s, ruler: { ...s.ruler, rotation } }));
    },
    setRulerLength(length: number) {
      const clamped = Math.max(60, Math.min(2400, length));
      update((s) => ({ ...s, ruler: { ...s.ruler, length: clamped } }));
    },
    setRulerUnit(unit: RulerState['unit']) {
      update((s) => ({ ...s, ruler: { ...s.ruler, unit } }));
    },
  };
}

export const overlays = createOverlaysStore();
