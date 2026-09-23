import type { Box, UiElement } from '../inference/types';

export interface LayoutRow {
  x: number;
  y: number;
  size: number;
  mono?: boolean;
  anchor?: 'middle';
}

export interface DemoScenario {
  id: string;
  title: string;
  shortTitle: string;
  audience: string;
  /** One line describing what SafeScreen shows for this screen. */
  pitch: string;
  image: string;
  width: number;
  height: number;
  alt: string;
  /** Where each transcript line is drawn in the image, in image pixels. */
  layout: LayoutRow[];
  /** Text as OCR would read it from the image. Used for deterministic demos. */
  transcript: string;
  /** Stand-in for vision model output. Always labeled as simulated. */
  uiElements: UiElement[];
}

const sim = 'Simulated vision annotation' as const;

/** Pixel rect to normalized box. */
const px = (x: number, y: number, w: number, h: number, W: number, H: number): Box => ({ x: x / W, y: y / H, w: w / W, h: h / H });
const rows = (n: number, x: number, y0: number, step: number, size: number, mono = true): LayoutRow[] =>
  Array.from({ length: n }, (_, i) => ({ x, y: y0 + i * step, size, mono }));

export const SCENARIOS: DemoScenario[] = [
  {
    id: 'developer-error',
    title: 'Developer error',
    shortTitle: 'Developer error',
    audience: 'Developers and students',
    pitch: 'A Python traceback becomes a diagnosis and a copyable fix.',
    image: '/demo/developer-error.svg',
    width: 1200,
    height: 400,
    layout: rows(6, 28, 96, 38, 21),
    alt: 'A terminal window showing a Python traceback that ends with ModuleNotFoundError: No module named pandas.',
    transcript: `PS C:\\Users\\dev\\projects\\sales-report> python analyze.py
Traceback (most recent call last):
  File "C:\\Users\\dev\\projects\\sales-report\\analyze.py", line 3, in <module>
    import pandas as pd
ModuleNotFoundError: No module named 'pandas'
PS C:\\Users\\dev\\projects\\sales-report>`,
    uiElements: [{ kind: 'terminal', label: 'PowerShell terminal', source: sim, box: px(8, 48, 1184, 344, 1200, 400) }],
  },
  {
    id: 'suspicious-login',
    title: 'Suspicious login',
    shortTitle: 'Suspicious login',
    audience: 'Everyday PC users',
    pitch: 'A familiar-looking sign-in page on an unfamiliar domain.',
    image: '/demo/suspicious-login.svg',
    width: 1200,
    height: 760,
    layout: [
      { x: 118, y: 77, size: 17 },
      { x: 456, y: 201, size: 22 },
      { x: 424, y: 252, size: 27 },
      { x: 436, y: 302, size: 15 },
      { x: 436, y: 326, size: 15 },
      { x: 424, y: 384, size: 16 },
      { x: 424, y: 468, size: 16 },
      { x: 716, y: 573, size: 16, anchor: 'middle' },
      { x: 424, y: 628, size: 15 },
    ],
    alt: 'A browser showing a sign-in page styled as Microsoft, at the address microsoft-account.secure-verify-login.co, with a warning about unusual sign-in activity and email and password fields.',
    transcript: `https://microsoft-account.secure-verify-login.co/signin?session=8842
Microsoft
Sign in to continue
Unusual sign-in activity detected. Verify your
account within 24 hours to avoid suspension.
Email or phone
Password
Sign in
Can't access your account?`,
    uiElements: [
      { kind: 'address-bar', label: 'Browser address bar', source: sim, box: px(96, 54, 1050, 34, 1200, 760) },
      { kind: 'login-form', label: 'Login form', source: sim, box: px(380, 140, 440, 540, 1200, 760) },
      { kind: 'text-field', label: 'Email field', source: sim, box: px(424, 394, 352, 38, 1200, 760) },
      { kind: 'password-field', label: 'Password field', source: sim, box: px(424, 478, 352, 38, 1200, 760) },
    ],
  },
  {
    id: 'security-warning',
    title: 'Security warning',
    shortTitle: 'Security warning',
    audience: 'Professionals and everyday users',
    pitch: 'An elevation prompt for an installer from an unknown publisher.',
    image: '/demo/security-warning.svg',
    width: 1200,
    height: 720,
    layout: [
      { x: 330, y: 130, size: 16 },
      { x: 330, y: 180, size: 23 },
      { x: 330, y: 212, size: 23 },
      { x: 330, y: 244, size: 23 },
      { x: 330, y: 326, size: 17 },
      { x: 330, y: 366, size: 17 },
      { x: 330, y: 406, size: 17 },
      { x: 330, y: 456, size: 16 },
      { x: 460, y: 570, size: 17, anchor: 'middle' },
      { x: 740, y: 570, size: 17, anchor: 'middle' },
    ],
    alt: 'A Windows User Account Control dialog asking whether to allow QuickPDF_Converter_Setup.exe from an unknown publisher to make changes to the device.',
    transcript: `User Account Control
Do you want to allow this app from an
unknown publisher to make changes to
your device?
Program name: QuickPDF_Converter_Setup.exe
Publisher: Unknown
File origin: Downloaded from the Internet
Show more details
Yes
No`,
    uiElements: [
      { kind: 'dialog', label: 'System permission dialog', source: sim, box: px(300, 90, 600, 540, 1200, 720) },
      { kind: 'button', label: 'Yes button', source: sim, box: px(330, 540, 260, 46, 1200, 720) },
    ],
  },
  {
    id: 'technical-log',
    title: 'Complex technical log',
    shortTitle: 'Technical log',
    audience: 'Developers',
    pitch: 'Twenty-three lines of container logs, one root cause.',
    image: '/demo/technical-log.svg',
    width: 1500,
    height: 880,
    layout: rows(23, 22, 80, 34, 14.5),
    alt: 'A terminal showing docker compose logs for an API service. The service fails at startup with a PostgreSQL connection refused error and exits with code 3.',
    transcript: `$ docker compose logs api
api-1  | INFO:     Started server process [1]
api-1  | INFO:     Waiting for application startup.
api-1  | 2026-09-22 14:03:11,482 INFO  app.main: Loading settings from environment
api-1  | 2026-09-22 14:03:11,490 INFO  app.db.session: Creating engine for postgresql://app:***@localhost:5432/orders
api-1  | 2026-09-22 14:03:11,512 WARN  app.cache: REDIS_URL not set, using in-memory cache
api-1  | ERROR:    Traceback (most recent call last):
api-1  |   File "/usr/local/lib/python3.12/site-packages/starlette/routing.py", line 693, in lifespan
api-1  |     async with self.lifespan_context(app) as maybe_state:
api-1  |   File "/app/app/main.py", line 28, in lifespan
api-1  |     await init_db()
api-1  |   File "/app/app/db/session.py", line 42, in init_db
api-1  |     async with engine.begin() as conn:
api-1  |   File "/usr/local/lib/python3.12/site-packages/sqlalchemy/ext/asyncio/engine.py", line 1066, in begin
api-1  |     conn = await self._connect()
api-1  | ConnectionRefusedError: [Errno 111] Connection refused
api-1  |
api-1  | The above exception was the direct cause of the following exception:
api-1  |
api-1  | sqlalchemy.exc.OperationalError: (psycopg.OperationalError) connection failed: connection to server at "127.0.0.1", port 5432 failed: Connection refused
api-1  |     Is the server running on that host and accepting TCP/IP connections?
api-1  | ERROR:    Application startup failed. Exiting.
api-1 exited with code 3`,
    uiElements: [{ kind: 'terminal', label: 'Terminal window', source: sim, box: px(8, 48, 1484, 824, 1500, 880) }],
  },
  {
    id: 'enterprise-dashboard',
    title: 'Complex dashboard',
    shortTitle: 'Complex UI',
    audience: 'Productivity and accessibility',
    pitch: 'A busy cloud console, summarized: navigation, main action, and the one message that matters.',
    image: '/demo/enterprise-dashboard.svg',
    width: 1280,
    height: 800,
    alt: 'A cloud console dashboard named Northwind Console with a sidebar, a Create Project button, a red banner saying the payment method was declined, three summary cards and a deployments table where api-gateway failed.',
    layout: [
      { x: 54, y: 39, size: 18 },
      { x: 48, y: 112, size: 16 },
      { x: 48, y: 152, size: 16 },
      { x: 48, y: 192, size: 16 },
      { x: 48, y: 232, size: 16 },
      { x: 48, y: 272, size: 16 },
      { x: 260, y: 112, size: 26 },
      { x: 1165, y: 111, size: 16, anchor: 'middle' },
      { x: 284, y: 170, size: 16 },
      { x: 284, y: 194, size: 14 },
      { x: 1165, y: 181, size: 15, anchor: 'middle' },
      { x: 284, y: 262, size: 14 },
      { x: 284, y: 306, size: 30 },
      { x: 624, y: 262, size: 14 },
      { x: 624, y: 306, size: 30 },
      { x: 964, y: 262, size: 14 },
      { x: 964, y: 306, size: 30 },
      { x: 284, y: 386, size: 18 },
      { x: 284, y: 430, size: 14, mono: true },
      { x: 284, y: 470, size: 14, mono: true },
      { x: 284, y: 510, size: 14, mono: true },
    ],
    transcript: `Northwind Console
Dashboard
Projects
Deployments
Billing
Settings
Workspace overview
Create Project
Payment method declined. Deployments will pause on Oct 1.
Update billing details to keep production services running.
Update billing
Active projects
12
Deployments this week
48
Open incidents
1
Recent deployments
web-frontend Succeeded 2 min ago
api-gateway Failed 14 min ago
worker-queue Succeeded 1 hr ago`,
    uiElements: [{ kind: 'navigation', label: 'Sidebar navigation', source: sim, box: px(0, 64, 220, 736, 1280, 800) }],
  },
];

export function getScenario(id: string | undefined | null): DemoScenario | undefined {
  return SCENARIOS.find((s) => s.id === id);
}
