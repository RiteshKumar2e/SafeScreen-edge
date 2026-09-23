import { Link } from 'react-router-dom';
import { Performance, TechStack } from '../components/site/Sections';
import { usePageMeta } from '../lib/usePageMeta';
import { EXECUTION_PLAN } from '../runtime/plan';

export default function Technology() {
  usePageMeta(
    'Technology',
    'How SafeScreen Edge runs: Qualcomm AI Hub EasyOCR on the device, local reasoning agents, and a hardware integration layer for ONNX Runtime and the Snapdragon NPU on HP PCs.',
  );
  return (
    <>
      <section className="page-hero">
        <div className="container">
          <span className="kicker">Technology</span>
          <h1 className="display h1" style={{ fontSize: 'clamp(2.2rem, 5vw, 3.6rem)' }}>
            Built for AI at the edge.
          </h1>
          <p className="lead">
            Screen understanding runs continuously and handles the most sensitive data on a PC. Both are reasons to run it on the device, on silicon designed for sustained, low-power AI.
          </p>
        </div>
      </section>

      <section className="section-tight" aria-labelledby="t-stack">
        <div className="container">
          <h2 id="t-stack" className="visually-hidden">
            Stack
          </h2>
          <TechStack />
        </div>
      </section>

      <section className="section alt" aria-labelledby="t-why">
        <div className="container">
          <div className="section-head">
            <span className="kicker">Why on-device</span>
            <h2 id="t-why" className="display h2">
              Why this workload belongs on the NPU.
            </h2>
          </div>
          <dl className="rows">
            <div>
              <dt>Privacy</dt>
              <dd>Screens show messages, code, credentials and documents. Processing them where they are displayed removes the upload entirely.</dd>
            </div>
            <div>
              <dt>Sustained, low power</dt>
              <dd>Monitoring means repeated inference over hours. NPUs are built for that duty cycle without draining the battery or heating the CPU.</dd>
            </div>
            <div>
              <dt>Latency and offline use</dt>
              <dd>No network round trip, and no dependence on a service being reachable. SafeScreen keeps working on a plane.</dd>
            </div>
          </dl>
        </div>
      </section>

      <section className="section" aria-labelledby="t-plan">
        <div className="container">
          <div className="section-head">
            <span className="kicker">Pipeline</span>
            <h2 id="t-plan" className="display h2">
              Stage by stage: what runs today, and where it is going.
            </h2>
            <p className="lead">The browser build runs the whole pipeline on the device, with EasyOCR from Qualcomm AI Hub on the CPU (or GPU through WebGPU). The Windows host runs the same models on the Snapdragon NPU.</p>
          </div>
          <div className="card table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Stage</th>
                  <th scope="col">In this build</th>
                  <th scope="col">Snapdragon target</th>
                </tr>
              </thead>
              <tbody>
                {EXECUTION_PLAN.map((r) => (
                  <tr key={r.stage}>
                    <th scope="row">{r.stage}</th>
                    <td>
                      {r.today}{' '}
                      <span className={`chip ${r.todayStatus === 'Built' ? 'chip-local' : 'chip-sim'}`} style={{ marginLeft: 4 }}>
                        {r.todayStatus} · {r.todayBackend}
                      </span>
                    </td>
                    <td>
                      {r.target}{' '}
                      <span className={`chip ${r.targetBackend === 'NPU' ? 'chip-accent' : ''}`} style={{ marginLeft: 4 }}>
                        {r.targetBackend}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="section alt" aria-labelledby="t-layer">
        <div className="container grid-2" style={{ alignItems: 'start' }}>
          <div className="section-head" style={{ marginBottom: 0 }}>
            <span className="kicker">Hardware integration layer</span>
            <h2 id="t-layer" className="display h2">
              Swap the silicon, keep the product.
            </h2>
            <p className="lead">
              Every inference path implements one provider interface with the same stage events. The app picks the best available path at runtime and shows which one ran.
            </p>
          </div>
          <div className="card card-pad" style={{ display: 'grid', gap: 14 }}>
            <div>
              <strong>Windows host provider</strong> <span className="chip chip-local">Built</span>
              <p className="small muted" style={{ marginTop: 4 }}>
                A local host app serves SafeScreen on 127.0.0.1 and runs the Qualcomm AI Hub models natively with ONNX Runtime, selecting the QNN execution provider for the Hexagon NPU on Snapdragon PCs and the
                CPU elsewhere. The page talks to it over same-origin requests. Tested on x64 with the CPU provider; the NPU path has not yet been run on Snapdragon hardware.
              </p>
            </div>
            <div>
              <strong>Browser provider</strong> <span className="chip chip-local">In this build</span>
              <p className="small muted" style={{ marginTop: 4 }}>
                EasyOCR from Qualcomm AI Hub (w8a8) in ONNX Runtime Web, on multithreaded WebAssembly or optionally WebGPU, plus the local agents. Tesseract is available as a lighter option. Models are served from this site.
              </p>
            </div>
            <div>
              <strong>Runtime probe</strong> <span className="chip chip-local">In this build</span>
              <p className="small muted" style={{ marginTop: 4 }}>
                Reports CPU architecture, WebAssembly SIMD, the WebGPU adapter vendor, WebNN NPU context support and the host connection. Every value comes from a runtime check on this device.
              </p>
            </div>
            <Link to="/app/runtime" className="btn btn-secondary btn-sm" style={{ justifySelf: 'start' }}>
              See your device in AI Runtime
            </Link>
          </div>
        </div>
      </section>

      <section className="section-tight" aria-labelledby="t-perf">
        <div className="container">
          <div className="section-head">
            <span className="kicker">Performance</span>
            <h2 id="t-perf" className="display h2">
              Measured on your device.
            </h2>
          </div>
          <Performance />
        </div>
      </section>

      <section className="section alt" aria-labelledby="t-safety">
        <div className="container grid-2" style={{ alignItems: 'start' }}>
          <div className="section-head" style={{ marginBottom: 0 }}>
            <span className="kicker">Security model</span>
            <h2 id="t-safety" className="display h2">
              You stay in control of every action.
            </h2>
          </div>
          <ul className="not-claim">
            {[
              ['Never executes commands', 'Fixes are shown as text with a Copy button. Nothing is run on your behalf.'],
              ['Never submits forms or types passwords', 'SafeScreen reads the screen; it has no ability to control other apps.'],
              ['Never uploads automatically', 'Cloud fallback is off by default, needs a configured provider, and asks per frame.'],
              ['Content Security Policy', "The production build restricts network connections to the app's own origin."],
              ['Secrets masked in results', 'API keys, tokens, card numbers and passwords visible on screen are masked in explanations and history.'],
            ].map(([t, d]) => (
              <li key={t}>
                <span>
                  <strong>{t}</strong>
                  <span>{d}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="section" aria-labelledby="documentation" id="documentation">
        <div className="container">
          <div className="section-head">
            <span className="kicker">Documentation</span>
            <h2 id="documentation" className="display h2">
              Documentation
            </h2>
            <p className="lead">The repository includes engineering documents alongside the code.</p>
          </div>
          <dl className="rows">
            {[
              ['docs/architecture.md', 'Architecture', 'Pipeline stages, the provider interface, agents, region labeling, and how the app and the AI engine are separated.'],
              ['docs/privacy.md', 'Privacy', 'Data flow for each mode, what is stored and where, retention, exclusions, and the Content Security Policy.'],
              ['docs/snapdragon.md', 'Snapdragon integration', 'The Windows host bridge protocol, ONNX Runtime with the QNN execution provider, model preparation with Qualcomm AI Hub, and the profiling plan.'],
            ].map(([file, title, text]) => (
              <div key={file}>
                <dt>{title}</dt>
                <dd>
                  {text} <code className="small subtle">{file}</code>
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </section>
    </>
  );
}
