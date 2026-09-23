import { Link } from 'react-router-dom';
import { DemoBeforeAfter, HeroVisual, HowItWorks, Performance, PrivacyCompare, PromiseList, TechStack, UseCases, WhySection } from '../components/site/Sections';
import { usePageMeta } from '../lib/usePageMeta';

export default function Home() {
  usePageMeta(
    'SafeScreen Edge | Private AI that understands what’s on your screen',
    'SafeScreen Edge is a privacy-first visual AI assistant for Windows on Snapdragon. It understands screen content, explains errors and flags risky interfaces on your device, without uploading your screen.',
  );

  return (
    <>
      <section className="hero" aria-labelledby="hero-title">
        <div className="container">
          <div className="hero-copy">
            <span className="kicker">Designed for Snapdragon-powered HP PCs</span>
            <h1 id="hero-title" className="display h1">
              AI that understands your screen.
              <br />
              <span style={{ color: 'var(--text-3)' }}>Without sending it away.</span>
            </h1>
            <p className="lead">
              SafeScreen Edge brings private visual intelligence directly to your device. It helps you understand errors, detect risky interfaces, and act on what you see.
            </p>
            <div className="btn-row">
              <Link to="/app/live-analysis" className="btn btn-primary btn-lg">
                Try SafeScreen
              </Link>
              <Link to="/technology" className="btn btn-secondary btn-lg">
                Explore the Technology
              </Link>
            </div>
            <p className="trust">On-device AI · Privacy-first · Designed for the Snapdragon NPU</p>
          </div>
          <HeroVisual />
        </div>
      </section>

      <section className="section alt" aria-labelledby="why-title" id="product">
        <div className="container split-head">
          <div className="section-head">
            <span className="kicker">Why SafeScreen</span>
            <h2 id="why-title" className="display h2">
              Your screen contains context.
              <br />
              SafeScreen understands it.
            </h2>
            <p className="lead">Most help starts with you describing what you see. SafeScreen reads the screen itself, so the help starts where you are.</p>
          </div>
          <WhySection />
        </div>
      </section>

      <section className="section" aria-labelledby="privacy-title" id="privacy">
        <div className="container">
          <div className="section-head center">
            <span className="kicker">Privacy</span>
            <h2 id="privacy-title" className="display h2">
              Intelligence without exposure.
            </h2>
            <p className="lead">Your screen is deeply personal. SafeScreen is designed to keep analysis close to the device.</p>
          </div>
          <PrivacyCompare />
        </div>
      </section>

      <section className="section alt" aria-labelledby="uc-title" id="use-cases">
        <div className="container">
          <div className="section-head">
            <span className="kicker">Use cases</span>
            <h2 id="uc-title" className="display h2">
              One assistant for the screens that slow you down.
            </h2>
          </div>
          <UseCases />
        </div>
      </section>

      <section className="section" aria-labelledby="how-title" id="how-it-works">
        <div className="container">
          <div className="section-head">
            <span className="kicker">How it works</span>
            <h2 id="how-title" className="display h2">
              From pixels to a next step, on your device.
            </h2>
          </div>
          <HowItWorks />
        </div>
      </section>

      <section className="section alt" aria-labelledby="tech-title" id="technology">
        <div className="container">
          <div className="section-head">
            <span className="kicker">Technology</span>
            <h2 id="tech-title" className="display h2">
              Built for AI at the edge.
            </h2>
            <p className="lead">
              Screen understanding is a continuous, private workload, which makes it a good fit for the NPU in Snapdragon X Series HP PCs. The text model comes from Qualcomm AI Hub, and each layer is labeled with what runs today and what is planned.
            </p>
          </div>
          <TechStack />
        </div>
      </section>

      <section className="section-tight" aria-labelledby="perf-title">
        <div className="container">
          <div className="section-head">
            <span className="kicker">Performance</span>
            <h2 id="perf-title" className="display h2">
              Measured on your device.
            </h2>
            <p className="lead">The runtime panel shows only values measured on a real device. Until hardware profiling is done, the NPU figures stay empty.</p>
          </div>
          <Performance />
        </div>
      </section>

      <section className="section" aria-labelledby="demo-title" id="demo">
        <div className="container">
          <div className="section-head">
            <span className="kicker">See it work</span>
            <h2 id="demo-title" className="display h2">
              Before SafeScreen, and after.
            </h2>
          </div>
          <DemoBeforeAfter />
        </div>
      </section>

      <section className="section alt" aria-labelledby="promise-title">
        <div className="container promise">
          <div className="section-head" style={{ marginBottom: 0 }}>
            <span className="kicker">Our promise</span>
            <h2 id="promise-title" className="display h2">
              The most important feature is what we don't collect.
            </h2>
            <p className="lead">SafeScreen is designed so that the safest default is also the one you get without changing anything.</p>
            <p>
              <Link to="/privacy">Read how your data is handled</Link>
            </p>
          </div>
          <PromiseList />
        </div>
      </section>

      <section className="section" aria-labelledby="cta-title">
        <div className="container">
          <div className="cta">
            <h2 id="cta-title" className="display h2">
              A private visual intelligence layer for Windows.
            </h2>
            <p>Open the app, run a scenario or capture your own screen, and watch every stage happen on your device.</p>
            <div className="btn-row" style={{ justifyContent: 'center' }}>
              <Link to="/app/live-analysis" className="btn btn-primary btn-lg">
                Launch Demo
              </Link>
              <Link to="/product" className="btn btn-secondary btn-lg">
                Tour the product
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
