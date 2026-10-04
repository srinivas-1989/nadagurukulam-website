// Run: node cropMath.test.mjs
import assert from 'node:assert/strict';
import { resizeBox, reshape, SW, SH, MIN_BOX } from './app/cropMath.mjs';

const IDS = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
const RATIOS = [1, 4 / 3, 3 / 4, 16 / 9, 9 / 16];
const DRAGS = [[0, 0], [25, -18], [-60, 40], [120, 90], [-200, -150], [400, 300], [-1e5, -1e5]];

// Free mode: a handle moves only its own edges; the opposite edge stays pinned.
{
  const box = { x: 100, y: 80, w: 200, h: 120 };
  const r = resizeBox(box, 'e', 40, 25, 0);
  assert.deepEqual(r, { x: 100, y: 80, w: 240, h: 120 });
  assert.deepEqual(resizeBox(box, 's', 30, 15, 0), { x: 100, y: 80, w: 200, h: 135 });
  assert.deepEqual(resizeBox(box, 'nw', -10, -20, 0), { x: 90, y: 60, w: 210, h: 140 });
}

// Locked mode: the ratio holds at any drag, and the box never leaves the stage.
for (const ratio of RATIOS) {
  for (const id of IDS) {
    for (const [dx, dy] of DRAGS) {
      const r = resizeBox({ x: 100, y: 80, w: 240, h: 160 }, id, dx, dy, ratio);
      const where = `${id} @ ${ratio} dragged (${dx}, ${dy})`;
      assert.ok(r.w >= MIN_BOX - 1e-9 && r.h >= MIN_BOX - 1e-9, `${where}: below minimum, got ${r.w}x${r.h}`);
      assert.ok(r.x >= -1e-9 && r.y >= -1e-9, `${where}: negative origin ${r.x},${r.y}`);
      assert.ok(r.x + r.w <= SW + 1e-9, `${where}: overflows right edge`);
      assert.ok(r.y + r.h <= SH + 1e-9, `${where}: overflows bottom edge`);
      assert.ok(Math.abs(r.w / r.h - ratio) < 1e-4, `${where}: ratio drifted to ${r.w / r.h}`);
    }
  }
}

// Switching presets keeps the box centred, in bounds, and on-ratio.
for (const ratio of RATIOS) {
  for (const box of [{ x: 0, y: 0, w: 40, h: 40 }, { x: 500, y: 350, w: 60, h: 60 }, { x: 100, y: 80, w: 240, h: 160 }]) {
    const r = reshape(box, ratio);
    const where = `reshape to ${ratio} from ${box.w}x${box.h}`;
    assert.ok(Math.abs(r.w / r.h - ratio) < 1e-4, `${where}: ratio drifted to ${r.w / r.h}`);
    assert.ok(r.w >= MIN_BOX - 1e-9 && r.h >= MIN_BOX - 1e-9, `${where}: below minimum, got ${r.w}x${r.h}`);
    assert.ok(r.x >= -1e-9 && r.y >= -1e-9 && r.x + r.w <= SW + 1e-9 && r.y + r.h <= SH + 1e-9, `${where}: left the stage`);
  }
}

console.log('PASS: crop resize math holds');