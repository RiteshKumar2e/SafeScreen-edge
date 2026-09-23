# Privacy

## Data flow

```
Capture (user-chosen source, only while allowed)
  -> temporary frame buffer (memory only)
  -> local preprocessing (excluded apps dropped here)
  -> local inference (OCR, UI understanding, agents)
  -> local result (sensitive values masked)
  -> optional local history (text results only)
```

| Mode | Where it runs | Leaves device |
| --- | --- | --- |
| Local (default) | This browser, or the Windows host | No |
| Demo simulation | This browser, prepared screens | No |
| Cloud fallback | Configured provider | Yes, only with approval per frame |

## Controls and defaults

| Control | Default | Effect |
| --- | --- | --- |
| Local-only processing | On | Blocks cloud fallback entirely |
| Screen monitoring | On (allowed) | Capture still only starts when the user starts it; turning off stops capture |
| Cloud fallback | Off | Needs `VITE_CLOUD_DEMO_ENDPOINT`, local-only off, and per-frame approval |
| Store screenshots | Off | When on, a 240 px JPEG thumbnail per detection in localStorage |
| Analysis history | On | Detections, activity and run times in localStorage; off deletes them |
| Retention | 7 days | Session, 24 h, 7 d or 30 d; pruned on load and on change |

## Excluded applications

Browser build: a capture source whose track label matches an exclusion is refused, and a frame whose recognized text contains an excluded name is discarded before the agents run. Nothing from that frame is kept. The Windows host is expected to match by process and window handle instead.

## Network

The production build sets a Content Security Policy with `connect-src 'self'` (plus the cloud endpoint origin if one is configured). OCR files are served from the same origin. `script-src` includes `'unsafe-eval'` because the Tesseract worker's bundled runtime calls `Function()`; that does not widen where data can be sent.

## Storage

Everything is stored under one localStorage key, `safescreen.v2`. Raw frames are never stored. Settings, Privacy Center and Settings can clear history or reset everything.

## Limits

Sensitive-value masking is pattern-based and can miss values. Browser extensions and the operating system can see the screen independently of SafeScreen. The privacy policy page is a draft for review.
