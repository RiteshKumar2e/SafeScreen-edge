import { Link } from 'react-router-dom';
import { ContactEmail } from '../components/ContactEmail';
import { usePageMeta } from '../lib/usePageMeta';

const NOT_CLAIMED = [
  ['We do not claim NPU acceleration in the browser build.', 'The browser build runs on the CPU through WebAssembly. NPU execution comes with the Windows host, and the app shows which backend ran.'],
  ['We do not publish benchmark numbers we have not measured.', 'Performance panels stay empty until real measurements exist. Times shown in the app were measured on your device.'],
  ['We do not call a website malicious.', 'SafeScreen reports risk indicators and says what to verify. Appearance alone is not proof.'],
  ['We do not present simulations as live inference.', 'Demo scenarios use prepared transcripts and annotations, and are labeled "Demo Simulation" wherever they appear.'],
  ['We do not claim to be 100% private.', 'We keep what SafeScreen controls on the device, and we say where the limits are.'],
];

export default function About() {
  usePageMeta('About', 'Why SafeScreen Edge exists, the principles behind it, and what it deliberately does not claim.');
  return (
    <>
      <section className="page-hero">
        <div className="container">
          <span className="kicker">About</span>
          <h1 className="display h1" style={{ fontSize: 'clamp(2.2rem, 5vw, 3.6rem)' }}>
            Help should not require handing over your screen.
          </h1>
          <p className="lead">
            AI assistants got good at explaining things once you describe them. Screens already contain the description, but they also contain everything else. SafeScreen Edge exists to use that
            context without sending it away.
          </p>
        </div>
      </section>

      <section className="section-tight" aria-labelledby="principles">
        <div className="container">
          <h2 id="principles" className="display h3" style={{ marginBottom: 20 }}>
            Principles
          </h2>
          <dl className="rows">
            {[
              ['Local by default', 'The private choice is the one you get without changing a setting.'],
              ['Show the evidence', 'Every conclusion quotes what it was based on and says how confident it is.'],
              ['People stay in control', 'SafeScreen recommends. It never runs, submits or types anything for you.'],
            ].map(([t, d]) => (
              <div key={t}>
                <dt>{t}</dt>
                <dd>{d}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section className="section alt" aria-labelledby="claims">
        <div className="container grid-2" style={{ alignItems: 'start' }}>
          <div className="section-head" style={{ marginBottom: 0 }}>
            <span className="kicker">Honesty policy</span>
            <h2 id="claims" className="display h2">
              What we deliberately don't claim.
            </h2>
            <p className="lead">SafeScreen Edge was built for the Snapdragon AI hackathon, with the goal of being a credible first version of a real product. That means being exact about what works today.</p>
          </div>
          <ul className="not-claim">
            {NOT_CLAIMED.map(([t, d]) => (
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

      <section className="section" aria-labelledby="contact" id="contact">
        <div className="container">
          <div className="cta">
            <h2 id="contact" className="display h2">
              Contact
            </h2>
            <p>
              <ContactEmail />
            </p>
            <div className="btn-row" style={{ justifyContent: 'center' }}>
              <Link to="/app/live-analysis" className="btn btn-primary">
                Launch Demo
              </Link>
              <Link to="/technology" className="btn btn-secondary">
                Read the technology overview
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
