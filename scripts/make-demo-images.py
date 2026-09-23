"""Generates the demo scenario screenshots as SVG. The text drawn here must
match the prepared transcripts in src/demo/scenarios.ts line for line."""
from pathlib import Path
from xml.sax.saxutils import escape

OUT = Path(__file__).resolve().parent.parent / "public" / "demo"
OUT.mkdir(parents=True, exist_ok=True)
MONO = "Consolas, 'Cascadia Mono', 'Courier New', monospace"
SANS = "'Segoe UI', Arial, Helvetica, sans-serif"


def svg(w, h, body, label):
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}" '
        f'role="img" aria-label="{escape(label)}">{body}</svg>\n'
    )


def text(x, y, s, size, fill, family=SANS, weight="400", anchor="start"):
    return (
        f'<text x="{x}" y="{y}" font-family="{family}" font-size="{size}" font-weight="{weight}" '
        f'text-anchor="{anchor}" fill="{fill}" xml:space="preserve">{escape(s)}</text>'
    )


def window(w, h, title):
    return (
        f'<rect width="{w}" height="{h}" fill="#1c1c1c"/>'
        f'<rect width="{w}" height="40" fill="#2b2b2b"/>'
        + text(18, 26, title, 15, "#d4d4d4")
        + f'<g stroke="#bdbdbd" stroke-width="1.5" fill="none"><path d="M{w-126} 20h12"/>'
        f'<rect x="{w-80}" y="14" width="12" height="12"/><path d="M{w-34} 14l12 12M{w-22} 14l-12 12"/></g>'
    )


def term(lines, x, y, size, lh, color):
    return "".join(text(x, y + i * lh, line, size, color(line), MONO) for i, line in enumerate(lines))


# 1. Developer error
dev = [
    r"PS C:\Users\dev\projects\sales-report> python analyze.py",
    "Traceback (most recent call last):",
    r'  File "C:\Users\dev\projects\sales-report\analyze.py", line 3, in <module>',
    "    import pandas as pd",
    "ModuleNotFoundError: No module named 'pandas'",
    r"PS C:\Users\dev\projects\sales-report>",
]
w, h = 1200, 400
body = window(w, h, "Windows PowerShell") + term(
    dev, 28, 96, 21, 38, lambda l: "#f59f97" if l.startswith("ModuleNotFound") else "#e8e8e8"
)
(OUT / "developer-error.svg").write_text(
    svg(w, h, body, "Terminal showing ModuleNotFoundError: No module named pandas"), encoding="utf8"
)

# 2. Suspicious login (simulated; no real logo artwork)
w, h = 1200, 760
url = "https://microsoft-account.secure-verify-login.co/signin?session=8842"
body = (
    f'<rect width="{w}" height="{h}" fill="#f3f2ef"/>'
    f'<rect width="{w}" height="44" fill="#e3e1dc"/>'
    f'<rect x="14" y="8" width="260" height="36" rx="8" fill="#f3f2ef"/>'
    + text(32, 32, "Sign in to your account", 14, "#333")
    + f'<rect x="96" y="54" width="{w-150}" height="34" rx="17" fill="#fff" stroke="#d6d3cc"/>'
    f'<g fill="none" stroke="#555" stroke-width="2"><path d="M26 71h18M26 71l7-7M26 71l7 7"/></g>'
    + text(118, 77, url, 17, "#222")
    + f'<rect x="0" y="96" width="{w}" height="{h-96}" fill="#e9eef3"/>'
    f'<rect x="380" y="140" width="440" height="540" fill="#fff" stroke="#d7dde3"/>'
    f'<rect x="424" y="182" width="22" height="22" fill="#7a7a7a"/>'
    + text(456, 201, "Microsoft", 22, "#5e5e5e", weight="600")
    + text(424, 252, "Sign in to continue", 27, "#1b1b1b", weight="600")
    + f'<rect x="424" y="274" width="352" height="72" fill="#fff4ce"/>'
    + text(438, 302, "Unusual sign-in activity detected. Verify your", 15.5, "#3b3000")
    + text(438, 326, "account within 24 hours to avoid suspension.", 15.5, "#3b3000")
    + text(424, 384, "Email or phone", 16, "#333")
    + f'<rect x="424" y="394" width="352" height="38" fill="#fff" stroke="#8a8a8a"/>'
    + text(424, 468, "Password", 16, "#333")
    + f'<rect x="424" y="478" width="352" height="38" fill="#fff" stroke="#8a8a8a"/>'
    f'<rect x="656" y="548" width="120" height="38" fill="#0067b8"/>'
    + text(716, 573, "Sign in", 16, "#fff", anchor="middle")
    + text(424, 628, "Can't access your account?", 15, "#0067b8")
)
(OUT / "suspicious-login.svg").write_text(
    svg(w, h, body, "Simulated suspicious sign-in page"), encoding="utf8"
)

# 3. Security warning (elevation prompt)
w, h = 1200, 720
body = (
    f'<rect width="{w}" height="{h}" fill="#4a4f55"/>'
    f'<rect x="300" y="90" width="600" height="540" fill="#ffffff"/>'
    f'<rect x="300" y="90" width="600" height="190" fill="#f6e7c1"/>'
    + text(330, 130, "User Account Control", 16, "#222")
    + text(330, 180, "Do you want to allow this app from an", 23, "#111", weight="600")
    + text(330, 212, "unknown publisher to make changes to", 23, "#111", weight="600")
    + text(330, 244, "your device?", 23, "#111", weight="600")
    + text(330, 326, "Program name: QuickPDF_Converter_Setup.exe", 17, "#222")
    + text(330, 366, "Publisher: Unknown", 17, "#222")
    + text(330, 406, "File origin: Downloaded from the Internet", 17, "#222")
    + text(330, 456, "Show more details", 16, "#0a5aa6")
    + f'<rect x="330" y="540" width="260" height="46" fill="#e1e1e1" stroke="#adadad"/>'
    + text(460, 570, "Yes", 17, "#111", anchor="middle")
    + f'<rect x="610" y="540" width="260" height="46" fill="#e1e1e1" stroke="#adadad"/>'
    + text(740, 570, "No", 17, "#111", anchor="middle")
)
(OUT / "security-warning.svg").write_text(
    svg(w, h, body, "Simulated permission prompt for an app from an unknown publisher"), encoding="utf8"
)

# 4. Technical log
log = """$ docker compose logs api
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
api-1 exited with code 3""".split("\n")


def logcolor(line):
    if any(k in line for k in ("Error", "ERROR", "refused", "exited")):
        return "#f59f97"
    if "WARN" in line:
        return "#e6c07b"
    return "#dcdcdc"


w, h = 1500, 880
body = window(w, h, "Terminal - orders-service") + term(log, 22, 80, 14.5, 34, logcolor)
(OUT / "technical-log.svg").write_text(
    svg(w, h, body, "Terminal showing docker compose logs with a PostgreSQL connection refused error"),
    encoding="utf8",
)
print("wrote", sorted(p.name for p in OUT.iterdir()))

# 5. Enterprise dashboard (complex UI)
w, h = 1280, 800
BLUE = "#2f5bd3"
dash = (
    f'<rect width="{w}" height="{h}" fill="#f5f6f8"/>'
    f'<rect width="{w}" height="64" fill="#ffffff"/><rect y="63" width="{w}" height="1" fill="#e2e4e9"/>'
    f'<rect x="24" y="22" width="20" height="20" rx="5" fill="{BLUE}"/>'
    + text(54, 39, "Northwind Console", 18, "#15171c", weight="600")
    + f'<rect x="0" y="64" width="220" height="{h-64}" fill="#ffffff"/><rect x="219" y="64" width="1" height="{h-64}" fill="#e2e4e9"/>'
    + f'<rect x="16" y="90" width="188" height="34" rx="6" fill="#eaf0fd"/>'
    + text(48, 112, "Dashboard", 16, BLUE, weight="600")
    + text(48, 152, "Projects", 16, "#3a3f4b")
    + text(48, 192, "Deployments", 16, "#3a3f4b")
    + text(48, 232, "Billing", 16, "#3a3f4b")
    + text(48, 272, "Settings", 16, "#3a3f4b")
    + text(260, 112, "Workspace overview", 26, "#15171c", weight="600")
    + f'<rect x="1080" y="86" width="170" height="40" rx="6" fill="{BLUE}"/>'
    + text(1165, 111, "Create Project", 16, "#ffffff", weight="600", anchor="middle")
    + f'<rect x="260" y="140" width="990" height="72" rx="8" fill="#fdecec" stroke="#f0b8b8"/>'
    + f'<rect x="260" y="140" width="4" height="72" fill="#c62f2f"/>'
    + text(284, 170, "Payment method declined. Deployments will pause on Oct 1.", 16, "#7a1717", weight="600")
    + text(284, 194, "Update billing details to keep production services running.", 14, "#7a1717")
    + f'<rect x="1100" y="156" width="130" height="40" rx="6" fill="#ffffff" stroke="#d99"/>'
    + text(1165, 181, "Update billing", 15, "#7a1717", weight="600", anchor="middle")
    + "".join(
        f'<rect x="{x}" y="232" width="320" height="100" rx="8" fill="#ffffff" stroke="#e2e4e9"/>'
        + text(x + 24, 262, label, 14, "#5b6170")
        + text(x + 24, 306, value, 30, "#15171c", weight="600")
        for x, label, value in [(260, "Active projects", "12"), (600, "Deployments this week", "48"), (940, "Open incidents", "1")]
    )
    + f'<rect x="260" y="352" width="990" height="200" rx="8" fill="#ffffff" stroke="#e2e4e9"/>'
    + text(284, 386, "Recent deployments", 18, "#15171c", weight="600")
    + "".join(
        f'<rect x="260" y="{y-26}" width="990" height="1" fill="#eef0f3"/>'
        + text(284, y, svc, 14, "#15171c", family=MONO)
        + text(520, y, status, 14, "#c62f2f" if status == "Failed" else "#1f7a4d", weight="600")
        + text(700, y, ago, 14, "#5b6170")
        for y, svc, status, ago in [(430, "web-frontend", "Succeeded", "2 min ago"), (470, "api-gateway", "Failed", "14 min ago"), (510, "worker-queue", "Succeeded", "1 hr ago")]
    )
)
(OUT / "enterprise-dashboard.svg").write_text(
    svg(w, h, dash, "Simulated cloud console dashboard with a billing error banner"), encoding="utf8"
)
