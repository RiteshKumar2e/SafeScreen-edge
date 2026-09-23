import { Link } from 'react-router-dom';
import { Icon } from '../../components/Icon';
import { STAGES } from '../../components/Pipeline';
import { EmptyState } from '../../components/ui';
import { usePageMeta } from '../../lib/usePageMeta';
import { EASYOCR_MODEL } from '../../inference/aihub/easyocr';
import { EXECUTION_PLAN } from '../../runtime/plan';
import { useRuntime } from '../../runtime/useRuntime';
import { useStore } from '../../store/store';

function median(xs: number[]) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export default function Runtime() {
  usePageMeta('AI Runtime', 'Which compute backend runs each stage, what this device supports, and times measured on this device.');
  const { probe, loading, refresh } = useRuntime();
  const runs = useStore((s) => s.runs);
  const engine = useStore((s) => s.settings.ocrEngine);
  const gpu = useStore((s) => s.settings.gpuAcceleration);
  const modelRuns = runs.flatMap((r) => r.models ?? []);
  const modelMedians = [...new Set(modelRuns.map((m) => m.name))].map((name) => {
    const rows = modelRuns.filter((m) => m.name === name && m.runs > 0);
    return { name, ms: median(rows.map((m) => m.ms / m.runs)), n: rows.length };
  });
  const host = probe?.host;
  const npu = probe?.activeBackend === 'npu';

  const stageMedians = STAGES.map((st) => ({ ...st, ms: median(runs.map((r) => r.stages[st.id]).filter((x): x is number => typeof x === 'number')) }));
  const maxMs = Math.max(1, ...stageMedians.map((s) => s.ms ?? 0));
  const total = median(runs.map((r) => r.totalMs));

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>AI Runtime</h1>
          <p>Where each stage of the pipeline runs, what this device supports, and how long analysis actually took here. Values come from runtime checks and measured runs, never from spec sheets.</p>
        </div>
        <button type="button" className="btn btn-secondary btn-sm" onClick={refresh} disabled={loading}>
          <Icon name="refresh" />
          Re-check device
        </button>
      </div>

      <div className="rt-cards">
        <div className="card rt-card">
          <span className="label">Execution provider</span>
          <span className="v">
            <span className="dot" style={{ color: npu ? 'var(--local)' : 'var(--accent-text)' }} />
            {loading ? 'Checking…' : npu ? 'Snapdragon NPU (QNN)' : probe?.activeLabel ?? 'CPU · WebAssembly'}
          </span>
          <span className="n">{npu ? 'Reported by the SafeScreen Windows host' : 'Snapdragon NPU: available through the Windows host, not in the browser build'}</span>
        </div>
        <div className="card rt-card">
          <span className="label">Runtime</span>
          <span className="v">{host ? 'ONNX Runtime (host)' : engine === 'tesseract' ? 'Tesseract.js · WebAssembly' : `ONNX Runtime Web · ${gpu ? 'WebGPU' : 'WebAssembly'}`}</span>
          <span className="n">{host ? `Providers: ${host.executionProviders.join(', ')}` : 'Snapdragon target: ONNX Runtime with the QNN execution provider'}</span>
        </div>
        <div className="card rt-card">
          <span className="label">Model</span>
          <span className="v">{host?.models[0]?.name ?? (engine === 'tesseract' ? 'Tesseract 5 LSTM · English' : 'EasyOCR · Qualcomm AI Hub')}</span>
          <span className="n">{host ? host.models.map((m) => `${m.name} on ${m.provider}`).join(' · ') : engine === 'tesseract' ? 'Selected in Settings. Served from this site.' : 'CRAFT text detector + CRNN recognizer, qai-hub-models v0.62.2. Served from this site.'}</span>
        </div>
        <div className="card rt-card">
          <span className="label">Precision</span>
          <span className="v">{host?.models[0]?.precision ?? (engine === 'tesseract' ? 'INT8 weights' : 'INT8 (w8a8)')}</span>
          <span className="n">{host ? 'As reported by the host' : engine === 'tesseract' ? 'tessdata best_int: integer-quantized LSTM' : 'INT8 weights and activations, as exported by Qualcomm AI Hub'}</span>
        </div>
        <div className="card rt-card">
          <span className="label">Status</span>
          <span className="v">
            <span className="dot" style={{ color: 'var(--local)' }} />
            Ready
          </span>
          <span className="n">{probe?.probes.find((p) => p.id === 'wasm')?.value ?? 'Checking WebAssembly…'}</span>
        </div>
        <div className="card rt-card">
          <span className="label">Processing</span>
          <span className="v">
            <Icon name="lock" />
            On-device
          </span>
          <span className="n">Frames are processed in this tab's memory and never uploaded by default</span>
        </div>
      </div>

      <div className="section-title">
        <h2>Model pipeline</h2>
        <span className="small subtle">Today in this build → target on Snapdragon X Series</span>
      </div>
      <div className="card table-wrap">
        <table className="plan">
          <thead>
            <tr>
              <th scope="col">Stage</th>
              <th scope="col">Runs today</th>
              <th scope="col">Backend</th>
              <th scope="col">Snapdragon target</th>
              <th scope="col">Unit</th>
            </tr>
          </thead>
          <tbody>
            {EXECUTION_PLAN.map((r) => (
              <tr key={r.stage}>
                <th scope="row">{r.stage}</th>
                <td>
                  {r.today}
                  <small>{r.todayStatus}</small>
                </td>
                <td>
                  <span className="chip">{r.todayBackend}</span>
                </td>
                <td>{r.target}</td>
                <td>
                  <span className={`chip ${r.targetBackend === 'NPU' ? 'chip-accent' : ''}`}>{r.targetBackend}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="pv-grid" style={{ marginTop: 16 }}>
        <section className="card" aria-labelledby="device">
          <div className="card-head">
            <h2 id="device">This device</h2>
            {probe?.snapdragonLikely ? <span className="chip chip-local">Arm64 Windows · Qualcomm GPU</span> : <span className="chip">{probe?.arch ? `${probe.arch === 'arm64' ? 'Arm64' : probe.arch === 'x8664' ? 'x86-64' : probe.arch} · no Snapdragon detected` : 'Architecture not reported'}</span>}
          </div>
          {loading && !probe ? (
            <div className="card-pad" style={{ display: 'grid', gap: 10 }}>
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="skeleton" style={{ height: 18 }} />
              ))}
            </div>
          ) : (
            <ul className="probe-list">
              {probe?.probes.map((p) => (
                <li key={p.id}>
                  <span className="name">{p.label}</span>
                  <span>
                    {p.value}
                    {p.note && <span className="p-note">{p.note}</span>}
                  </span>
                  <span className="probe-state" data-s={p.status}>
                    {p.status === 'active' ? 'In use' : p.status === 'available' ? 'Available' : p.status === 'unknown' ? 'Unknown' : 'Not detected'}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card" aria-labelledby="measured">
          <div className="card-head">
            <h2 id="measured">Measured on this device</h2>
            <span className="small subtle">{runs.length ? `Median of ${runs.length} run${runs.length === 1 ? '' : 's'}` : 'No runs yet'}</span>
          </div>
          {runs.length === 0 ? (
            <EmptyState
              icon="clock"
              title="No measured runs yet"
              actions={
                <Link to="/app/live-analysis" className="btn btn-secondary btn-sm">
                  Capture or upload a screen
                </Link>
              }
            >
              Times appear after on-device analysis of a real capture or screenshot. Demo simulations are not timed.
            </EmptyState>
          ) : (
            <div className="card-pad" style={{ display: 'grid', gap: 14 }}>
              <div className="bars">
                {stageMedians.map((s) => (
                  <div key={s.id} className="b">
                    <span>{s.label}</span>
                    <span className="track">
                      <span className="fill" style={{ width: `${((s.ms ?? 0) / maxMs) * 100}%` }} />
                    </span>
                    <span className="ms">{s.ms === null ? 'Not timed' : `${s.ms < 1 ? '<1' : Math.round(s.ms)} ms`}</span>
                  </div>
                ))}
              </div>
              <p className="small">
                <strong>End to end: {total} ms</strong> <span className="muted">on {runs[0].backend}, wall-clock in this browser. The first run includes loading the model.</span>
              </p>
              {modelMedians.length > 0 && (
                <dl className="model-times">
                  {modelMedians.map((m) => (
                    <div key={m.name}>
                      <dt>{m.name}</dt>
                      <dd>
                        {m.ms === null ? 'Not timed' : `${Math.round(m.ms)} ms per run`} <span className="muted">median of {m.n}</span>
                      </dd>
                    </div>
                  ))}
                </dl>
              )}
            </div>
          )}
          <div className="card-pad" style={{ borderTop: '1px solid var(--line)', display: 'grid', gap: 6 }}>
            <span className="label">Snapdragon NPU reference</span>
            <p className="small muted">
              Qualcomm AI Hub publishes {EASYOCR_MODEL.published.detectorMs} ms for this EasyOCR detector (w8a8) on the {EASYOCR_MODEL.published.device} NPU through {EASYOCR_MODEL.published.runtime}. That figure is Qualcomm's, not measured by SafeScreen. SafeScreen's own NPU numbers will appear here from the Windows host once profiled on a Snapdragon HP PC.
            </p>
          </div>
        </section>
      </div>

      <div className="section-title">
        <h2>Hardware integration layer</h2>
      </div>
      <div className="card card-pad" style={{ display: 'grid', gap: 10 }}>
        <p className="muted">
          Inference sits behind one provider interface, so the hardware path can change without touching the product. The app picks the first available provider in this order:
        </p>
        <ol className="steps-list">
          <li>
            <span>
              <strong>Windows host</strong> <span className={`provider-status${host ? ' is-on' : ''}`}>{host ? 'Connected' : 'Not connected'}</span>
              <br />
              <span className="small muted">WebView2 shell that captures with Windows.Graphics.Capture and runs ONNX Runtime with the QNN execution provider on the Snapdragon NPU.</span>
            </span>
          </li>
          <li>
            <span>
              <strong>Browser, on-device</strong> <span className={`provider-status${host ? '' : ' is-on'}`}>{host ? 'Standby' : 'Active'}</span>
              <br />
              <span className="small muted">Qualcomm AI Hub EasyOCR in ONNX Runtime Web (or Tesseract, selectable in Settings) plus local agents. Used in this build.</span>
            </span>
          </li>
          <li>
            <span>
              <strong>Cloud fallback</strong> <span className="provider-status">Off by default</span>
              <br />
              <span className="small muted">Only when allowed in Privacy, only after local analysis fails, and only with your approval for that frame.</span>
            </span>
          </li>
        </ol>
      </div>
    </div>
  );
}
