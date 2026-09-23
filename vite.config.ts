import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Production Content Security Policy. The page may only connect to its own
 * origin (plus the cloud fallback endpoint, if one is configured), so screen
 * content cannot be sent anywhere else by this app. Dev builds skip it
 * because Vite's HMR needs inline scripts and a websocket.
 *
 * 'unsafe-eval' is required by the Tesseract worker (its bundled async
 * runtime calls Function()). It does not widen where data can be sent:
 * connect-src still limits every request to this origin.
 */
function csp(cloudEndpoint: string | undefined): Plugin {
  const cloud = cloudEndpoint ? ` ${new URL(cloudEndpoint).origin}` : '';
  const policy = [
    "default-src 'self'",
    "script-src 'self' 'wasm-unsafe-eval' 'unsafe-eval' blob:",
    "worker-src 'self' blob:",
    `connect-src 'self' blob: data:${cloud}`,
    "img-src 'self' blob: data:",
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');
  return {
    name: 'safescreen-csp',
    apply: 'build',
    transformIndexHtml: (html) => html.replace('<meta charset="UTF-8" />', `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${policy}" />`),
  };
}

/**
 * Social previews need absolute URLs. When VITE_SITE_URL is set (for example
 * https://safescreen.example), og:image becomes absolute and og:url is
 * added. Without it the relative image path is kept.
 */
function siteUrl(url: string | undefined): Plugin {
  return {
    name: 'safescreen-site-url',
    transformIndexHtml: (html) => {
      if (!url) return html;
      const base = url.replace(/\/+$/, '');
      return html
        .replace('content="/og.png"', `content="${base}/og.png"`)
        .replace(
          '<meta name="twitter:card"',
          `<meta property="og:url" content="${base}/" />
    <meta name="twitter:card"`,
        );
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  return {
    plugins: [react(), csp(env.VITE_CLOUD_DEMO_ENDPOINT), siteUrl(env.VITE_SITE_URL)],
  };
});
