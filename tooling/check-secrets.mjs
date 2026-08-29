import { readFile, readdir, stat } from 'node:fs/promises';
import { extname, join, relative } from 'node:path';
import process from 'node:process';

const root = process.cwd();
const ignoredDirs = new Set(['.git', 'node_modules', 'dist', 'coverage']);
const ignoredFiles = new Set(['pnpm-lock.yaml']);
const textExtensions = new Set([
  '.ts', '.tsx', '.js', '.mjs', '.cjs', '.json', '.yaml', '.yml', '.toml', '.env', '.example',
]);

const patterns = [
  { name: 'Supabase secret key', regex: /sb_secret_[A-Za-z0-9_-]{16,}/g },
  { name: 'Professional Registry live key', regex: /prk_live_[A-Za-z0-9_-]{20,}/g },
  { name: 'Private key', regex: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g },
  { name: 'Assigned Supabase secret', regex: /SUPABASE_(?:SECRET|SERVICE_ROLE)_KEY\s*=\s*[^\s#<][^\n]*/g },
];

const findings = [];

async function walk(dir) {
  for (const entry of await readdir(dir)) {
    if (ignoredDirs.has(entry)) continue;
    const full = join(dir, entry);
    const info = await stat(full);
    if (info.isDirectory()) {
      await walk(full);
      continue;
    }

    const rel = relative(root, full);
    if (ignoredFiles.has(rel)) continue;
    if (rel.startsWith('docs/')) continue;

    const ext = extname(entry);
    if (!textExtensions.has(ext) && !entry.startsWith('.env')) continue;

    const content = await readFile(full, 'utf8');
    for (const pattern of patterns) {
      pattern.regex.lastIndex = 0;
      if (pattern.regex.test(content)) findings.push(`${rel}: ${pattern.name}`);
    }
  }
}

await walk(root);

if (findings.length > 0) {
  console.error('Potential secrets detected:');
  for (const finding of findings) console.error(`- ${finding}`);
  process.exit(1);
}

console.log('Secret scan OK.');
