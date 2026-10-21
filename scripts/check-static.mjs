// A narrow public-file allowlist prevents Vite's public/ copy from packaging local state.
import { lstatSync, readdirSync, readFileSync, existsSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const keyPatterns = [/\bsk-(?:proj-)?[A-Za-z0-9_-]{24,}/, /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/];
export function checkStatic(root, publicOnly = false) {
  const allowed = new Set(['.htaccess', 'research_report.json', 'history_report.json']);
  function walk(dir) {
    for (const name of readdirSync(dir)) {
      const path = resolve(dir, name);
      const label = relative(root, path);
      const stat = lstatSync(path);
      if (stat.isSymbolicLink()) throw new Error(`Symlink in static input: ${label}`);
      if (publicOnly && !allowed.has(label)) throw new Error(`Unreviewed public file: ${label}`);
      if (stat.isDirectory()) { walk(path); continue; }
      if (!publicOnly && !/^(?:index\.html|\.htaccess|(?:research_report|history_report)\.json|assets\/[\w.-]+\.(?:js|css|svg|png|woff2))$/.test(label)) {
        throw new Error(`Unexpected build file: ${label}`);
      }
      if (keyPatterns.some(pattern => pattern.test(readFileSync(path, 'utf8')))) {
        throw new Error(`Possible credential in static file: ${label}`); // Never echo contents.
      }
    }
  }
  walk(root);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    for (const name of Object.keys(process.env)) {
      if (/^VITE_.*(?:KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL)/i.test(name)) throw new Error('Secret-like VITE_ environment variable is forbidden');
    }
    const output = process.argv[2];
    const root = resolve(output || 'public');
    if (!existsSync(root)) throw new Error('Static directory does not exist');
    checkStatic(root, !output);
    console.log('Static boundary checks passed');
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
