import { lazy, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { SiteLayout } from './components/SiteLayout';
import { EmptyState, ToastProvider } from './components/ui';
import Home from './pages/Home';
import './styles/base.css';
import './styles/site.css';
import './styles/app.css';

const Product = lazy(() => import('./pages/Product'));
const Technology = lazy(() => import('./pages/Technology'));
const Privacy = lazy(() => import('./pages/Privacy'));
const UseCasesPage = lazy(() => import('./pages/UseCasesPage'));
const About = lazy(() => import('./pages/About'));
const Terms = lazy(() => import('./pages/Terms'));
const NotFound = lazy(() => import('./pages/NotFound'));

const AppLayout = lazy(() => import('./app/AppLayout'));
const Overview = lazy(() => import('./pages/app/Overview'));
const Assistant = lazy(() => import('./pages/app/Assistant'));
const LiveAnalysis = lazy(() => import('./pages/app/LiveAnalysis'));
const Detections = lazy(() => import('./pages/app/Detections'));
const Activity = lazy(() => import('./pages/app/Activity'));
const PrivacyCenter = lazy(() => import('./pages/app/PrivacyCenter'));
const Runtime = lazy(() => import('./pages/app/Runtime'));
const Settings = lazy(() => import('./pages/app/Settings'));

/** Old /demo links keep working and land in the app. */
function DemoRedirect() {
  const { search } = useLocation();
  return <Navigate to={`/app/live-analysis${search}`} replace />;
}

function AppNotFound() {
  return (
    <div className="page">
      <div className="card">
        <EmptyState
          icon="search"
          title="This page does not exist"
          actions={
            <Link to="/app/overview" className="btn btn-primary btn-sm">
              Go to Overview
            </Link>
          }
        >
          Use the sidebar or press Ctrl K to find what you need.
        </EmptyState>
      </div>
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <ToastProvider>
        <Routes>
          <Route element={<SiteLayout />}>
            <Route index element={<Home />} />
            <Route path="product" element={<Product />} />
            <Route path="technology" element={<Technology />} />
            <Route path="privacy" element={<Privacy />} />
            <Route path="use-cases" element={<UseCasesPage />} />
            <Route path="about" element={<About />} />
            <Route path="terms" element={<Terms />} />
            <Route path="demo" element={<DemoRedirect />} />
            <Route path="how-it-works" element={<Navigate to="/technology" replace />} />
            <Route path="404" element={<NotFound />} />
            <Route path="*" element={<NotFound />} />
          </Route>
          <Route path="app" element={<AppLayout />}>
            <Route index element={<Navigate to="/app/overview" replace />} />
            <Route path="overview" element={<Overview />} />
            <Route path="assistant" element={<Assistant />} />
            <Route path="live-analysis" element={<LiveAnalysis />} />
            <Route path="detections" element={<Detections />} />
            <Route path="activity" element={<Activity />} />
            <Route path="privacy" element={<PrivacyCenter />} />
            <Route path="runtime" element={<Runtime />} />
            <Route path="settings" element={<Settings />} />
            <Route path="*" element={<AppNotFound />} />
          </Route>
        </Routes>
      </ToastProvider>
    </BrowserRouter>
  </StrictMode>,
);
