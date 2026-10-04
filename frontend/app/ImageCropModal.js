'use client';
import { useState, useEffect, useRef, useCallback } from 'react';

// Free (0) lets the viewport be dragged to any shape; the rest lock the box to
// a preset. Locking lets the corner handle drive width and derive height.
const RATIOS = [
  { label: 'Free', value: 0 },
  { label: '1:1', value: 1 },
  { label: '4:3', value: 4 / 3 },
  { label: '3:4', value: 3 / 4 },
  { label: '16:9', value: 16 / 9 },
  { label: '9:16', value: 9 / 16 },
];
const SIZES = [512, 1024, 2048];
const MIN_BOX = 140;
const MAX_BOX = 520;
const ACCEPTED = /^image\/(jpeg|png|webp)$/;

/**
 * Reusable crop dialog. Owns nothing about the app: it takes an opened file and
 * hands back a new cropped File, so every existing upload path keeps working by
 * receiving a File exactly as it did before.
 *
 * Open it through `useImageCropper()` rather than rendering it directly — the
 * hook also returns the JSX, which keeps call sites to one line.
 */
export default function ImageCropModal({ target, onCancel }) {
  const { file, onCrop } = target;
  const canvasRef = useRef(null);
  const imgRef = useRef(null);
  const dragRef = useRef(null);
  const resizeRef = useRef(null);

  const [src, setSrc] = useState('');
  const [nat, setNat] = useState({ w: 0, h: 0 });
  const [zoom, setZoom] = useState(1);
  const [off, setOff] = useState({ x: 0, y: 0 });
  const [rot, setRot] = useState(0);
  const [flipX, setFlipX] = useState(false);
  const [flipY, setFlipY] = useState(false);
  const [ratioIdx, setRatioIdx] = useState(1);
  const [size, setSize] = useState(1024);
  const [box, setBox] = useState({ w: 360, h: 360 });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const ratio = RATIOS[ratioIdx].value;

  // Locked ratios derive the short side from the long one, so the viewport on
  // screen and the exported canvas always share the same shape.
  const view = ratio
    ? (box.w >= box.h
        ? { w: box.w, h: box.w / ratio }
        : { w: box.h * ratio, h: box.h })
    : { w: box.w, h: box.h };

  // Longest edge of the export equals the chosen size; the rest follows the
  // framing the user set, which keeps a free crop free.
  const k = size / Math.max(view.w, view.h);
  const outW = Math.max(1, Math.round(view.w * k));
  const outH = Math.max(1, Math.round(view.h * k));

  // Load the picked file once per open.
  useEffect(() => {
    if (!file) return;
    if (!ACCEPTED.test(file.type)) { setErr('Use a JPG, PNG or WebP image.'); return; }
    if (file.size > 15 * 1024 * 1024) { setErr('Image too large (max 15 MB).'); return; }
    setErr(''); setBusy(true);
    setZoom(1); setOff({ x: 0, y: 0 }); setRot(0); setFlipX(false); setFlipY(false);
    const url = URL.createObjectURL(file);
    setSrc(url);
    const img = new Image();
    img.onload = () => { imgRef.current = img; setNat({ w: img.naturalWidth, h: img.naturalHeight }); setBusy(false); };
    img.onerror = () => { setErr('Could not read that image.'); setBusy(false); };
    img.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // The drawn footprint after rotation — a 90° turn swaps the axes.
  const foot = rot % 180 === 0 ? { w: nat.w, h: nat.h } : { w: nat.h, h: nat.w };

  // Panning happens in screen pixels, so convert to output pixels via the box.
  const scaleAt = (z) => Math.max(outW / (foot.w || 1), outH / (foot.h || 1)) * z;

  // `off` is stored in output pixels but measured from the viewport, so resizing
  // the box rescales the existing pan rather than snapping it.
  const clampOff = useCallback((z, o, vw, vh) => {
    const s = Math.max(outW / (foot.w || 1), outH / (foot.h || 1)) * z;
    const lx = Math.max(0, (foot.w * s - outW) / 2);
    const ly = Math.max(0, (foot.h * s - outH) / 2);
    const k = Math.max(outW / (vw || outW), outH / (vh || outH));
    return { x: Math.max(-lx, Math.min(lx, o.x * k)), y: Math.max(-ly, Math.min(ly, o.y * k)) };
  }, [foot.w, foot.h, outW, outH]);

  // Redraw whenever the transform or the output box changes.
  useEffect(() => {
    const cv = canvasRef.current, img = imgRef.current;
    if (!cv || !img || !nat.w) return;
    cv.width = outW; cv.height = outH;
    const ctx = cv.getContext('2d');
    ctx.clearRect(0, 0, outW, outH);
    const s = scaleAt(zoom);
    ctx.save();
    ctx.translate(outW / 2 + off.x, outH / 2 + off.y);
    ctx.rotate((rot * Math.PI) / 180);
    ctx.scale(flipX ? -1 : 1, flipY ? -1 : 1);
    ctx.scale(s, s);
    ctx.drawImage(img, -nat.w / 2, -nat.h / 2, nat.w, nat.h);
    ctx.restore();
  }, [nat, zoom, off, rot, flipX, flipY, outW, outH, scaleAt]);

  const onPointerDown = (e) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { x: e.clientX, y: e.clientY, ox: off.x, oy: off.y };
  };
  const onPointerMove = (e) => {
    if (!dragRef.current) return;
    const d = dragRef.current;
    setOff(clampOff(zoom, { x: d.ox + (e.clientX - d.x), y: d.oy + (e.clientY - d.y) }, view.w, view.h));
  };
  const onPointerUp = () => { dragRef.current = null; };

  // Corner handle: locked ratios drive width and derive height, free mode moves
  // width and height independently.
  const onResizeDown = (e) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    resizeRef.current = { x: e.clientX, y: e.clientY, w: box.w, h: box.h };
  };
  const onResizeMove = (e) => {
    if (!resizeRef.current) return;
    const r = resizeRef.current;
    const w = Math.max(MIN_BOX, Math.min(MAX_BOX, r.w + (e.clientX - r.x)));
    const h = ratio
      ? Math.max(MIN_BOX, Math.min(MAX_BOX, w / ratio))
      : Math.max(MIN_BOX, Math.min(MAX_BOX, r.h + (e.clientY - r.y)));
    setBox({ w, h });
  };
  const onResizeUp = () => { resizeRef.current = null; };

  // Wheel zoom needs a non-passive native listener to stop the page scrolling.
  useEffect(() => {
    const el = canvasRef.current?.parentElement;
    if (!el) return;
    const onWheel = (e) => {
      e.preventDefault();
      setZoom(z => {
        const next = Math.max(1, Math.min(8, z * (e.deltaY < 0 ? 1.08 : 1 / 1.08)));
        // Re-clamp with the current viewport or a zoom-in can push the image out of frame.
        setOff(o => clampOff(next, o, view.w, view.h));
        return next;
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [src, view.w, view.h, clampOff]);

  // Changing the shape can leave the image uncovered, so pull the pan back in.
  useEffect(() => { setOff(o => clampOff(zoom, o, view.w, view.h)); }, [view.w, view.h, ratioIdx]);

  // Fit the viewport inside the stage on open and whenever the ratio changes.
  useEffect(() => {
    setBox(b => {
      if (!ratio) return b;
      const w = Math.min(MAX_BOX, Math.max(MIN_BOX, Math.min(b.w, b.h * ratio)));
      return { w, h: w / ratio };
    });
  }, [ratioIdx]);

  const finish = (blob, mime) => {
    const base = (file.name || 'image').replace(/\.[^.]+$/, '') || 'image';
    const ext = mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg';
    onCrop(new File([blob], `${base}-cropped.${ext}`, { type: mime }), url);
  };

  const emit = () => {
    const cv = canvasRef.current;
    if (!cv) return;
    setBusy(true);
    const mime = file.type === 'image/png' ? 'image/png' : file.type === 'image/webp' ? 'image/webp' : 'image/jpeg';
    cv.toBlob(blob => {
      if (!blob) { setErr('Crop failed — try a smaller output size.'); setBusy(false); return; }
      finish(blob, mime);
    }, mime, 0.92);
  };

  const useOriginal = () => onCrop(file, URL.createObjectURL(file));

  return (
    <div className="ndg-crop-overlay" role="dialog" aria-modal="true" aria-label="Crop picture">
      <div className="ndg-crop-card">
        <div className="ndg-crop-head">
          <div>
            <h2 className="ndg-crop-title">Crop picture</h2>
            <p className="ndg-crop-sub">Drag to reposition, scroll or use the slider to zoom.</p>
          </div>
          <button className="ndg-icon-btn" onClick={onCancel} aria-label="Close crop">&times;</button>
        </div>

        <div className="ndg-crop-stage">
          <div
            className="ndg-crop-viewport"
            style={{ width: view.w, height: view.h }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            {busy && !src && <span className="ndg-crop-busy">Loading…</span>}
            <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block', borderRadius: ratio ? '2px' : 0 }} />
            {ratio === 0 && (
              <span
                className="ndg-crop-handle"
                onPointerDown={onResizeDown}
                onPointerMove={onResizeMove}
                onPointerUp={onResizeUp}
                onPointerCancel={onResizeUp}
                role="separator"
                aria-label="Resize crop area"
              />
            )}
          </div>
        </div>

        <div className="ndg-crop-controls">
          <div className="ndg-crop-row">
            <label className="ndg-crop-check">
              <input type="checkbox" checked={ratio !== 0}
                onChange={e => {
                  const next = e.target.checked ? (ratio === 0 ? 1 : ratio) : 0;
                  const i = RATIOS.findIndex(r => r.value === next);
                  setRatioIdx(i < 0 ? 1 : i);
                }} />
              Lock aspect ratio
            </label>
            <select className="ndg-crop-select" value={ratioIdx} disabled={ratio === 0}
              onChange={e => setRatioIdx(Number(e.target.value))}>
              {RATIOS.map((r, i) => <option key={r.label} value={i}>{r.label}</option>)}
            </select>
            <select className="ndg-crop-select" value={size} onChange={e => setSize(Number(e.target.value))}>
              {SIZES.map(s => <option key={s} value={s}>{s} px</option>)}
            </select>
          </div>

          <div className="ndg-crop-row">
            <span className="ndg-crop-lbl">Zoom</span>
            <input type="range" min="1" max="8" step="0.01" value={zoom} className="ndg-crop-range"
              onChange={e => { const z = Number(e.target.value); setZoom(z); setOff(o => clampOff(z, o, view.w, view.h)); }} />
            <button className="ndg-crop-mini" aria-label="Zoom out"
              onClick={() => setZoom(z => Math.max(1, z - 0.25))}>&minus;</button>
            <button className="ndg-crop-mini" aria-label="Zoom in"
              onClick={() => setZoom(z => Math.min(8, z + 0.25))}>+</button>
          </div>

          <div className="ndg-crop-row">
            <button className="ndg-crop-mini" onClick={() => { setRot(r => (r + 270) % 360); }} aria-label="Rotate left">&#8630;</button>
            <button className="ndg-crop-mini" onClick={() => { setRot(r => (r + 90) % 360); }} aria-label="Rotate right">&#8631;</button>
            <button className="ndg-crop-mini" onClick={() => setFlipX(v => !v)} aria-pressed={flipX}>Flip H</button>
            <button className="ndg-crop-mini" onClick={() => setFlipY(v => !v)} aria-pressed={flipY}>Flip V</button>
            <button className="ndg-crop-mini" onClick={() => { setZoom(1); setOff({ x: 0, y: 0 }); setRot(0); setFlipX(false); setFlipY(false); }}>Reset</button>
          </div>
        </div>

        {err && <div className="ndg-crop-err">{err}</div>}

        <div className="ndg-crop-foot">
          <button className="ndg-ov-ghost-btn" onClick={useOriginal}>Use original</button>
          <button className="ndg-ov-ghost-btn" onClick={onCancel}>Cancel</button>
          <button className="ndg-ov-primary-btn" onClick={emit} disabled={busy || !!err || !nat.w}>{busy ? 'Working…' : 'Apply crop'}</button>
        </div>
      </div>
    </div>
  );
}

/** Small controller so a call site is: `openCrop(file, uploadFn)`. */
export function useImageCropper() {
  const [target, setTarget] = useState(null);
  const openCrop = useCallback((file, onCrop) => {
    if (!file) return;
    setTarget({ file, onCrop });
  }, []);
  const close = useCallback(() => setTarget(null), []);
  const node = target ? <ImageCropModal target={target} onCancel={close} /> : null;
  return { openCrop, closeCrop: close, cropperNode: node, cropping: !!target };
}
