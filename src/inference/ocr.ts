import type { Worker } from 'tesseract.js';
import type { TextLine } from './types';

// Tesseract runs in a Web Worker using WebAssembly. Every file it needs is
// served from this site's /ocr folder, so no screen content or model request
// goes to a third-party CDN.
let workerPromise: Promise<Worker> | null = null;
let progressListener: ((p: number, status: string) => void) | null = null;

function getWorker(): Promise<Worker> {
  if (!workerPromise) {
    workerPromise = (async () => {
      const { createWorker } = await import('tesseract.js');
      return createWorker('eng', 1, {
        workerPath: '/ocr/worker.min.js',
        corePath: '/ocr/core',
        langPath: '/ocr/lang',
        gzip: true,
        logger: (m) => progressListener?.(m.progress ?? 0, m.status ?? ''),
      });
    })().catch((err) => {
      workerPromise = null;
      throw err;
    });
  }
  return workerPromise;
}

export interface OcrResult {
  text: string;
  /** Recognized lines with positions normalized to the image size. */
  lines: TextLine[];
}

export async function recognize(image: HTMLCanvasElement, onProgress: (p: number, status: string) => void): Promise<OcrResult> {
  progressListener = onProgress;
  try {
    const worker = await getWorker();
    const { data } = await worker.recognize(image, {}, { text: true, blocks: true });
    const W = image.width;
    const H = image.height;
    const lines: TextLine[] = [];
    for (const block of data.blocks ?? []) {
      for (const para of block.paragraphs) {
        for (const line of para.lines) {
          const text = line.text.trim();
          if (!text) continue;
          const { x0, y0, x1, y1 } = line.bbox;
          lines.push({ text, box: { x: x0 / W, y: y0 / H, w: (x1 - x0) / W, h: (y1 - y0) / H }, confidence: line.confidence });
        }
      }
    }
    return { text: data.text, lines };
  } finally {
    progressListener = null;
  }
}
