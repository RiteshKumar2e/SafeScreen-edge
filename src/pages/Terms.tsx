import { Link } from 'react-router-dom';
import { ContactEmail } from '../components/ContactEmail';
import { usePageMeta } from '../lib/usePageMeta';

export default function Terms() {
  usePageMeta('Terms of Service', 'Draft Terms of Service for SafeScreen Edge, including the advisory nature of its AI analysis.');

  return (
    <>
      <section className="page-hero">
        <div className="container">
          <span className="kicker">Legal</span>
          <h1 className="display h1" style={{ fontSize: 'clamp(2.2rem, 5vw, 3.4rem)' }}>
            Terms of Service
          </h1>
          <p className="lead">
            <span className="draft-tag">Draft for review</span> These terms are a working draft for an early product. They have not been reviewed by a lawyer.
          </p>
        </div>
      </section>
      <div className="container prose" style={{ paddingBottom: 24 }}>
        <h2 style={{ marginTop: 0 }}>1. About the service</h2>
        <p>
          SafeScreen Edge ("the service") is a assistant that analyzes screens you choose to capture or provide and offers explanations and
          suggestions. It is provided for demonstration and evaluation.
        </p>
        <p>
          Operator: <span className="draft-tag">Draft for review</span>
        </p>

        <h2>2. Advisory analysis only</h2>
        <p>
          AI analysis is advisory. Results may be incomplete or wrong. SafeScreen can flag signals it sees, but it cannot confirm
          whether a website, program or message is legitimate or malicious. Verify important security, financial and technical
          decisions independently.
        </p>
        <p>
          The service is not antivirus software, a firewall, or a substitute for professional security, legal or financial advice.
        </p>

        <h2>3. Commands and suggested actions</h2>
        <p>
          Suggested commands are provided for your review. Only run them in environments you trust and after you understand what
          they do. You are responsible for actions you take on your own systems.
        </p>

        <h2>4. Your content</h2>
        <p>
          You keep all rights to screenshots you analyze. Only analyze content you are allowed to view and process. How content is
          handled in each mode is described in the <Link to="/privacy">privacy and data page</Link>.
        </p>

        <h2>5. Acceptable use</h2>
        <p>Do not use the service to process content you have no right to access, or to attempt to disrupt the service.</p>

        <h2>6. No warranty</h2>
        <p>
          The service is provided "as is", without warranties of any kind, to the extent permitted by applicable law.{' '}
          <span className="draft-tag">Draft for review</span>
        </p>

        <h2>7. Limitation of liability</h2>
        <p>
          <span className="draft-tag">Draft for review</span> Liability terms depend on the operator and governing law, which have not
          been determined.
        </p>

        <h2>8. Governing law</h2>
        <p>
          <span className="draft-tag">Draft for review</span>
        </p>

        <h2>9. Contact</h2>
        <p>
          <ContactEmail />
        </p>
      </div>
    </>
  );
}
