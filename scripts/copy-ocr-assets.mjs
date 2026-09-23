// Copies the Tesseract worker, WASM core and English language data into
// public/ocr, and the ONNX Runtime Web WebAssembly/WebGPU runtime into
// public/ort, so OCR runs without fetching anything from a third-party CDN.
// The Qualcomm AI Hub models themselves live in public/models (committed).
import { copyFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const nm = join(root, 'node_modules');
const pub = join(root, 'public');

const files = [
  ['tesseract.js/dist/worker.min.js', 'ocr/worker.min.js'],
  ['tesseract.js-core/tesseract-core-lstm.wasm.js', 'ocr/core/tesseract-core-lstm.wasm.js'],
  ['tesseract.js-core/tesseract-core-simd-lstm.wasm.js', 'ocr/core/tesseract-core-simd-lstm.wasm.js'],
  ['tesseract.js-core/tesseract-core-relaxedsimd-lstm.wasm.js', 'ocr/core/tesseract-core-relaxedsimd-lstm.wasm.js'],
  ['@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz', 'ocr/lang/eng.traineddata.gz'],
  ['onnxruntime-web/dist/ort-wasm-simd-threaded.jsep.mjs', 'ort/ort-wasm-simd-threaded.jsep.mjs'],
  ['onnxruntime-web/dist/ort-wasm-simd-threaded.jsep.wasm', 'ort/ort-wasm-simd-threaded.jsep.wasm'],
];

for (const [from, to] of files) {
  const src = join(nm, from);
  const dest = join(pub, to);
  if (!existsSync(src)) {
    console.error(`[ocr-assets] missing ${from} (run npm install)`);
    process.exit(1);
  }
  mkdirSync(dirname(dest), { recursive: true });
  copyFileSync(src, dest);
}
console.log(`[ocr-assets] copied ${files.length} files to public/ocr and public/ort`);
