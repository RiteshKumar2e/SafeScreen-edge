# SafeScreen Edge

Private AI that understands what's on your screen. SafeScreen Edge reads a screen on the device, finds errors, risky sign-in pages and messages that need attention, explains them with the evidence it used, and suggests a next step. It is designed for Snapdragon-powered HP PCs, where the model stages run on the NPU.

The text model is **EasyOCR from Qualcomm AI Hub** (w8a8 ONNX export), run in the browser with ONNX Runtime Web. Nothing is uploaded: the production build only allows the page to connect to its own origin.

## For judges: 3-minute tour

1. Open `/app/live-analysis`. Pick a **demo scenario** (instant, labeled "Demo Simulation") to see labeled regions and the explanation.
2. Choose **Upload or paste** and give it any screenshot. This runs the Qualcomm AI Hub model on your device. The pipeline shows "Qualcomm AI Hub EasyOCR on CPU · WebAssembly" and the measured detector time.
3. Open **AI Runtime** to see measured model times on your device, what the device supports, and Qualcomm's published NPU figure (labeled as Qualcomm's).
4. Ask the **Screen Assistant** "What should I click?" about the dashboard scenario.
5. Press **Present** in the top bar for the guided 72-second walkthrough.

The first real analysis downloads the models (25 MB) and ONNX Runtime from the site. On a 4-thread laptop CPU one screenshot took 25 to 50 s; faster CPUs take less. **Settings → AI** switches to Tesseract (faster on older CPUs) or turns on WebGPU.

## Run locally

```
npm install
npm run dev                  # http://localhost:5173
npm run build && npm run preview
```

`predev` / `prebuild` copy the Tesseract files into `public/ocr` and ONNX Runtime Web into `public/ort`, so nothing is fetched from a CDN. The Qualcomm AI Hub models are committed in `public/models/easyocr`.

## What to try

- `/` marketing site, `/technology`, `/privacy`, `/use-cases`
- `/app/live-analysis` run a demo scenario, capture your screen, or upload a screenshot
- `/app/assistant` ask "What should I click?" about the complex dashboard
- `Ctrl+K` command palette, `Ctrl+Shift+S` start analysis, `Esc` stop

## Deploy

The site is static (`dist/`). It needs `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp` (for multithreaded WebAssembly) and a fallback to `index.html` for app routes.

Hosted on **Vercel**: `vercel.json` sets the build command, output directory, headers and rewrites. Import the repository in Vercel, or run `npx vercel --prod` from the project folder.

## Windows host (native, NPU on Snapdragon)

```
npm run build
python -m pip install -r host/requirements.txt            # on Snapdragon: host/requirements-snapdragon.txt (ARM64 Python)
python host/safescreen_host.py
```

It serves the app on `127.0.0.1:8787`, opens an Edge app window, and runs the Qualcomm AI Hub models with ONNX Runtime: QNN execution provider on the Hexagon NPU, CPU elsewhere. See `host/README.md`; `host/build-exe.ps1` builds `SafeScreenHost.exe`.

## Checks

```
npm run typecheck
npm run check:agents                  # agent output for all scenarios and edge cases
npm run build && npm run test:e2e     # browser suite against the production build (uses installed Chrome)
```

The e2e suite runs the Qualcomm AI Hub model and Tesseract on an uploaded screenshot under the production Content Security Policy, checks that no third-party request is made, and starts the Windows host to run the same flow natively (skipped if Python with onnxruntime is not installed).

## Structure

See `docs/architecture.md`, `docs/privacy.md`, `docs/snapdragon.md` and `docs/submission.md`.

## Configuration

- `VITE_SITE_URL` public site address; makes the social preview image URL absolute and adds `og:url`.
- `VITE_CONTACT_EMAIL` contact address on About, Privacy and Terms (shown as a draft until set).
- `VITE_GITHUB_URL` shows a GitHub link in the footer.
- `VITE_CLOUD_DEMO_ENDPOINT` enables cloud fallback (off by default, asks per frame, blocked by local-only mode).

## Model credits

EasyOCR models from [Qualcomm AI Hub](https://aihub.qualcomm.com/models/easyocr) (qai-hub-models v0.62.2), based on [EasyOCR](https://github.com/JaidedAI/EasyOCR) by JaidedAI, Apache-2.0. `scripts/fold-aihub-weights.py` makes two changes for the web (INT8 weight storage and a dynamic recognizer width); outputs match the published export.

## Honest status

- The browser build runs the Qualcomm AI Hub model on the CPU (WebAssembly), or on the GPU through WebGPU if you turn it on.
- The **SafeScreen Windows host** (`host/`) runs the same models natively with ONNX Runtime and selects the QNN execution provider for the Snapdragon NPU. It is tested on x64 with the CPU provider; the NPU path has not been run on Snapdragon hardware yet.
- SafeScreen has not measured anything on Snapdragon hardware. The only NPU figure shown is Qualcomm's published one, labeled as such.
- UI element detection is inferred from text in live mode; demo scenarios use simulated vision annotations.
