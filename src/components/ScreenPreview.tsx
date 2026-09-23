import { useRef, useState } from 'react';
import type { Region } from '../inference/types';

export interface CropRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Props {
  src: string;
  alt: string;
  regions?: Region[];
  showRegions?: boolean;
  /** Region ids to emphasize; others are dimmed. */
  active?: string[];
  scanning?: boolean;
  selecting?: boolean;
  onSelection?: (rect: CropRect | null) => void;
  width?: number;
  height?: number;
  eager?: boolean;
  /** Stagger region entrance (ms per region). */
  stagger?: number;
}

/**
 * The captured screen with detected regions drawn over it. Regions use
 * normalized coordinates, so they line up at any display size. While
 * `selecting`, dragging draws a crop rectangle in natural image pixels.
 */
export function ScreenPreview({ src, alt, regions = [], showRegions = true, active = [], scanning, selecting, onSelection, width, height, eager, stagger = 70 }: Props) {
  const imgRef = useRef<HTMLImageElement>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const [rect, setRect] = useState<CropRect | null>(null);

  const point = (e: React.PointerEvent) => {
    const box = imgRef.current!.getBoundingClientRect();
    return { x: Math.min(Math.max(e.clientX - box.left, 0), box.width), y: Math.min(Math.max(e.clientY - box.top, 0), box.height) };
  };
  const onDown = (e: React.PointerEvent) => {
    if (!selecting || !imgRef.current) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    start.current = point(e);
    setRect(null);
    onSelection?.(null);
  };
  const onMove = (e: React.PointerEvent) => {
    if (!start.current) return;
    const p = point(e);
    setRect({ x: Math.min(p.x, start.current.x), y: Math.min(p.y, start.current.y), w: Math.abs(p.x - start.current.x), h: Math.abs(p.y - start.current.y) });
  };
  const onUp = () => {
    if (!start.current) return;
    start.current = null;
    const img = imgRef.current;
    if (!img || !rect || rect.w < 12 || rect.h < 12) {
      setRect(null);
      onSelection?.(null);
      return;
    }
    const scale = img.naturalWidth / img.clientWidth;
    onSelection?.({ x: rect.x * scale, y: rect.y * scale, w: rect.w * scale, h: rect.h * scale });
  };

  const focus = active.length > 0;
  return (
    <div
      className={`screen${selecting ? ' selecting' : ''}`}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      style={selecting ? { cursor: 'crosshair', touchAction: 'none' } : undefined}
    >
      <img ref={imgRef} src={src} alt={alt} draggable={false} width={width} height={height} loading={eager ? 'eager' : 'lazy'} decoding="async" />
      {showRegions && regions.length > 0 && !selecting && (
        <ul className="regions" data-focus={focus} aria-label={`${regions.length} detected region${regions.length === 1 ? '' : 's'}`}>
          {regions.map((r, i) => {
            const place = r.box.h > 0.45 ? 'tag-inside' : r.box.y < 0.07 ? 'tag-below' : '';
            return (
              <li
                key={r.id}
                className={`region ${place}`}
                data-tone={r.tone}
                data-active={active.includes(r.id)}
                title={`${r.label}: ${r.detail} (${r.source})`}
                style={{
                  left: `${r.box.x * 100}%`,
                  top: `${r.box.y * 100}%`,
                  width: `${r.box.w * 100}%`,
                  height: `${r.box.h * 100}%`,
                  animationDelay: `${i * stagger}ms`,
                }}
              >
                <span className="region-tag">{r.label}</span>
                <span className="visually-hidden">: {r.detail}</span>
              </li>
            );
          })}
        </ul>
      )}
      {scanning && <div className="scanline" aria-hidden="true" />}
      {selecting && rect && <div className="crop-rect" style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }} />}
    </div>
  );
}

export async function cropImage(src: string, r: CropRect): Promise<Blob> {
  const img = new Image();
  img.src = src;
  await img.decode();
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(r.w);
  canvas.height = Math.round(r.h);
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, r.x, r.y, r.w, r.h, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('crop failed'))), 'image/png'));
}
