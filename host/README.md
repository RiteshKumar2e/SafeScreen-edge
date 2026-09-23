# SafeScreen Windows host

A small local app that runs SafeScreen's Qualcomm AI Hub models natively. On a Snapdragon X Series PC (for example an HP OmniBook or EliteBook with Snapdragon X Elite or X Plus) the models run on the **Hexagon NPU** through ONNX Runtime's QNN execution provider. On any other Windows PC they run on the CPU.

It serves the SafeScreen web app on `127.0.0.1` and opens it in an Edge app window. The app detects the host and sends frames to it instead of running the models in the browser. Everything stays on the PC.

```
Edge app window (SafeScreen UI)
   │  same-origin HTTP, 127.0.0.1 only
   ▼
safescreen_host.py
   ├─ serves the built app (dist/)
   ├─ GET  /api/host     device, execution providers, models
   └─ POST /api/analyze  frame → EasyOCR detector + recognizer → text, line boxes, timings
            ONNX Runtime: QNNExecutionProvider (NPU) → CPUExecutionProvider
```

## Run from source

Build the web app once from the project root, then start the host:

```
npm install
npm run build
python -m pip install -r host/requirements.txt              # any Windows PC (CPU)
python host/safescreen_host.py
```

### On a Snapdragon PC (NPU)

1. Install **ARM64** Python 3.11 or 3.12 from python.org (the "Windows installer (ARM64)"). x64 Python under emulation cannot load the QNN libraries.
2. Install the QNN build of ONNX Runtime:
   ```
   python -m pip install -r host/requirements-snapdragon.txt
   ```
3. Start the host: `python host/safescreen_host.py`

The console prints the provider it loaded, for example `Models loaded on QNNExecutionProvider`. The first launch compiles the models for the NPU and caches the result in `%LOCALAPPDATA%\SafeScreen\qnn-cache`, so later launches start faster. If the NPU cannot take the model, the host says why and falls back to the CPU.

### Options

| Flag | Effect |
| --- | --- |
| `--cpu` | Skip the NPU even if QNN is available |
| `--no-open` | Serve only; open `http://127.0.0.1:8787/app/live-analysis` yourself |
| `--port 8787` | Port to listen on (127.0.0.1 only) |
| `--app <folder>` | Folder with the built web app (default: `app/` next to the host, or `../dist`) |

## Build a standalone .exe

```
powershell -ExecutionPolicy Bypass -File host\build-exe.ps1
```

This produces `host\dist\SafeScreenHost\SafeScreenHost.exe` with the app and models bundled. Build on the architecture you ship: run it on a Snapdragon PC with ARM64 Python for a native ARM64 build that includes the QNN libraries.

## How to check it is using the NPU

- The console line `Models loaded on QNNExecutionProvider`.
- In the app, **AI Runtime** shows `Snapdragon NPU · QNN` as the execution provider, the host version, and per-model times measured by the host.
- The Live Analysis pipeline shows `EasyOCR (Qualcomm AI Hub, w8a8) on QNNExecutionProvider`.
- Task Manager on Snapdragon PCs shows NPU utilization during analysis.

## Models

- `detector.int8.onnx`, the EasyOCR CRAFT detector. It is taken from `public/models/easyocr`, or `models/` in the packaged build.
- `host/models/recognizer.int8.onnx`, the EasyOCR CRNN recognizer.

Both come from Qualcomm AI Hub (qai-hub-models v0.62.2, w8a8, Apache-2.0), with the weights stored as INT8 by `scripts/fold-aihub-weights.py`. The host keeps the published fixed input shapes (608x800 and 64x800), because the QNN execution provider compiles fixed shapes for the NPU.

## Privacy and security

- **Network:** listens on `127.0.0.1` only, and nothing is sent anywhere else.
- **No storage:** frames are processed in memory and never written to disk or logged.
- **DNS rebinding:** requests whose `Host` header is not `127.0.0.1:<port>` or `localhost:<port>` are refused.
- **Cross-origin requests:** analyze requests from any other origin are refused (403).

## Tested

- **Windows 11 x64, AMD Ryzen 3 3200U, CPU provider:**
  - `npm run test:e2e` starts the host and checks the Host and Origin rules.
  - It runs an upload through the app and checks that no request leaves the PC.
  - One 1280x800 dashboard screenshot took about 11 s: detector 6.7 s, 28 recognizer runs 4.3 s.
- **Not tested:** the QNN path has not been run on Snapdragon hardware yet. Qualcomm AI Hub publishes 13.45 ms for this detector on the Snapdragon X Elite NPU.
