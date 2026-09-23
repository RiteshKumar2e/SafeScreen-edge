import type { TermExplanation } from '../types';

// Plain-language explanations for technical terms that commonly appear on
// screen. Only terms actually present in the capture are shown.
const GLOSSARY: { re: RegExp; term: string; meaning: string }[] = [
  { re: /\bTraceback\b/, term: 'Traceback', meaning: 'The list of function calls Python was running when the error happened. The last lines are usually the most useful.' },
  { re: /\bstack ?trace\b|^\s+at\s/im, term: 'Stack trace', meaning: 'A record of which functions were running when the error occurred, from the most recent call outward.' },
  { re: /\bModuleNotFoundError\b/, term: 'ModuleNotFoundError', meaning: 'Python could not find a package or module that the code tried to import.' },
  { re: /\bpip\b/, term: 'pip', meaning: 'The standard tool for installing Python packages.' },
  { re: /\b(virtual environment|venv|\.venv)\b/i, term: 'Virtual environment', meaning: 'An isolated folder of Python packages for one project, so projects do not interfere with each other.' },
  { re: /\bECONNREFUSED\b|connection refused/i, term: 'Connection refused', meaning: 'The program reached the target address, but nothing was listening there. The service is often not running, or is on a different port.' },
  { re: /\bETIMEDOUT\b|timed? ?out/i, term: 'Timeout', meaning: 'The program waited for a response longer than allowed and gave up.' },
  { re: /\bEADDRINUSE\b|address already in use/i, term: 'Address in use', meaning: 'Another program is already using the network port this one wants.' },
  { re: /\bexit(ed)? (with )?code\b|exit status/i, term: 'Exit code', meaning: 'A number a program returns when it stops. Zero usually means success; anything else signals a failure.' },
  { re: /\bpool\b/i, term: 'Connection pool', meaning: 'A set of reusable database connections kept open by the application.' },
  { re: /\bOperationalError\b/, term: 'OperationalError', meaning: 'A database error caused by the environment, such as the server being unreachable, rather than by a bad query.' },
  { re: /\blocalhost\b|127\.0\.0\.1/, term: 'localhost', meaning: 'This computer. A service on localhost must be running on the same machine.' },
  { re: /\b5432\b/, term: 'Port 5432', meaning: 'The default port for PostgreSQL databases.' },
  { re: /\bnpm\b/, term: 'npm', meaning: 'The package manager for Node.js projects.' },
  { re: /\bERESOLVE\b/, term: 'ERESOLVE', meaning: 'npm could not find a set of package versions that satisfies every dependency requirement.' },
  { re: /\bCORS\b/, term: 'CORS', meaning: 'A browser rule that blocks a web page from reading responses from another origin unless that server allows it.' },
  { re: /\bUser Account Control\b|\bUAC\b/i, term: 'User Account Control', meaning: 'A Windows prompt that appears before an app gets permission to make system-level changes.' },
  { re: /\bpublisher\b/i, term: 'Publisher', meaning: 'The organization that digitally signed the software. "Unknown" means the file carries no verifiable signature.' },
  { re: /\bdigital(ly)? sign/i, term: 'Digital signature', meaning: 'A cryptographic stamp showing who published a file and that it has not been modified since.' },
  { re: /\bcertificate\b|NET::ERR_CERT/i, term: 'Certificate', meaning: 'A credential that lets a website prove its identity to your browser.' },
  { re: /\bdomain\b/i, term: 'Domain', meaning: 'The website name in the address bar, such as example.com. It identifies who controls the page.' },
  { re: /\bpermission denied\b|\bEACCES\b/i, term: 'Permission denied', meaning: 'The current user account is not allowed to read, write or run the file in question.' },
];

export function explainTerms(text: string, limit = 5): TermExplanation[] {
  return GLOSSARY.filter((g) => g.re.test(text))
    .slice(0, limit)
    .map(({ term, meaning }) => ({ term, meaning }));
}
