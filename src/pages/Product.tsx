import { Link } from 'react-router-dom';
import { InsightPanel } from '../components/InsightPanel';
import { ScreenPreview } from '../components/ScreenPreview';
import { DemoBeforeAfter } from '../components/site/Sections';
import { getScenario } from '../demo/scenarios';
import { scenarioReport } from '../demo/scenarioReport';
import { usePageMeta } from '../lib/usePageMeta';

function Shot({ id }: { id: string }) {
  const sc = getScenario(id)!;
  const r = scenarioReport(id);
  return (
    <div className="window">
      <div className="window-body" style={{ gridTemplateColumns: 'minmax(0,1fr)' }}>
        <div className="window-screen" style={{ borderRight: 0 }}>
          <ScreenPreview src={sc.image} alt={sc.alt} regions={r.regions} width={sc.width} height={sc.height} />
        </div>
      </div>
    </div>
  );
}

const MODULES = [
  {
    title: 'Live Analysis',
    kicker: 'See it',
    text: 'Capture a screen, window or tab, and SafeScreen draws what it found directly over it: error messages, password fields, primary buttons, warnings. Every region says where its position came from.',
    points: ['Screen capture you start and stop', 'Labeled regions over the screen', 'Pipeline trace with measured stage times'],
    visual: 'shot:suspicious-login',
  },
  {
    title: 'Explanations with evidence',
    kicker: 'Understand it',
    text: 'Each detection answers the same questions: what SafeScreen sees, what it means, why it matters, what to do, and how confident it is. Observations and interpretations are kept apart.',
    points: ['Quoted evidence lines', 'Plain-language terms', 'Confidence level with its reason'],
    visual: 'insight:technical-log',
  },
  {
    title: 'Screen Assistant',
    kicker: 'Ask it',
    text: '"What should I click?" "Find the warning." Questions are answered from the analysis of the screen in front of you, and the areas the answer relies on are highlighted.',
    points: ['Answers grounded in the screen', 'Highlights the relevant regions', 'Works offline'],
    visual: 'shot:enterprise-dashboard',
  },
  {
    title: 'Privacy Center and AI Runtime',
    kicker: 'Control it',
    text: 'Choose what can be captured, exclude apps, set retention, and see exactly which compute backend ran each stage. Nothing is hidden behind a badge.',
    points: ['Local-only by default', 'Excluded applications', 'Audit log of every capture'],
    visual: 'privacy',
  },
];

export default function Product() {
  usePageMeta('Product', 'SafeScreen Edge product tour: live screen analysis, explanations with evidence, a screen-grounded assistant, and privacy and runtime controls.');
  return (
    <>
      <section className="page-hero">
        <div className="container">
          <span className="kicker">Product</span>
          <h1 className="display h1" style={{ fontSize: 'clamp(2.2rem, 5vw, 3.6rem)' }}>
            A desktop assistant that already has the context.
          </h1>
          <p className="lead">SafeScreen Edge runs next to your other apps. When something on screen needs explaining, it already has the context: the error, the form, the prompt.</p>
          <div className="btn-row" style={{ marginTop: 24 }}>
            <Link to="/app/overview" className="btn btn-primary">
              Open the app
            </Link>
            <Link to="/use-cases" className="btn btn-secondary">
              See use cases
            </Link>
          </div>
        </div>
      </section>

      <section className="container" aria-label="Product modules">
        {MODULES.map((m) => (
          <article key={m.title} className="module">
            <div className="copy">
              <span className="kicker">{m.kicker}</span>
              <h2 className="display h3">{m.title}</h2>
              <p className="muted">{m.text}</p>
              <ul>
                {m.points.map((p) => (
                  <li key={p}>
                    {p}
                  </li>
                ))}
              </ul>
            </div>
            {m.visual.startsWith('shot:') ? (
              <Shot id={m.visual.slice(5)} />
            ) : m.visual.startsWith('insight:') ? (
              <div className="window" style={{ maxHeight: 520, overflow: 'hidden' }}>
                <InsightPanel report={scenarioReport(m.visual.slice(8))} compact />
              </div>
            ) : (
              <div className="card card-pad" style={{ display: 'grid', gap: 12 }}>
                <span className="label" style={{ color: 'var(--local)' }}>
                  ● LOCAL PROCESSING
                </span>
                <strong style={{ fontSize: 18 }}>Your screen is being analyzed on-device.</strong>
                <ul className="checks">
                  <li className="yes">
                    No screenshot uploaded
                  </li>
                  <li className="yes">
                    No cloud inference
                  </li>
                  <li className="yes">
                    Capture: only while you allow it
                  </li>
                </ul>
                <Link to="/app/privacy" className="btn btn-secondary btn-sm" style={{ justifySelf: 'start' }}>
                  Open Privacy Center
                </Link>
              </div>
            )}
          </article>
        ))}
      </section>

      <section className="section" aria-labelledby="p-demo">
        <div className="container">
          <div className="section-head">
            <span className="kicker">Try it here</span>
            <h2 id="p-demo" className="display h2">
              Three screens, before and after.
            </h2>
          </div>
          <DemoBeforeAfter />
        </div>
      </section>
    </>
  );
}
