// Pure crop-box geometry, kept out of the modal so it can be checked without a
// browser. The stage is a fixed logical size scaled by CSS, so pointer maths
// only ever deals in these units.
export const SW = 560;
export const SH = 400;
export const MIN_BOX = 60;

/**
 * Resize `box` by dragging handle `id` (nw/n/ne/e/se/s/sw/w) by (mx, my) stage
 * units. Edges the handle does not own stay put; a locked ratio fills in
 * whichever axis the pointer is not driving.
 */
export function resizeBox(box, id, mx, my, ratio) {
  let x0 = box.x, y0 = box.y, x1 = box.x + box.w, y1 = box.y + box.h;
  if (id.includes('w')) x0 = box.x + mx;
  if (id.includes('e')) x1 = box.x + box.w + mx;
  if (id.includes('n')) y0 = box.y + my;
  if (id.includes('s')) y1 = box.y + box.h + my;

  const driveX = id === 'w' || id === 'e';
  const driveY = id === 'n' || id === 's';
  if (ratio) {
    if (!driveX && !driveY) {
      // Corner: follow whichever axis the pointer travelled furthest on.
      const w0 = Math.abs(x1 - x0), h0 = Math.abs(y1 - y0);
      if (w0 / ratio > h0) { y1 = y0 + w0 / ratio; } else { x1 = x0 + h0 * ratio; }
    } else if (driveX) {
      y0 = y1 - Math.abs(x1 - x0) / ratio;
    } else {
      x0 = x1 - Math.abs(y1 - y0) * ratio;
    }
  }

  let w = Math.abs(x1 - x0), h = Math.abs(y1 - y0);
  if (ratio) {
    // Raising the floor on width alone would break the proportion, so lift the
    // shorter side instead and let the locked width follow it.
    h = Math.max(h, MIN_BOX / Math.min(1, ratio));
    w = h * ratio;
  } else {
    if (w < MIN_BOX) { if (id.includes('w')) x0 = x1 - MIN_BOX; else x1 = x0 + MIN_BOX; w = MIN_BOX; }
    if (h < MIN_BOX) { if (id.includes('n')) y0 = y1 - MIN_BOX; else y1 = y0 + MIN_BOX; h = MIN_BOX; }
  }
  if (id.includes('w')) x0 = x1 - w; else x1 = x0 + w;
  if (id.includes('n')) y0 = y1 - h; else y1 = y0 + h;

  // A locked ratio can resolve to a box larger than the stage, so shrink to fit
  // before clamping the origin — otherwise the box hangs off the edges.
  const fit = Math.min(1, SW / w, SH / h);
  if (fit < 1) {
    w *= fit; h *= fit;
    if (id.includes('w')) x0 = x1 - w; else x1 = x0 + w;
    if (id.includes('n')) y0 = y1 - h; else y1 = y0 + h;
  }

  x0 = Math.max(0, Math.min(SW - w, x0));
  y0 = Math.max(0, Math.min(SH - h, y0));
  return { x: x0, y: y0, w, h };
}

/** Reshape a box to `ratio`, keeping it centred and still inside the stage. */
export function reshape(box, ratio) {
  if (!ratio) return box;
  const maxW = Math.min(SW, SH * ratio);
  const minW = Math.max(MIN_BOX, MIN_BOX * ratio);
  const w = Math.max(minW, Math.min(maxW, Math.max(box.w, box.h * ratio)));
  const h = w / ratio;
  return {
    x: Math.max(0, Math.min(SW - w, box.x + (box.w - w) / 2)),
    y: Math.max(0, Math.min(SH - h, box.y + (box.h - h) / 2)),
    w, h,
  };
}