"""EasyOCR from Qualcomm AI Hub, run natively with ONNX Runtime.

Same models and pre/post-processing as the browser engine
(src/inference/aihub/easyocr.ts), following Qualcomm's reference app
(qai_hub_models/models/easyocr/app.py) and EasyOCR's craft_utils:

  detector    CRAFT, uint8 [1,3,608,800] RGB -> uint8 [1,304,400,2]
  recognizer  CRNN,  uint8 [1,1,64,800] grey -> uint8 [1,199,97]

Both are the w8a8 export from qai-hub-models v0.62.2 with weights stored as
INT8 (scripts/fold-aihub-weights.py). The host keeps the published static
shapes because the QNN execution provider compiles fixed shapes for the NPU.

Execution provider order: QNN (Hexagon NPU, onnxruntime-qnn on Windows on
ARM64), then CPU. The provider actually used is reported, never assumed.
"""

from __future__ import annotations

import math
import os
import time
from dataclasses import dataclass, field

import numpy as np
import onnxruntime as ort
from PIL import Image

DET_H, DET_W = 608, 800
MAP_H, MAP_W = 304, 400
DET_OUT_SCALE, DET_OUT_ZERO = 0.004232470877468586, 12
REC_H, REC_W = 64, 800
REC_OUT_SCALE, REC_OUT_ZERO = 0.2553488612174988, 127

# EasyOCR english_g2 character set; index 0 of the recognizer output is the CTC blank.
CHARS = "0123456789!\"#$%&'()*+,-./:;<=>?@[\\]^_`{|}~ €ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"
assert len(CHARS) == 96

TEXT_THRESHOLD, LINK_THRESHOLD, LOW_TEXT = 0.7, 0.4, 0.4
MIN_SIZE = 20
Y_CENTER_THS, HEIGHT_THS, WIDTH_THS, ADD_MARGIN = 0.5, 0.5, 0.5, 0.1

MODEL_NAME = 'EasyOCR (Qualcomm AI Hub, w8a8)'


def _sessions_options() -> ort.SessionOptions:
    so = ort.SessionOptions()
    so.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
    so.log_severity_level = 3
    return so


def _qnn_options(cache_dir: str, name: str) -> dict:
    return {
        'backend_path': 'QnnHtp.dll',
        'htp_performance_mode': 'burst',
        # Compiled context is cached so later launches skip graph compilation.
        'ep.context_enable': '1',
        'ep.context_file_path': os.path.join(cache_dir, f'{name}_ctx.onnx'),
    }


@dataclass
class Engine:
    detector: ort.InferenceSession
    recognizer: ort.InferenceSession
    provider: str
    available: list[str]
    load_ms: float
    notes: list[str] = field(default_factory=list)


def load(detector_path: str, recognizer_path: str, cache_dir: str, force_cpu: bool = False) -> Engine:
    available = ort.get_available_providers()
    notes: list[str] = []
    t0 = time.perf_counter()
    if 'QNNExecutionProvider' in available and not force_cpu:
        os.makedirs(cache_dir, exist_ok=True)
        try:
            det = _create(detector_path, [('QNNExecutionProvider', _qnn_options(cache_dir, 'detector')), 'CPUExecutionProvider'])
            rec = _create(recognizer_path, [('QNNExecutionProvider', _qnn_options(cache_dir, 'recognizer')), 'CPUExecutionProvider'])
            if 'QNNExecutionProvider' in det.get_providers():
                return Engine(det, rec, 'QNNExecutionProvider', available, (time.perf_counter() - t0) * 1000, notes)
            notes.append('QNN provider did not accept the model; using CPU.')
        except Exception as err:  # QNN runtime present but HTP unavailable, driver issue, etc.
            notes.append(f'QNN provider failed to load ({type(err).__name__}); using CPU.')
    det = _create(detector_path, ['CPUExecutionProvider'])
    rec = _create(recognizer_path, ['CPUExecutionProvider'])
    return Engine(det, rec, 'CPUExecutionProvider', available, (time.perf_counter() - t0) * 1000, notes)


def _create(path: str, providers: list) -> ort.InferenceSession:
    return ort.InferenceSession(path, _sessions_options(), providers=providers)


# ---------------------------------------------------------------- detector

def _letterbox(img: Image.Image) -> tuple[np.ndarray, float, int, int]:
    w, h = img.size
    scale = min(DET_H / h, DET_W / w)
    nw, nh = math.floor(w * scale), math.floor(h * scale)
    pad_x, pad_y = (DET_W - nw) // 2, (DET_H - nh) // 2
    canvas = Image.new('RGB', (DET_W, DET_H), (0, 0, 0))
    # Lanczos keeps small UI text sharp; bilinear downscaling loses about a fifth of the words.
    canvas.paste(img.resize((nw, nh), Image.LANCZOS), (pad_x, pad_y))
    return np.asarray(canvas, dtype=np.uint8).transpose(2, 0, 1)[None].copy(), scale, pad_x, pad_y


def _components(mask: np.ndarray) -> list[tuple[int, int, int, int, int, list[int]]]:
    """4-connected components: (x0, y0, x1, y1, size, flat indices)."""
    h, w = mask.shape
    flat = mask.ravel()
    seen = np.zeros(flat.shape, dtype=bool)
    out = []
    for start in np.flatnonzero(flat):
        if seen[start]:
            continue
        seen[start] = True
        stack = [int(start)]
        pix = []
        while stack:
            p = stack.pop()
            pix.append(p)
            y, x = divmod(p, w)
            for q, ok in ((p - 1, x > 0), (p + 1, x < w - 1), (p - w, y > 0), (p + w, y < h - 1)):
                if ok and flat[q] and not seen[q]:
                    seen[q] = True
                    stack.append(q)
        ys, xs = np.divmod(np.array(pix), w)
        out.append((int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max()), len(pix), pix))
    return out


def _detect(engine: Engine, img: Image.Image) -> tuple[list[list[float]], float]:
    x, scale, pad_x, pad_y = _letterbox(img)
    t0 = time.perf_counter()
    out = engine.detector.run(None, {'image': x})[0][0]
    ms = (time.perf_counter() - t0) * 1000
    maps = (out.astype(np.float32) - DET_OUT_ZERO) * DET_OUT_SCALE
    text, link = maps[..., 0], maps[..., 1]
    mask = (text > LOW_TEXT) | (link > LINK_THRESHOLD)
    text_flat = text.ravel()
    W, H = img.size
    boxes = []
    for x0, y0, x1, y1, size, pix in _components(mask):
        if size < 10 or text_flat[pix].max() < TEXT_THRESHOLD:
            continue
        bw, bh = x1 - x0 + 1, y1 - y0 + 1
        it = int(math.sqrt(size * min(bw, bh) / (bw * bh)) * 2)
        bx0 = max(0.0, ((x0 - it) * 2 - pad_x) / scale)
        bx1 = min(float(W), ((x1 + 1 + it) * 2 - pad_x) / scale)
        by0 = max(0.0, ((y0 - it) * 2 - pad_y) / scale)
        by1 = min(float(H), ((y1 + 1 + it) * 2 - pad_y) / scale)
        if bx1 > bx0 and by1 > by0:
            boxes.append([bx0, bx1, by0, by1])
    return boxes, ms


def _group_lines(boxes: list[list[float]]) -> list[list[list[float]]]:
    items = sorted(({'b': b, 'yc': (b[2] + b[3]) / 2, 'h': b[3] - b[2]} for b in boxes), key=lambda i: i['yc'])
    rows: list[list[dict]] = []
    for it in items:
        if rows:
            row = rows[-1]
            mean_h = sum(r['h'] for r in row) / len(row)
            mean_y = sum(r['yc'] for r in row) / len(row)
            if abs(mean_y - it['yc']) < Y_CENTER_THS * mean_h:
                row.append(it)
                continue
        rows.append([it])
    lines = []
    for row in rows:
        row.sort(key=lambda i: i['b'][0])
        cur: list[list[float]] = []
        for it in row:
            if cur:
                last = cur[-1]
                h_last = last[3] - last[2]
                same_h = abs(h_last - it['h']) < HEIGHT_THS * max(h_last, it['h'])
                close = it['b'][0] - last[1] < WIDTH_THS * max(h_last, it['h'])
                if same_h and close:
                    cur.append(it['b'])
                    continue
                lines.append(cur)
            cur = [it['b']]
        if cur:
            lines.append(cur)
    return lines


def _union(bs: list[list[float]], W: int, H: int) -> list[float]:
    x0, x1 = min(b[0] for b in bs), max(b[1] for b in bs)
    y0, y1 = min(b[2] for b in bs), max(b[3] for b in bs)
    m = ADD_MARGIN * (y1 - y0)
    return [max(0.0, x0 - m), min(float(W), x1 + m), max(0.0, y0 - m), min(float(H), y1 + m)]


def _split(words: list[list[float]], W: int, H: int) -> list[list[float]]:
    """Split lines wider than the recognizer's 800x64 strip at word gaps."""
    out, cur = [], []
    for w in words:
        trial = _union(cur + [w], W, H)
        if cur and (trial[1] - trial[0]) / (trial[3] - trial[2]) > REC_W / REC_H:
            out.append(_union(cur, W, H))
            cur = [w]
        else:
            cur.append(w)
    if cur:
        out.append(_union(cur, W, H))
    return out


# -------------------------------------------------------------- recognizer

def _strip(grey: np.ndarray, box: list[float]) -> np.ndarray:
    x0, x1, y0, y1 = math.floor(box[0]), math.ceil(box[1]), math.floor(box[2]), math.ceil(box[3])
    crop = grey[y0:y1, x0:x1]
    border = np.concatenate([crop[0], crop[-1], crop[:, 0], crop[:, -1]])
    bg = float(np.median(border))
    # The recognizer reads a leading blank gap as "~", so trim to the first ink.
    ink = np.flatnonzero((np.abs(crop.astype(np.int16) - bg) > 40).any(axis=0))
    if ink.size:
        crop = crop[:, max(0, int(ink[0]) - 2):]
    ch, cw = crop.shape
    s = min(REC_H / ch, REC_W / cw)
    rw, rh = max(1, math.floor(cw * s)), max(1, math.floor(ch * s))
    strip = np.full((REC_H, REC_W), crop[0, 0], dtype=np.uint8)
    top = (REC_H - rh) // 2
    strip[top:top + rh, :rw] = np.asarray(Image.fromarray(crop).resize((rw, rh), Image.LANCZOS))
    return strip[None, None]


def _decode(logits_q: np.ndarray) -> tuple[str, float]:
    logits = (logits_q.astype(np.float32) - REC_OUT_ZERO) * REC_OUT_SCALE
    p = np.exp(logits - logits.max(axis=1, keepdims=True))
    p /= p.sum(axis=1, keepdims=True)
    idx = p.argmax(axis=1)
    text, prev, probs = [], 0, []
    for t, k in enumerate(idx):
        if k:
            probs.append(float(p[t, k]))
            if k != prev:
                text.append(CHARS[k - 1])
        prev = k
    conf = float(np.prod(probs) ** (2.0 / math.sqrt(len(probs)))) if probs else 0.0
    s = ''.join(text).strip()
    if s and s[-1] in ']|':
        s = s[:-1].strip()
    return s, conf


def recognize(engine: Engine, img: Image.Image) -> dict:
    """Returns the bridge's HostAnalysis fields (text, lines, timings...)."""
    img = img.convert('RGB')
    W, H = img.size
    t_all = time.perf_counter()
    words, det_ms = _detect(engine, img)
    strips = [s for line in _group_lines(words) for s in _split(line, W, H)]
    grey = np.asarray(img.convert('L'), dtype=np.uint8)
    lines = []
    rec_ms = 0.0
    for b in strips:
        if b[1] - b[0] < 2 or b[3] - b[2] < 2:
            continue
        t0 = time.perf_counter()
        out = engine.recognizer.run(None, {'image': _strip(grey, b)})[0][0]
        rec_ms += (time.perf_counter() - t0) * 1000
        text, conf = _decode(out)
        if text:
            lines.append({'text': text, 'box': {'x': b[0] / W, 'y': b[2] / H, 'w': (b[1] - b[0]) / W, 'h': (b[3] - b[2]) / H}, 'confidence': round(conf * 100)})
    lines.sort(key=lambda l: (l['box']['y'], l['box']['x']))
    return {
        'text': _join_rows(lines),
        'lines': lines,
        'uiElements': [],
        'executionProvider': engine.provider,
        'ocrModel': MODEL_NAME,
        'timings': {
            'detector': round(det_ms, 1),
            'recognizer': round(rec_ms, 1),
            'recognizerRuns': len(strips),
            'ocr': round((time.perf_counter() - t_all) * 1000, 1),
        },
    }


def _join_rows(lines: list[dict]) -> str:
    rows: list[list[dict]] = []
    for l in lines:
        if rows and abs(rows[-1][0]['box']['y'] - l['box']['y']) < min(rows[-1][0]['box']['h'], l['box']['h']) / 2:
            rows[-1].append(l)
        else:
            rows.append([l])
    return '\n'.join('  '.join(l['text'] for l in sorted(r, key=lambda l: l['box']['x'])) for r in rows)
