import { cpSync, mkdirSync, rmSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = join(__dirname, '..', '..');
const DIST = join(__dirname, 'dist');

const SKIP_DIRS = new Set([
  '.git',
  '.github',
  'android',
  'cloudflare',
  'node_modules',
  'build',
  'src',
  'tools',
  'scripts',
  '.grok',
]);

const SKIP_FILES = new Set([
  '.gitignore',
  'KOINLY_ARCHITECTURE.md',
  'package.json',
  'package-lock.json',
  'README.md',
]);

function shouldSkip(rel) {
  const parts = rel.split(/[\\/]/);
  if (parts.some((p) => SKIP_DIRS.has(p))) return true;
  if (SKIP_FILES.has(parts[parts.length - 1])) return true;
  if (parts[parts.length - 1].startsWith('.')) return true;
  return false;
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const rel = relative(ROOT, full);
    if (shouldSkip(rel)) continue;
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

rmSync(DIST, { recursive: true, force: true });
mkdirSync(DIST, { recursive: true });

const files = walk(ROOT);
for (const full of files) {
  const rel = relative(ROOT, full);
  const dest = join(DIST, rel);
  mkdirSync(join(dest, '..'), { recursive: true });
  cpSync(full, dest);
}

console.log(`Copied ${files.length} files into cloudflare/trading-site/dist`);
