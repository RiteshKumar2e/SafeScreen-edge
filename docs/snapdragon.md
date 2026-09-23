# Snapdragon integration

SafeScreen Edge targets Snapdragon X Series HP PCs (for example HP OmniBook and EliteBook models with Snapdragon X Elite or X Plus). Screen understanding is a continuous, private workload, which is what the Hexagon NPU is for.

## Status

| Piece | Status |
| --- | --- |
| EasyOCR from Qualcomm AI Hub (w8a8 ONNX, CRAFT detector + CRNN recognizer) | Built, default text model in the web app |
| ONNX Runtime Web (multithreaded WebAssembly; WebGPU opt-in) | Built |
| Browser fallback: Tesseract LSTM, INT8 weights | Built, selectable in Settings |
| Runtime probe (arch, WASM SIMD, WebGPU vendor, WebNN NPU context, host) | Built |
| Provider interface + native provider + host bridge (HTTP and WebView2 transports) | Built |
| SafeScreen Windows host (`host/`: local server, ONNX Runtime, QNN EP with CPU fallback) | Built. Tested on x64 with the CPU provider; not yet run on Snapdragon hardware |
| SafeScreen's own NPU latency / power figures | Not measured. Qualcomm's published figure is shown, labeled as Qualcomm's |

The app never reports NPU use unless the host says so.

## The Qualcomm AI Hub model

| | |
| --- | --- |
| Model | EasyOCR, `qai-hub-models` v0.62.2, ONNX `w8a8` export ([Hugging Face](https://huggingface.co/qualcomm/EasyOCR), [AI Hub](https://aihub.qualcomm.com/models/easyocr)) |
| License | Apache-2.0 (see `public/models/easyocr/NOTICE.txt`) |
| Detector | CRAFT, uint8 `[1,3,608,800]` RGB, outputs region and affinity maps `[1,304,400,2]` |
| Recognizer | CRNN (VGG + BiLSTM + CTC), uint8 `[1,1,64,W]` grey, 96 characters + blank |
| Published NPU latency | Detector 13.45 ms on Snapdragon X Elite, ONNX Runtime (QNN), w8a8. Qualcomm's figure, not measured by SafeScreen |

Changes made for the web build (`scripts/fold-aihub-weights.py`):

1. **INT8 weight storage.** The export keeps float32 weights and quantizes them in the graph. The script precomputes those constant `QuantizeLinear` nodes and stores INT8, so the files shrink from 98 MB to 25 MB. Outputs are bit-identical to the published export (checked on random inputs).
2. **Dynamic recognizer width.** Two Reshape constants pinned the sequence to 199 steps (800 px). They become `-1`, so short lines run on narrow strips. Output at 800 px is bit-identical.

Pre- and post-processing follow Qualcomm's reference app (`qai_hub_models/models/easyocr/app.py`) and EasyOCR's `craft_utils`: letterbox to 608x800, threshold region and link maps, connected components, line grouping, height-64 crops, greedy CTC decoding. One addition: blank space before the first glyph is trimmed, because the recognizer reads a leading gap as "~".

The Windows host loads the **static-shape** models (608x800 detector, 64x800 recognizer) with the QNN execution provider, since the NPU needs fixed shapes; the web copy uses the dynamic recognizer.

### Measured in this build

Headless Chrome on an AMD Ryzen 3 3200U (2 cores, 4 threads, no NPU), under other CPU load, multithreaded WebAssembly:

| Step | Time |
| --- | --- |
| Detector, one 608x800 frame | 8.5 to 28 s (varied with background load) |
| Recognizer, one line | 0.2 to 0.7 s |
| Dashboard screenshot, end to end (52 regions, 26 lines) | 25 to 51 s |

This is a low-end x86 laptop CPU; the numbers show the model runs everywhere, not how fast it is on target hardware. The AI Runtime page shows the times measured on whatever device runs the app.

## Target execution

| Stage | Target |
| --- | --- |
| Capture | Windows.Graphics.Capture in the host |
| Preprocess | GPU resize and normalize |
| OCR | The Qualcomm AI Hub EasyOCR export (w8a8), ONNX Runtime with `QNNExecutionProvider` (HTP backend) |
| UI detection | Quantized UI element detector, same runtime |
| Reasoning | Existing agents on CPU; optional small on-device language model for phrasing |

Windows ML is an alternative path to the NPU where the OS-managed runtime is preferred.

## Windows host

`host/safescreen_host.py` (see `host/README.md`) serves the built app on `127.0.0.1`, opens it in an Edge app window, and runs the models with ONNX Runtime. Provider order: `QNNExecutionProvider` (HTP backend, `htp_performance_mode=burst`, compiled context cached in `%LOCALAPPDATA%\SafeScreen\qnn-cache`), then `CPUExecutionProvider`. If QNN is installed but cannot take the model, the host reports why and uses the CPU. Frames stay in memory; the server refuses foreign `Host` headers (DNS rebinding) and cross-origin requests.

On a Snapdragon PC it needs ARM64 Python and `onnxruntime-qnn`; `host/build-exe.ps1` packages it as `SafeScreenHost.exe`.

## Host bridge protocol

Two transports carry the same messages. **HTTP** (used by `host/`): the host marks the page with `<meta name="safescreen-host" content="http">`, and the app calls `GET /api/host` (describe) and `POST /api/analyze` with the image bytes. Requests are same-origin, so `connect-src 'self'` still holds. **WebView2**: the page talks to a shell with `window.chrome.webview.postMessage`; every request carries an `id` and the reply has the same `id`.

Describe:

```json
{ "id": "…", "type": "safescreen.describe" }
→ { "id": "…", "ok": true, "result": {
     "version": "0.1.0",
     "executionProviders": ["QNNExecutionProvider", "CPUExecutionProvider"],
     "activeProvider": "QNNExecutionProvider",
     "device": { "processor": "…", "npu": "…", "os": "…" },
     "models": [{ "name": "…", "precision": "INT8", "provider": "QNN" }] } }
```

Analyze:

```json
{ "id": "…", "type": "safescreen.analyze", "image": "<base64>", "mime": "image/png" }
→ { "id": "…", "ok": true, "result": {
     "text": "…",
     "lines": [{ "text": "…", "box": { "x": 0.1, "y": 0.2, "w": 0.3, "h": 0.02 } }],
     "uiElements": [{ "kind": "password-field", "label": "…", "source": "…", "box": { … } }],
     "executionProvider": "QNNExecutionProvider",
     "ocrModel": "…",
     "timings": { "ocr": 12.3 } } }
```

Boxes are normalized to the frame size. The web app then runs the same agents and region labeling as in the browser, and shows the provider and host-measured timings on the AI Runtime page.

## Profiling plan

1. OCR: done (Qualcomm AI Hub EasyOCR). Next, a UI element detector from AI Hub, compiled for Snapdragon X Series.
2. Profile on a Snapdragon HP PC: latency per stage, NPU vs CPU fallback ops, memory.
3. Measure sustained monitoring (one frame every 10 s) for power draw on battery.
4. Publish the measured numbers in the AI Runtime page from the host, never estimated.
