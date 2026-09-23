import { AnalysisError } from './types';

export async function loadImage(url: string): Promise<HTMLImageElement> {
  const img = new Image();
  img.decoding = 'async';
  img.src = url;
  try {
    await img.decode();
  } catch (err) {
    throw new AnalysisError('This file could not be opened as an image. Try a PNG or JPEG screenshot.', err);
  }
  if (!img.naturalWidth || !img.naturalHeight) {
    throw new AnalysisError('The image appears to be empty.');
  }
  return img;
}

/**
 * Draws the capture onto a canvas in a form OCR handles well: small captures
 * are upscaled so text is legible, and dark-theme screens (terminals, dark
 * mode) are converted to dark text on a light background.
 */
export async function preprocess(url: string): Promise<{ canvas: HTMLCanvasElement; width: number; height: number; inverted: boolean }> {
  const img = await loadImage(url);
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  const scale = Math.min(Math.max(2000 / w, 1), 2, 2800 / w);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new AnalysisError('Your browser could not prepare the image for analysis.');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const px = data.data;
  let sum = 0;
  for (let i = 0; i < px.length; i += 4 * 16) sum += 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
  const mean = sum / (px.length / (4 * 16));
  const inverted = mean < 110;
  if (inverted) {
    for (let i = 0; i < px.length; i += 4) {
      const l = 255 - (0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2]);
      px[i] = px[i + 1] = px[i + 2] = l;
    }
    ctx.putImageData(data, 0, 0);
  }
  return { canvas, width: w, height: h, inverted };
}
