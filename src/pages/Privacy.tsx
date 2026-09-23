import { Link } from 'react-router-dom';
import { ContactEmail } from '../components/ContactEmail';
import { Icon } from '../components/Icon';
import { PrivacyCompare, PromiseList } from '../components/site/Sections';
import { usePageMeta } from '../lib/usePageMeta';

export default function Privacy() {
  usePageMeta(
    'Privacy',
    'How SafeScreen Edge handles your screen: local-first processing, user-controlled capture, excluded apps, retention controls, and the draft privacy policy.',
  );

  return (
    <>
      <section className="page-hero">
        <div className="container">
          <span className="kicker">Privacy</span>
          <h1 className="display h1" style={{ fontSize: 'clamp(2.2rem, 5vw, 3.6rem)' }}>
            Your screen stays on your device.
          </h1>
          <p className="lead">
            SafeScreen Edge is designed so screen content is processed locally. There is no automatic upload, capture only happens when you start it, and every control defaults to the private option.
          </p>
        </div>
      </section>

      <section className="section-tight" aria-labelledby="flow">
        <div className="container">
          <h2 id="flow" className="visually-hidden">
            Data flow compared
          </h2>
          <PrivacyCompare />
        </div>
      </section>

      <section className="section alt" aria-labelledby="modes">
        <div className="container grid-2" style={{ alignItems: 'start' }}>
          <div className="prose">
            <span className="kicker">Where processing happens</span>
            <h2 id="modes" className="display h3" style={{ marginTop: 12 }}>
              Three ways a screen can be analyzed
            </h2>
            <p>The app always shows which one produced a result, in the result itself and in the Activity log.</p>
          </div>
          <div className="card table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th scope="col">Mode</th>
                  <th scope="col">Where it runs</th>
                  <th scope="col">Leaves device</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th scope="row">Local (default)</th>
                  <td>This device: Qualcomm AI Hub text model and agents in the browser, or the Windows host</td>
                  <td>
                    <span className="chip chip-local">No</span>
                  </td>
                </tr>
                <tr>
                  <th scope="row">Demo simulation</th>
                  <td>This device, using prepared screens</td>
                  <td>
                    <span className="chip chip-local">No</span>
                  </td>
                </tr>
                <tr>
                  <th scope="row">Cloud fallback</th>
                  <td>An external provider a developer configured. Off by default, blocked by local-only mode, and asks before each frame</td>
                  <td>
                    <span className="chip chip-issue">Yes, with approval</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="section" aria-labelledby="promise">
        <div className="container promise">
          <div className="section-head" style={{ marginBottom: 0 }}>
            <span className="kicker">Promise</span>
            <h2 id="promise" className="display h2">
              The most important feature is what we don't collect.
            </h2>
            <p className="lead">
              We avoid absolute claims. Masking is pattern-based and can miss things, and a browser extension or the operating system could still see your screen. What SafeScreen controls, it keeps local.
            </p>
            <p>
              <Link to="/app/privacy" className="btn btn-secondary btn-sm">
                <Icon name="shield" />
                Open the Privacy Center
              </Link>
            </p>
          </div>
          <PromiseList />
        </div>
      </section>

      <section className="section alt" aria-labelledby="policy">
        <div className="container prose">
          <h2 id="policy" style={{ marginTop: 0 }}>
            What SafeScreen keeps
          </h2>
          <ul>
            <li>Raw screen frames are held in memory for the current analysis only. They are never written to storage.</li>
            <li>
              With <strong>Analysis history</strong> on (default), text results such as the category, headline, quoted evidence and recommended actions are kept in this browser for the retention
              period you choose (default 7 days). Sensitive values are masked first.
            </li>
            <li>
              With <strong>Store screenshots</strong> on (off by default), a 240-pixel thumbnail is kept with each detection, in this browser only.
            </li>
            <li>The Activity log records when capture started and stopped and where each frame was processed. It contains no screen content.</li>
            <li>There are no accounts, analytics or tracking scripts. Clearing history or resetting in Settings deletes everything above.</li>
          </ul>

          <h2>Network access</h2>
          <p>
            The production build sets a Content Security Policy that only allows the page to connect to its own origin, plus a cloud fallback endpoint if one is configured. The OCR engine and model are
            served from the same origin, so analyzing a screen does not contact any third party.
          </p>

          <h2>
            Privacy policy <span className="draft-tag">Draft for review</span>
          </h2>
          <p>This draft describes the product's behavior. It has not been reviewed by a lawyer and does not yet name an operator, jurisdiction or hosting retention period.</p>
          <h3>Information we process</h3>
          <p>
            In local and demo modes, screen images and recognized text are processed on your device and are not sent to the operator. If cloud fallback is enabled and you approve an upload, that frame
            is sent to the configured provider, whose terms and retention apply.
          </p>
          <h3>Hosting logs</h3>
          <p>
            The web host serving this site may record standard request logs such as IP address and requested page. Retention: <span className="draft-tag">Draft for review</span>
          </p>
          <h3>Contact</h3>
          <p>
            <ContactEmail />
          </p>
          <p className="note" style={{ marginTop: 24 }}>
            <strong>AI analysis is advisory.</strong> SafeScreen can point out signals, but it cannot confirm whether a website or program is legitimate. Verify important security decisions independently.
          </p>
        </div>
      </section>
    </>
  );
}
