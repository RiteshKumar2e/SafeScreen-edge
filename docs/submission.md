# Submission kit

Drafts for the challenge intake form, a demo video script and a pre-submit checklist. Edit anything that does not match how you want to present the project. A submission cannot be changed after it is submitted.

## Form answers (draft)

**Project name:** SafeScreen Edge

**One line:** Private AI that understands what's on your screen, running on the device with a Qualcomm AI Hub model, built for Snapdragon-powered HP PCs.

**Problem.** People constantly need help with what is on their screen: an error they don't understand, a sign-in page that might be fake, a dense dashboard. Asking a cloud assistant means uploading screenshots full of email, code, keys and customer data.

**Solution.** SafeScreen Edge reads the screen on the device. It finds the text and where it sits, labels the parts that matter (error message, password field, main button, warning), and explains what is happening, why it matters and what to do next, quoting the lines it used. Nothing is uploaded: the production build is only allowed to connect to its own origin.

**AI models used.**
- EasyOCR from Qualcomm AI Hub (qai-hub-models v0.62.2, w8a8 ONNX export, Apache-2.0): CRAFT text detector and CRNN recognizer. It is the default text model and runs in the browser with ONNX Runtime Web.
- Tesseract 5 LSTM (INT8 weights) as a lighter alternative.
- Local rule-based agents (error, risk, UI) that produce explanations with evidence and confidence.

**Snapdragon and HP.** Screen understanding is continuous and private, which is the NPU's job. The SafeScreen Windows host runs the same Qualcomm AI Hub models natively through ONNX Runtime and selects the QNN execution provider for the Hexagon NPU on Snapdragon X Series HP PCs (CPU elsewhere). Qualcomm publishes 13.45 ms for this detector on the Snapdragon X Elite NPU. The web app already has the host bridge, a runtime probe that reports the real backend, and an AI Runtime page that shows only measured values.

**Technical implementation.**
- Ported Qualcomm's EasyOCR pre- and post-processing to TypeScript: letterboxing, CRAFT connected components, line grouping and CTC decoding.
- Stored the weights as INT8, cutting the models from 98 MB to 25 MB with bit-identical outputs, and made the recognizer width dynamic for short lines.
- Inference runs in a Web Worker on multithreaded WebAssembly, with WebGPU opt-in.
- A Windows host (`host/`) serves the app on 127.0.0.1 and runs the models natively with ONNX Runtime (QNN on the NPU, CPU fallback), guarded against DNS rebinding and cross-origin requests.
- Every stage is timed and tagged with the backend it ran on.
- An end-to-end browser suite (306 checks) runs the AI Hub model on an uploaded screenshot under the production security policy and checks that no third-party request is made.

**Innovation.** Most screen assistants are cloud chatbots. SafeScreen understands layout as well as text, so it can say which field wants a password or which button matters. It also keeps privacy as the default rather than a setting.
- Excluded apps are discarded before analysis.
- Cloud fallback is off by default and asks per frame.
- Commands are shown as text, never run.

**Deployment and accessibility.**
- **Hosting:** a static site on Vercel (`vercel.json` included). There is nothing to install, and it runs on any modern Chromium browser.
- **Accessibility:** keyboard shortcuts, a skip link, visible focus, reduced-motion support, light and dark themes, and a layout that works at phone width.

**Honest limits.**
- The Windows host is built and tested on x64 (CPU provider); its QNN/NPU path has not been run on Snapdragon hardware yet.
- SafeScreen has not measured anything on Snapdragon hardware.
- In the browser on a low-end x86 CPU, one screenshot takes 25 to 50 s.

## Demo video script (about 3 minutes)

| Time | Show | Say |
| --- | --- | --- |
| 0:00 | Home page hero | "Understanding your screen shouldn't mean uploading it. SafeScreen Edge does it on the device." |
| 0:15 | Live Analysis, Developer error scenario | "A Python error: SafeScreen finds the error line, explains the cause, and gives a fix you can copy. It never runs commands." |
| 0:40 | Suspicious login scenario | "A sign-in page on the wrong domain. It flags it as potentially suspicious and shows exactly which address-bar text triggered that." |
| 1:05 | Upload a real screenshot | "This is a real screenshot, read by EasyOCR from Qualcomm AI Hub, running here with ONNX Runtime." Point at the pipeline line naming the model and its measured time. |
| 1:40 | Screen Assistant on the dashboard | Ask "What should I click?" and show the highlighted region. |
| 2:00 | AI Runtime page | "Every number here was measured on this device. The only NPU figure is Qualcomm's own, labeled as such. On a Snapdragon HP PC the same models run on the NPU through the QNN execution provider." |
| 2:30 | Privacy Center | "Local-only by default, excluded apps are dropped before analysis, and cloud fallback asks every time." |
| 2:50 | Technology page roadmap | "Next: the Windows host on Snapdragon, and a UI detector from AI Hub." |

Record at 1920x1080. Run one real analysis before recording so the models are cached and the upload step is quick.

## Pre-submit checklist

- [ ] Deploy to Vercel and open the live URL in a fresh browser; run one upload analysis.
- [ ] Set `VITE_SITE_URL`, and optionally `VITE_CONTACT_EMAIL` and `VITE_GITHUB_URL`, then redeploy.
- [ ] Make the repository public (or share it with the judges), with README and `docs/`.
- [ ] Record and upload the demo video.
- [ ] Confirm the submitting account is the owner of the work, and that the name matches the repository author.
- [ ] Review Terms and Privacy Policy drafts or leave them clearly marked as drafts.
- [ ] Read every form field twice. One submission per participant; it cannot be edited afterwards.
