import { describe, expect, it } from 'vitest';
import { snapAngle15 } from '$lib/tools/lineSnap';

const start = { x: 10, y: 20 };

function angleOf(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.atan2(b.y - a.y, b.x - a.x);
}

function lengthOf(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

describe('snapAngle15', () => {
  it('leaves 0° unchanged', () => {
    const end = { x: 110, y: 20 };
    const snapped = snapAngle15(start, end);
    expect(snapped.x).toBeCloseTo(110, 6);
    expect(snapped.y).toBeCloseTo(20, 6);
  });

  it('snaps near-horizontal drag to 0°', () => {
    const end = { x: 110, y: 22 };
    const snapped = snapAngle15(start, end);
    expect(angleOf(start, snapped)).toBeCloseTo(0, 6);
    expect(lengthOf(start, snapped)).toBeCloseTo(lengthOf(start, end), 6);
  });

  it('snaps a drag near 15° to exactly 15°', () => {
    const radius = 100;
    const target = (15 * Math.PI) / 180;
    const noisy = {
      x: start.x + radius * Math.cos(target + 0.02),
      y: start.y + radius * Math.sin(target + 0.02),
    };
    const snapped = snapAngle15(start, noisy);
    expect(angleOf(start, snapped)).toBeCloseTo(target, 6);
  });

  it('snaps a drag near 30° to exactly 30°', () => {
    const radius = 50;
    const target = (30 * Math.PI) / 180;
    const noisy = {
      x: start.x + radius * Math.cos(target - 0.05),
      y: start.y + radius * Math.sin(target - 0.05),
    };
    const snapped = snapAngle15(start, noisy);
    expect(angleOf(start, snapped)).toBeCloseTo(target, 6);
    expect(lengthOf(start, snapped)).toBeCloseTo(radius, 6);
  });

  it('snaps a drag near 45° to exactly 45°', () => {
    const end = { x: start.x + 70, y: start.y + 73 };
    const snapped = snapAngle15(start, end);
    expect(angleOf(start, snapped)).toBeCloseTo(Math.PI / 4, 6);
  });

  it('snaps a drag near 90° to exactly 90°', () => {
    const end = { x: start.x + 3, y: start.y + 80 };
    const snapped = snapAngle15(start, end);
    expect(angleOf(start, snapped)).toBeCloseTo(Math.PI / 2, 6);
    expect(snapped.x).toBeCloseTo(start.x, 6);
  });

  it('snaps a drag near 180° to exactly 180°', () => {
    const end = { x: start.x - 100, y: start.y + 1 };
    const snapped = snapAngle15(start, end);
    expect(Math.abs(angleOf(start, snapped))).toBeCloseTo(Math.PI, 6);
  });

  it('snaps negative angles (upward drag) to multiples of 15°', () => {
    const radius = 40;
    const target = (-75 * Math.PI) / 180;
    const noisy = {
      x: start.x + radius * Math.cos(target + 0.03),
      y: start.y + radius * Math.sin(target + 0.03),
    };
    const snapped = snapAngle15(start, noisy);
    expect(angleOf(start, snapped)).toBeCloseTo(target, 6);
  });

  it('always lands on a multiple of 15° for arbitrary input', () => {
    const step = Math.PI / 12;
    for (let deg = -180; deg <= 180; deg += 7) {
      const rad = (deg * Math.PI) / 180;
      const noisy = {
        x: start.x + 25 * Math.cos(rad),
        y: start.y + 25 * Math.sin(rad),
      };
      const snapped = snapAngle15(start, noisy);
      const snappedAngle = angleOf(start, snapped);
      const remainder = snappedAngle / step;
      expect(remainder).toBeCloseTo(Math.round(remainder), 6);
    }
  });

  it('preserves length after snapping', () => {
    const end = { x: start.x + 37, y: start.y + 11 };
    const snapped = snapAngle15(start, end);
    expect(lengthOf(start, snapped)).toBeCloseTo(lengthOf(start, end), 6);
  });

  it('returns the end point unchanged when start equals end', () => {
    const end = { x: start.x, y: start.y };
    const snapped = snapAngle15(start, end);
    expect(snapped).toEqual(end);
  });
});
