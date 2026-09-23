# Snapdragon integration

## Status

| Piece | Status |
| --- | --- |
| Browser pipeline (Tesseract WASM, INT8 LSTM weights, local agents) | Built |
| Runtime probe (arch, WASM SIMD, WebGPU vendor, WebNN NPU context, host) | Built |
| Provider interface + native provider + WebView2 bridge | Built |
| SafeScreen Windows host (WebView2 + ONNX Runtime QNN EP) | Planned |
| NPU models compiled and profiled with Qualcomm AI Hub | Planned |
| NPU latency / power figures | Not measured. Shown as "Benchmark available after hardware profiling" |

The app never reports NPU use unless the host says so.

## Target execution

| Stage | Target |
| --- | --- |
| Capture | Windows.Graphics.Capture in the host |
| Preprocess | GPU resize and normalize |
| OCR | Text detection + recognition models, INT8, ONNX Runtime with `QNNExecutionProvider` (HTP backend) |
| UI detection | Quantized UI element detector, same runtime |
| Reasoning | Existing agents on CPU; optional small on-device language model for phrasing |

Windows ML is an alternative path to the NPU where the OS-managed runtime is preferred.

## Host bridge protocol

The page runs inside WebView2 and talks to the host with `window.chrome.webview.postMessage`. Every request carries an `id`; the host replies with the same `id`.

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

1. Export OCR and UI models to ONNX; quantize and compile for Snapdragon X Series with Qualcomm AI Hub.
2. Profile on device: latency per stage, NPU vs CPU fallback ops, memory.
3. Measure sustained monitoring (one frame every 10 s) for power draw on battery.
4. Publish the measured numbers in the AI Runtime page from the host, never estimated.
