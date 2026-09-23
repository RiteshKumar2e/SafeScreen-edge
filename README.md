# SafeScreen Edge

Private AI that understands what's on your screen. SafeScreen Edge reads a screen on the device, finds errors, risky sign-in pages and messages that need attention, explains them with the evidence it used, and suggests a next step. It is designed for Windows on Snapdragon, where the model stages move to the NPU.

## Run

```
npm install
npm run dev                  # http://localhost:5173
npm run build && npm run preview
```

`predev` / `prebuild` copy the Tesseract worker, WASM core and English model into `public/ocr`, so OCR never calls a third-party CDN.

## What to try

- `/` marketing site, `/technology`, `/privacy`, `/use-cases`
- `/app/live-analysis` run a demo scenario, capture your screen, or upload a screenshot
- `/app/assistant` ask "What should I click?" about the complex dashboard
- `Ctrl+K` command palette, `Ctrl+Shift+S` start analysis, `Esc` stop
- **Present** in the app top bar: guided 72-second walkthrough

Demo scenarios are labeled "Demo Simulation". Live capture and uploads run real on-device OCR.

## Checks

```
npm run typecheck
npm run check:agents                  # agent output for all scenarios and edge cases
npm run build && npm run test:e2e     # browser suite against the production build (uses installed Chrome)
```

## Structure

See `docs/architecture.md`, `docs/privacy.md` and `docs/snapdragon.md`.

## Configuration

- `VITE_CLOUD_DEMO_ENDPOINT` enables cloud fallback (off by default, asks per frame, blocked by local-only mode).
- `VITE_CONTACT_EMAIL` contact address on About, Privacy and Terms (shown as a draft until set).
- `VITE_GITHUB_URL` shows a GitHub link in the footer.
- `VITE_SITE_URL` public site address; makes the social preview image URL absolute and adds `og:url`.

## Honest status

- The browser build runs on the CPU (WebAssembly). NPU execution requires the SafeScreen Windows host, which is specified (`docs/snapdragon.md`) and has a working bridge in the app, but is not included here.
- No Snapdragon benchmarks have been measured. Times shown in the app are measured in your browser.
- UI element detection is inferred from text in live mode; demo scenarios use simulated vision annotations.
