'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { resizeBox, reshape, SW, SH } from './cropMath.mjs';

// Free (0) lets every edge move on its own; the rest pin the box to a preset.
const RATIOS = [
  { label: 'Free', value: 0 },
  { label: '1:1', value: 1 },
  { label: '4:3', value: 4 / 3 },
  { label: '3:4', value: 3 / 4 },
  { label: '16:9', value: 16 / 9 },
  { label: '9:16', value: 9 / 16 },
];
const SIZES = [512, 1024, 2048];

// Source canvas density for the export. Above the stage's own device pixels on
// purpose, so a crop of a small region still has real pixels to export.
const RAW_SCALE = 3;

// The stage is a fixed logical size that gets scaled by CSS, so pointer maths
// only ever deals in these units.
const ACCEPTED = /^image\/(jpeg|png|webp)$/;

// Anchored on the opposite edge, like every other crop tool.
const HANDLES = [
  { id: 'nw', fx: 0, fy: 0, cur: 'nwse-resize' },
  { id: 'n', fx: 0.5, fy: 0, cur: 'ns-resize' },
  { id: 'ne', fx: 1, fy: 0, cur: 'nesw-resize' },
  { id: 'e', fx: 1, fy: 0.5, cur: 'ew-resize' },
  { id: 'se', fx: 1, fy: 1, cur: 'nwse-resize' },
  { id: 's', fx: 0.5, fy: 1, cur: 'ns-resize' },
  { id: 'sw', fx: 0, fy: 1, cur: 'nesw-resize' },
  { id: 'w', fx: 0, fy: 0.5, cur: 'ew-resize' },
];

const fitBox = (ratio) => {
  const w = SW * 0.8;
  const h = ratio ? w / ratio : SH * 0.8;
  return { x: (SW - w) / 2, y: (SH - Math.min(h, SH)) / 2, w, h: Math.min(h, SH) };
};

/**
 * Reusable crop dialog. Owns nothing about the app: it takes an opened file and
 * hands back a cropped File, so every existing upload path keeps working by
 * receiving a File exactly as it did before.
 *
 * Open it through `useImageCropper()` rather than rendering it directly — the
 * hook also returns the JSX, which keeps call sites to one line.
 */
export default function ImageCropModal({ target, onCancel }) {
  const { file, onCrop } = target;
  const stageRef = useRef(null);
  const cvRef = useRef(null);
  const rawRef = useRef(null);
  const imgRef = useRef(null);
  const panRef = useRef(null);
  const dragRef = useRef(null);

  const [nat, setNat] = useState({ w: 0, h: 0 });
  const [box, setBox] = useState(() => fitBox(1));
  const [zoom, setZoom] = useState(1);
  const [off, setOff] = useState({ x: 0, y: 0 });
  const [rot, setRot] = useState(0);
  const [flipX, setFlipX] = useState(false);
  const [flipY, setFlipY] = useState(false);
  const [ratioIdx, setRatioIdx] = useState(1);
  const [size, setSize] = useState(1024);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const ratio = RATIOS[ratioIdx].value;

  // Load the picked file once per open.
  useEffect(() => {
    if (!ACCEPTED.test(file.type)) { setErr('Use a JPG, PNG or WebP image.'); return; }
    if (file.size > 15 * 1024 * 1024) { setErr('Image too large (max 15 MB).'); return; }
    setErr('');
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { imgRef.current = img; setNat({ w: img.naturalWidth, h: img.naturalHeight }); setReady(true); };
    img.onerror = () => { URL.revokeObjectURL(url); setErr('Could not read that image.'); };
    img.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const foot = rot % 180 === 0 ? { w: nat.w, h: nat.h } : { w: nat.h, h: nat.w };
  const cover = Math.max(SW / (foot.w || 1), SH / (foot.h || 1)) * zoom;

  // The image is held at cover scale, so no pan can ever expose empty stage
  // inside the box.
  const clampOff = useCallback((z, o) => {
    const s = Math.max(SW / (foot.w || 1), SH / (foot.h || 1)) * z;
    const lx = Math.max(0, (foot.w * s - SW) / 2);
    const ly = Math.max(0, (foot.h * s - SH) / 2);
    return { x: Math.max(-lx, Math.min(lx, o.x)), y: Math.max(-ly, Math.min(ly, o.y)) };
  }, [foot.w, foot.h]);

  useEffect(() => {
    const cv = cvRef.current, img = imgRef.current;
    if (!cv || !img || !nat.w) return;
    const dpr = window.devicePixelRatio || 1;
    // The raw canvas holds no overlay or guides, so the crop never bakes them
    // in. It is painted at a fixed 2x stage scale rather than at dpr, so a
    // small crop box still exports real pixels instead of a blurry upscale.
    if (!rawRef.current) rawRef.current = document.createElement('canvas');
    const raw = rawRef.current;
    raw.width = SW * RAW_SCALE;
    raw.height = SH * RAW_SCALE;
    cv.width = SW * dpr;
    cv.height = SH * dpr;

    const paint = (ctx, scale) => {
      ctx.setTransform(scale, 0, 0, scale, 0, 0);
      ctx.clearRect(0, 0, SW, SH);
      ctx.save();
      ctx.translate(SW / 2 + off.x, SH / 2 + off.y);
      ctx.rotate((rot * Math.PI) / 180);
      ctx.scale(flipX ? -1 : 1, flipY ? -1 : 1);
      ctx.scale(cover, cover);
      ctx.drawImage(img, -nat.w / 2, -nat.h / 2, nat.w, nat.h);
      ctx.restore();
    };
    paint(raw.getContext('2d'), RAW_SCALE);

    const ctx = cv.getContext('2d');
    paint(ctx, dpr);

    // Dim everything outside the box via an even-odd fill.
    ctx.fillStyle = 'rgba(24, 10, 16, 0.55)';
    ctx.beginPath();
    ctx.rect(0, 0, SW, SH);
    ctx.rect(box.x, box.y, box.w, box.h);
    ctx.fill('evenodd');

    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 2;
    ctx.strokeRect(box.x, box.y, box.w, box.h);
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 1;
    for (let i = 1; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(box.x + (box.w * i) / 3, box.y);
      ctx.lineTo(box.x + (box.w * i) / 3, box.y + box.h);
      ctx.moveTo(box.x, box.y + (box.h * i) / 3);
      ctx.lineTo(box.x + box.w, box.y + (box.h * i) / 3);
      ctx.stroke();
    }
  }, [nat, zoom, off, rot, flipX, flipY, box, cover]);

  // Pointer position in stage units.
  const at = (e) => {
    const r = stageRef.current.getBoundingClientRect();
    return { x: (e.clientX - r.left) * (SW / r.width), y: (e.clientY - r.top) * (SH / r.height) };
  };

  const onPanDown = (e) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = at(e);
    panRef.current = { x: p.x, y: p.y, ox: off.x, oy: off.y };
  };
  const onPanMove = (e) => {
    if (!panRef.current) return;
    const p = at(e), d = panRef.current;
    setOff(clampOff(zoom, { x: d.ox + (p.x - d.x), y: d.oy + (p.y - d.y) }));
  };

  const onHandleDown = (e, id) => {
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { id, x: e.clientX, y: e.clientY, box };
  };
  const onHandleMove = (e) => {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.x, dy = e.clientY - d.y;
    const rx = SW / stageRef.current.getBoundingClientRect().width;
    const ry = SH / stageRef.current.getBoundingClientRect().height;
    setBox(resizeBox(d.box, d.id, dx * rx, dy * ry, ratio));
  };
  const endDrag = () => { dragRef.current = null; panRef.current = null; };

  // Wheel zoom needs a non-passive native listener to stop the page scrolling.
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    const onWheel = (e) => {
      e.preventDefault();
      setZoom(z => {
        const next = Math.max(1, Math.min(8, z * (e.deltaY < 0 ? 1.08 : 1 / 1.08)));
        setOff(o => clampOff(next, o));
        return next;
      });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [clampOff]);

  const reset = () => {
    setZoom(1); setOff({ x: 0, y: 0 }); setRot(0); setFlipX(false); setFlipY(false);
    setBox(fitBox(RATIOS[ratioIdx].value));
  };

  const emit = () => {
    const raw = rawRef.current;
    if (!raw) return;
    // `size` is a wish, not a command: upscaling past the source pixels only
    // makes a blurry file, so cap at 1:1 with the raw canvas.
    const k = Math.min(size / Math.max(box.w, box.h), RAW_SCALE);
    const outW = Math.max(1, Math.round(box.w * k));
    const outH = Math.max(1, Math.round(box.h * k));
    setBusy(true);
    const out = document.createElement('canvas');
    out.width = outW; out.height = outH;
    // Source rect is in raw's backing-store pixels; box is in stage units.
    out.getContext('2d').drawImage(
      raw,
      box.x * RAW_SCALE, box.y * RAW_SCALE, box.w * RAW_SCALE, box.h * RAW_SCALE,
      0, 0, outW, outH,
    );
    const mime = file.type === 'image/png' ? 'image/png' : file.type === 'image/webp' ? 'image/webp' : 'image/jpeg';
    out.toBlob(blob => {
      setBusy(false);
      if (!blob) { setErr('Crop failed — try a smaller output size.'); return; }
      const base = (file.name || 'image').replace(/\.[^.]+$/, '') || 'image';
      const ext = mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg';
      onCrop(new File([blob], `${base}-cropped.${ext}`, { type: mime }));
      onCancel();
    }, mime, 0.92);
  };

  return (
    <div className="ndg-crop-overlay" role="dialog" aria-modal="true" aria-label="Crop picture">
      <div className="ndg-crop-card">
        <div className="ndg-crop-head">
          <div>
            <h2 className="ndg-crop-title">Crop picture</h2>
            <p className="ndg-crop-sub">Drag the image to reposition, or drag any edge or corner to resize.</p>
          </div>
          <button className="ndg-icon-btn" onClick={onCancel} aria-label="Close crop">&times;</button>
        </div>

        <div className="ndg-crop-stage">
          <div
            ref={stageRef}
            className="ndg-crop-canvas"
            onPointerDown={onPanDown}
            onPointerMove={onPanMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
          >
            <canvas ref={cvRef} className="ndg-crop-img" />
            {ready && HANDLES.map(h => (
              <span
                key={h.id}
                className="ndg-crop-grip"
                role="separator"
                aria-label={`Resize ${h.id} edge`}
                style={{
                  left: `${(box.x + box.w * h.fx) / SW * 100}%`,
                  top: `${(box.y + box.h * h.fy) / SH * 100}%`,
                  width: h.fx === 0.5 ? 48 : 16,
                  height: h.fy === 0.5 ? 48 : 16,
                  transform: 'translate(-50%, -50%)',
                  cursor: h.cur,
                }}
                onPointerDown={e => onHandleDown(e, h.id)}
                onPointerMove={onHandleMove}
                onPointerUp={endDrag}
                onPointerCancel={endDrag}
              />
            ))}
          </div>
        </div>

        <div className="ndg-crop-controls">
          <div className="ndg-crop-row">
            <label className="ndg-crop-check">
              <input type="checkbox" checked={ratio !== 0}
                onChange={e => setRatioIdx(e.target.checked ? 1 : 0)} />
              Lock aspect ratio
            </label>
            <select className="ndg-crop-select" value={ratioIdx} disabled={ratio === 0}
              onChange={e => {
                const i = Number(e.target.value);
                setRatioIdx(i);
                // Reshape about the box centre so the framing the user set holds.
                setBox(b => reshape(b, RATIOS[i].value));
              }}>
              {RATIOS.map((r, i) => <option key={r.label} value={i}>{r.label}</option>)}
            </select>
            <select className="ndg-crop-select" value={size} onChange={e => setSize(Number(e.target.value))}>
              {SIZES.map(s => <option key={s} value={s}>{s} px</option>)}
            </select>
          </div>

          <div className="ndg-crop-row">
            <span className="ndg-crop-lbl">Zoom</span>
            <input type="range" min="1" max="8" step="0.01" value={zoom} className="ndg-crop-range"
              onChange={e => { const z = Number(e.target.value); setZoom(z); setOff(o => clampOff(z, o)); }} />
            <button className="ndg-crop-mini" aria-label="Zoom out"
              onClick={() => { setZoom(z => { const n = Math.max(1, z - 0.25); setOff(o => clampOff(n, o)); return n; }); }}>&minus;</button>
            <button className="ndg-crop-mini" aria-label="Zoom in"
              onClick={() => { setZoom(z => { const n = Math.min(8, z + 0.25); setOff(o => clampOff(n, o)); return n; }); }}>+</button>
          </div>

          <div className="ndg-crop-row">
            <button className="ndg-crop-mini" onClick={() => setRot(r => (r + 270) % 360)} aria-label="Rotate left">&#8630;</button>
            <button className="ndg-crop-mini" onClick={() => setRot(r => (r + 90) % 360)} aria-label="Rotate right">&#8631;</button>
            <button className="ndg-crop-mini" onClick={() => setFlipX(v => !v)} aria-pressed={flipX}>Flip H</button>
            <button className="ndg-crop-mini" onClick={() => setFlipY(v => !v)} aria-pressed={flipY}>Flip V</button>
            <button className="ndg-crop-mini" onClick={reset}>Reset</button>
          </div>
        </div>

        {err && <div className="ndg-crop-err">{err}</div>}

        <div className="ndg-crop-foot">
          <button className="ndg-ov-ghost-btn" onClick={() => onCrop(file)}>Use original</button>
          <button className="ndg-ov-ghost-btn" onClick={onCancel}>Cancel</button>
          <button className="ndg-ov-primary-btn" onClick={emit} disabled={busy || !!err || !nat.w}>
            {busy ? 'Working…' : 'Apply crop'}
          </button>
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