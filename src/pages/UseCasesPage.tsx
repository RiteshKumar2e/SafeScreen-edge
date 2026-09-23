import { Link } from 'react-router-dom';
import { ScreenPreview } from '../components/ScreenPreview';
import { USE_CASES, UseCases } from '../components/site/Sections';
import { getScenario } from '../demo/scenarios';
import { scenarioReport } from '../demo/scenarioReport';
import { usePageMeta } from '../lib/usePageMeta';

const DETAIL: Record<string, { why: string; example: string[] }> = {
  developers: {
    why: 'A traceback is visual context: which file, which line, which package. Reading it from the screen means no copy-paste and no retyping.',
    example: ['Missing Python and Node packages, with the right install name', 'Port conflicts, permission errors, failed database connections', 'Long logs reduced to the lines that matter'],
  },
  security: {
    why: 'Phishing is a visual attack: a page that looks right on a domain that is wrong. Comparing what the page shows with what the address bar says needs both.',
    example: ['Brand on the page vs. the registrable domain', 'Password fields on unencrypted or look-alike domains', 'Elevation prompts from unknown publishers'],
  },
  productivity: {
    why: 'Enterprise tools pack navigation, actions and alerts onto one screen. Knowing which part matters right now depends on where things sit on the screen.',
    example: ['Where navigation is and what each section holds', 'The primary action vs. the one that fixes the problem', 'Banners and failed rows that need attention'],
  },
  accessibility: {
    why: 'Unfamiliar interfaces are harder when you cannot scan them visually. Labeled regions and plain-language summaries make them navigable.',
    example: ['Every region has a spoken label', '"Summarize this page" in plain language', 'Works without sending the screen anywhere'],
  },
  'it-support': {
    why: 'Support usually starts with "send me a screenshot". A first diagnosis on the device, plus an audit log, removes that step for many problems.',
    example: ['Permission prompts explained before anyone clicks Yes', 'Error dialogs decoded on the spot', 'Activity log of what was analyzed, and where'],
  },
};

export default function UseCasesPage() {
  usePageMeta('Use Cases', 'How developers, security-conscious users, busy teams, accessibility users and IT support use SafeScreen Edge.');
  return (
    <>
      <section className="page-hero">
        <div className="container">
          <span className="kicker">Use cases</span>
          <h1 className="display h1" style={{ fontSize: 'clamp(2.2rem, 5vw, 3.6rem)' }}>
            When the screen is the problem.
          </h1>
          <p className="lead">Five situations where understanding the screen, privately and on the device, changes what happens next.</p>
        </div>
      </section>

      <section className="section-tight" aria-label="Interactive use cases">
        <div className="container">
          <UseCases />
        </div>
      </section>

      <section className="section alt" aria-label="Use case details">
        <div className="container">
          {USE_CASES.map((u) => {
            const sc = getScenario(u.scenario)!;
            const r = scenarioReport(u.scenario);
            const d = DETAIL[u.id];
            return (
              <article key={u.id} className="module" id={u.id}>
                <div className="copy">
                  <span className="kicker">{u.title}</span>
                  <h2 className="display h3">{u.line}</h2>
                  <p className="muted">
                    <strong style={{ color: 'var(--text)' }}>Why it needs visual intelligence. </strong>
                    {d.why}
                  </p>
                  <ul>
                    {d.example.map((e) => (
                      <li key={e}>
                        {e}
                      </li>
                    ))}
                  </ul>
                  <Link to={`/app/live-analysis?scenario=${u.scenario}`} className="btn btn-secondary btn-sm" style={{ justifySelf: 'start', marginTop: 8 }}>
                    Try the {sc.title.toLowerCase()} scenario
                  </Link>
                </div>
                <div className="window">
                  <div className="window-body" style={{ gridTemplateColumns: 'minmax(0,1fr)' }}>
                    <div className="window-screen" style={{ borderRight: 0 }}>
                      <ScreenPreview src={sc.image} alt={sc.alt} regions={r.regions} width={sc.width} height={sc.height} />
                      <p className="small" style={{ color: 'var(--text-2)' }}>
                        <strong style={{ color: 'var(--text)' }}>{r.analysis.category}.</strong> {r.analysis.headline}
                      </p>
                    </div>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </>
  );
}
