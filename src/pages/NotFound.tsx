import { Link } from 'react-router-dom';
import { Icon } from '../components/Icon';
import { usePageMeta } from '../lib/usePageMeta';

export default function NotFound() {
  usePageMeta('Page not found', 'The page you were looking for does not exist on SafeScreen Edge.');
  return (
    <section className="container notfound">
      <div style={{ display: 'grid', gap: 16, justifyItems: 'center' }}>
        <span className="code">404</span>
        <h1 className="display h2">Nothing on this screen.</h1>
        <p className="lead">The page you were looking for does not exist or has moved.</p>
        <div className="btn-row" style={{ justifyContent: 'center' }}>
          <Link to="/" className="btn btn-primary">
            <Icon name="arrowLeft" />
            Back to home
          </Link>
          <Link to="/app/overview" className="btn btn-secondary">
            Open the app
          </Link>
        </div>
      </div>
    </section>
  );
}
