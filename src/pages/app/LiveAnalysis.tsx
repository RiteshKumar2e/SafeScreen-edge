import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useSession } from '../../app/session';
import { Icon } from '../../components/Icon';
import { InsightPanel } from '../../components/InsightPanel';
import { Pipeline, STAGES } from '../../components/Pipeline';
import { cropImage, ScreenPreview, type CropRect } from '../../components/ScreenPreview';
import { EmptyState, Toggle } from '../../components/ui';
import { getScenario, SCENARIOS } from '../../demo/scenarios';
import { cloudConfigured } from '../../inference/providers';
import { usePageMeta } from '../../lib/usePageMeta';
import { markDetection, getState, log, updateSettings, useStore } from '../../store/store';
import { MOD } from '../../app/AppLayout';

type Source = 'demo' | 'live' | 'upload';

export default function LiveAnalysis() {
  usePageMeta('Live Analysis', 'Analyze your screen on this device: capture, detect UI elements and issues, and see explanations with evidence.');
  const s = useSession();
  const settings = useStore((x) => x.settings);
  const engineName = settings.ocrEngine === 'tesseract' ? 'Tesseract OCR' : 'EasyOCR from Qualcomm AI Hub';
  const slowCpu = (navigator.hardwareConcurrency || 4) < 8;
  const [params, setParams] = useSearchParams();
  const [source, setSource] = useState<Source>(() => (s.frame && !s.frame.scenarioId ? (s.frame.source === 'live' ? 'live' : 'upload') : 'demo'));
  const [focus, setFocus] = useState<string[]>([]);
  const [selecting, setSelecting] = useState(false);
  const [selection, setSelection] = useState<CropRect | null>(null);
  const [drag, setDrag] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // ?scenario=... loads and analyzes a demo (links from the website).
  useEffect(() => {
    const id = params.get('scenario');
    if (id && getScenario(id)) {
      setSource('demo');
      s.loadScenario(id, { analyze: true });
      setParams({}, { replace: true });
    }
    // Only react to the query string.
  }, [params]);

  useEffect(() => setFocus([]), [s.report]);

  // Paste a screenshot anywhere on this page.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      const file = Array.from(e.clipboardData?.items ?? []).find((i) => i.type.startsWith('image/'))?.getAsFile();
      if (file) {
        e.preventDefault();
        setSource('upload');
        s.loadBlob(file, 'paste', 'Pasted screenshot');
      }
    };
    document.addEventListener('paste', onPaste);
    return () => document.removeEventListener('paste', onPaste);
  }, [s]);

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) s.loadBlob(f, 'upload', f.name);
    e.target.value = '';
  };

  const applySelection = async () => {
    if (!s.frame || !selection) return;
    try {
      const blob = await cropImage(s.frame.url, selection);
      s.loadBlob(blob, s.frame.source === 'demo' ? 'upload' : s.frame.source, `${s.frame.label} · selected region`);
      setSource(s.frame.source === 'live' ? 'live' : 'upload');
    } finally {
      setSelecting(false);
      setSelection(null);
    }
  };

  const r = s.report;
  const cloudActive = r?.leftDevice;
  const analyzing = s.status === 'analyzing';
  const scenario = getScenario(s.frame?.scenarioId);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Live Screen Analysis</h1>
          <p>Capture a screen, or load a prepared scenario. SafeScreen finds the interface elements, detects issues and risks, and explains what to do next.</p>
        </div>
        <div className="btn-row">
          <span className={`chip ${s.isSimulation ? 'chip-sim' : 'chip-local'}`}>
            <Icon name={s.isSimulation ? 'image' : 'chip'} />
            {s.isSimulation ? 'Demo Simulation' : 'Live Device Analysis'}
          </span>
        </div>
      </div>

      <div className="source-picker">
        <div className="segmented" role="radiogroup" aria-label="Screen source">
          {(
            [
              ['demo', 'Demo scenarios', 'image'],
              ['live', 'Live capture', 'capture'],
              ['upload', 'Upload or paste', 'upload'],
            ] as const
          ).map(([id, label, icon]) => (
            <button key={id} type="button" role="radio" aria-checked={source === id} onClick={() => setSource(id)}>
              <Icon name={icon} />
              {label}
            </button>
          ))}
        </div>

        {source === 'demo' && (
          <div className="scenario-chips" role="group" aria-label="Demo scenarios">
            {SCENARIOS.map((sc) => (
              <button key={sc.id} type="button" aria-pressed={s.frame?.scenarioId === sc.id} onClick={() => s.loadScenario(sc.id, { analyze: true })}>
                {sc.title}
              </button>
            ))}
          </div>
        )}

        {source === 'live' && (
          <div className="card card-pad" style={{ display: 'grid', gap: 12 }}>
            {!s.canCapture ? (
              <p className="muted">Screen capture is not available in this browser. Use a desktop browser, or upload a screenshot instead.</p>
            ) : !settings.monitoringAllowed ? (
              <div className="btn-row" style={{ justifyContent: 'space-between' }}>
                <p className="muted">Screen monitoring is paused in the Privacy Center. Nothing can be captured until you resume it.</p>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => updateSettings({ monitoringAllowed: true }, 'Screen monitoring resumed.')}>
                  Resume monitoring
                </button>
              </div>
            ) : s.capture.active ? (
              <div className="btn-row" style={{ justifyContent: 'space-between' }}>
                <p>
                  <strong>Capturing {s.capture.surface?.toLowerCase()}.</strong>{' '}
                  <span className="muted">
                    {s.capture.frames} frame{s.capture.frames === 1 ? '' : 's'} analyzed
                    {s.capture.skipped ? `, ${s.capture.skipped} unchanged skipped` : ''}. Frames stay in memory on this device.
                  </span>
                </p>
                <div className="btn-row">
                  <label className="small muted" htmlFor="auto">
                    Auto-analyze
                  </label>
                  <select
                    id="auto"
                    className="select"
                    style={{ width: 150, height: 32 }}
                    value={settings.autoAnalyzeSeconds}
                    onChange={(e) => updateSettings({ autoAnalyzeSeconds: Number(e.target.value) as 0 | 10 | 30 | 60 }, `Auto-analyze set to ${e.target.value === '0' ? 'off' : `every ${e.target.value} s`}.`)}
                  >
                    <option value={0}>Off (manual)</option>
                    <option value={10}>Every 10 s</option>
                    <option value={30}>Every 30 s</option>
                    <option value={60}>Every 60 s</option>
                  </select>
                  <button type="button" className="btn btn-primary btn-sm" onClick={() => s.startCapture()} disabled={analyzing}>
                    <Icon name="scan" />
                    Analyze current frame
                  </button>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => s.stopCapture()}>
                    <Icon name="stop" />
                    Stop capture
                  </button>
                </div>
              </div>
            ) : (
              <div style={{ display: 'grid', gap: 10 }}>
                <p>
                  <strong>Why SafeScreen asks for screen access.</strong>{' '}
                  <span className="muted">
                    Your browser will ask which screen, window or tab to share. SafeScreen reads frames from that source only, keeps them in memory on this device, and stops the moment you
                    press Stop or Esc. Excluded apps are discarded without analysis.
                  </span>
                </p>
                <div className="btn-row">
                  <button type="button" className="btn btn-primary btn-sm" onClick={() => s.startCapture()}>
                    <Icon name="capture" />
                    Start screen capture
                  </button>
                  <span className="small subtle">
                    Shortcut <kbd>{MOD}</kbd> <kbd>Shift</kbd> <kbd>S</kbd>
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

        {source === 'upload' && (
          <div className="btn-row">
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => fileRef.current?.click()}>
              <Icon name="upload" />
              Choose screenshot
            </button>
            <span className="small subtle">
              or drop an image on the stage, or paste with <kbd>{MOD}</kbd> <kbd>V</kbd>
            </span>
          </div>
        )}
        <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/bmp" className="visually-hidden" onChange={onFile} aria-label="Upload screenshot" tabIndex={-1} />
      </div>

      {s.frame && (
        <div className={`mode-banner${s.isSimulation ? '' : cloudActive ? ' cloud' : ' live'}`} role="note">
          <Icon name={s.isSimulation ? 'image' : cloudActive ? 'cloud' : 'chip'} />
          {s.isSimulation ? (
            <span>
              <strong>Demo Simulation.</strong> Prepared screen with a prepared text transcript and simulated vision annotations. The agents, regions and explanations are computed live, but
              this is not a hardware inference run.
            </span>
          ) : cloudActive ? (
            <span>
              <strong>Cloud fallback used.</strong> You approved sending this frame to the configured external provider.
            </span>
          ) : (
            <span>
              <strong>Live Device Analysis.</strong> {engineName} and the reasoning agents run on this device ({r?.backends.ocr ?? (settings.gpuAcceleration && settings.ocrEngine !== 'tesseract' ? 'GPU · WebGPU' : 'CPU · WebAssembly')}). The frame is not uploaded.{' '}
              <Link to="/app/settings#ai">Change model</Link>
            </span>
          )}
          {scenario && (
            <label className="btn-row small" style={{ marginLeft: 'auto', gap: 8 }}>
              <Toggle checked={s.liveOcr} onChange={s.setLiveOcr} label="Run real on-device OCR on this demo image" />
              Run real OCR on this image
            </label>
          )}
        </div>
      )}

      <div className="la-grid">
        <section className="card stage" aria-label="Screen preview" data-present="screen">
          <div className="stage-toolbar">
            <span className="title">
              <Icon name="monitor" />
              <span>{s.frame ? s.frame.label : 'No screen loaded'}</span>
            </span>
            <span className="grow" />
            {s.frame && (
              <>
                <label className="btn-row small muted" style={{ gap: 8 }}>
                  <Toggle checked={settings.showOverlay} onChange={(v) => updateSettings({ showOverlay: v })} label="Show detection overlay" />
                  Overlay
                </label>
                {selecting ? (
                  <>
                    <button type="button" className="btn btn-primary btn-sm" onClick={applySelection} disabled={!selection}>
                      Use selection
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => {
                        setSelecting(false);
                        setSelection(null);
                      }}
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSelecting(true)} disabled={analyzing}>
                      <Icon name="crop" />
                      Select region
                    </button>
                    {analyzing ? (
                      <button type="button" className="btn btn-secondary btn-sm" onClick={s.stopAll}>
                        <Icon name="stop" />
                        Stop
                      </button>
                    ) : (
                      <button type="button" className="btn btn-primary btn-sm" onClick={() => s.analyzeNow()}>
                        <Icon name={s.status === 'done' ? 'refresh' : 'play'} />
                        {s.status === 'done' ? 'Analyze again' : 'Analyze'}
                      </button>
                    )}
                  </>
                )}
              </>
            )}
          </div>

          <div
            className={`stage-body${drag ? ' drag' : ''}`}
            onDragOver={(e) => {
              e.preventDefault();
              setDrag(true);
            }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDrag(false);
              const f = e.dataTransfer.files?.[0];
              if (f) {
                setSource('upload');
                s.loadBlob(f, 'upload', f.name);
              }
            }}
          >
            {s.status === 'error' ? (
              <EmptyState
                icon="alert"
                title="Screen analysis unavailable"
                error
                actions={
                  <>
                    <button type="button" className="btn btn-primary btn-sm" onClick={() => s.analyzeNow()}>
                      Try again
                    </button>
                    {s.canOfferCloud && (
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => s.analyzeWithCloud()}>
                        <Icon name="cloud" />
                        Send this frame to cloud fallback
                      </button>
                    )}
                    <button type="button" className="btn btn-secondary btn-sm" onClick={() => s.loadScenario(SCENARIOS[0].id, { analyze: true })}>
                      Use a demo scenario
                    </button>
                  </>
                }
              >
                {s.error}
              </EmptyState>
            ) : s.frame ? (
              <div style={{ width: '100%', display: 'grid', gap: 8 }}>
                {selecting && <p className="small muted">Drag across the part of the screen you want analyzed.</p>}
                <ScreenPreview
                  key={s.frame.url}
                  src={s.frame.url}
                  alt={scenario?.alt ?? 'Screen to analyze'}
                  regions={r?.regions}
                  showRegions={settings.showOverlay && s.status === 'done'}
                  active={focus}
                  scanning={analyzing}
                  selecting={selecting}
                  onSelection={setSelection}
                  width={scenario?.width}
                  height={scenario?.height}
                  eager
                />
                {r && s.status === 'done' && r.regions.length > 0 && settings.showOverlay && (
                  <p className="tiny subtle">
                    {r.regions.length} region{r.regions.length === 1 ? '' : 's'} · positions from {[...new Set(r.regions.map((x) => x.source.replace(/^OCR text position$/, 'recognized text positions').replace(/^(\w)/, (c) => c.toLowerCase())))].join(' and ')}
                  </p>
                )}
              </div>
            ) : (
              <EmptyState
                icon="monitor"
                title="Nothing on stage yet"
                actions={
                  <>
                    <button type="button" className="btn btn-primary btn-sm" onClick={() => s.loadScenario(SCENARIOS[0].id, { analyze: true })}>
                      Run a demo scenario
                    </button>
                    {s.canCapture && (
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => {
                          setSource('live');
                          void s.startCapture();
                        }}
                      >
                        <Icon name="capture" />
                        Capture screen
                      </button>
                    )}
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => fileRef.current?.click()}>
                      Upload
                    </button>
                  </>
                }
              >
                Start a live capture, drop in a screenshot, or run one of the prepared scenarios.
              </EmptyState>
            )}
          </div>

          <div className="stage-foot">
            <ol className="pipe-strip" aria-label="Pipeline progress">
              {STAGES.map((st) => {
                const u = s.stages[st.id];
                return (
                  <li key={st.id} data-status={u?.status ?? 'pending'} title={u?.detail}>
                    <span className="bar" />
                    <span>{st.label.replace(' (OCR)', '')}</span>
                  </li>
                );
              })}
            </ol>
            <span className="small subtle mono" style={{ alignSelf: 'end' }}>
              {r ? (r.simulated ? 'simulation' : `${r.elapsedMs} ms · this browser`) : analyzing ? 'running…' : 'idle'}
            </span>
          </div>
        </section>

        <aside className="card insight-card" aria-label="AI insights" aria-busy={analyzing} data-present="insight">
          <div className="card-head">
            <h2>AI Insights</h2>
            {r && <span className={`chip ${r.leftDevice ? 'chip-issue' : 'chip-local'}`}>{r.leftDevice ? 'Cloud' : 'On-device'}</span>}
          </div>
          {s.status === 'done' && r ? (
            <>
              <InsightPanel
                report={r}
                onFocusRegions={setFocus}
                onCopied={() => {
                  const d = getState().detections[0];
                  if (d) markDetection(d.id, 'copied-fix');
                  log('action', 'Suggested command copied to clipboard. SafeScreen did not run it.');
                }}
                actions={
                  <Link to="/app/assistant" className="btn btn-ghost btn-sm">
                    <Icon name="message" />
                    Ask about this screen
                  </Link>
                }
              />
              <details className="insight-sec" data-present="processing" open>
                <summary className="label" style={{ cursor: 'pointer' }}>
                  Pipeline trace · measured in this browser
                </summary>
                <Pipeline stages={s.stages} timings={r.timings} backends={r.backends} />
                <p className="tiny subtle">
                  Network during analysis: {r.network.requests} request{r.network.requests === 1 ? '' : 's'}
                  {r.network.external.length ? ` (external: ${r.network.external.join(', ')})` : ', none to other origins'}.
                </p>
              </details>
              <details className="insight-sec recognized">
                <summary className="label" style={{ cursor: 'pointer' }}>
                  Text read from this screen
                </summary>
                <pre>{r.recognizedText || '(no text recognized)'}</pre>
                {r.sensitiveKinds.length > 0 && <p className="tiny subtle">Sensitive values are masked in this view.</p>}
              </details>
            </>
          ) : analyzing ? (
            <div className="analyzing-card" aria-live="polite">
              <p className="btn-row small" style={{ gap: 8 }}>
                <span className="spinner" style={{ color: 'var(--accent-text)' }} aria-hidden="true" />
                {s.isSimulation ? 'Running agents on the prepared scenario…' : 'Analyzing on this device…'}
              </p>
              <Pipeline stages={s.stages} />
              {s.stages.ocr?.status === 'running' && !s.stages.ocr.detail?.includes('Reading') && (
                <p className="tiny subtle">
                  {settings.ocrEngine === 'tesseract'
                    ? 'The first run loads the Tesseract model (about 3 MB) from this site. Later runs start faster.'
                    : `The first run loads Qualcomm AI Hub EasyOCR (25 MB) and ONNX Runtime from this site. ${slowCpu ? `This device reports ${navigator.hardwareConcurrency} CPU threads, so the text detector can take 10 to 30 s here; on a Snapdragon NPU it is designed for milliseconds. Tesseract in Settings is faster on older CPUs.` : 'Later runs start faster.'}`}
                </p>
              )}
              <div className="skeleton" style={{ height: 14, width: '70%' }} />
              <div className="skeleton" style={{ height: 14, width: '90%' }} />
              <div className="skeleton" style={{ height: 14, width: '55%' }} />
            </div>
          ) : s.status === 'error' ? (
            <EmptyState icon="alert" title="No result" error>
              Analysis stopped before a result was ready. Details are shown on the stage.
            </EmptyState>
          ) : (
            <EmptyState icon="scan" title="No detections yet.">
              {s.frame ? 'Select Analyze to see AI insights here.' : 'Start screen analysis to see AI insights here.'}
            </EmptyState>
          )}
        </aside>
      </div>
      {!cloudConfigured && settings.cloudFallback && <p className="tiny subtle" style={{ marginTop: 12 }}>Cloud fallback is allowed in settings but no provider is configured in this build.</p>}
    </div>
  );
}
