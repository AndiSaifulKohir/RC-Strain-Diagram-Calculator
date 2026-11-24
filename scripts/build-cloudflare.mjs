// Copies the static site into dist/rcsd-calculator/ so Cloudflare serves it at asaiko.org/rcsd-calculator/.
// Run automatically by `wrangler deploy` (see wrangler.jsonc > build.command).
import { cpSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const out = join('dist', 'rcsd-calculator');
const files = ['index.html', 'RCSD-calculator.css', 'RCSD-calculator.js'];

rmSync('dist', { recursive: true, force: true });
mkdirSync(out, { recursive: true });
for (const f of files) cpSync(f, join(out, f), { recursive: true });
console.log(`Built ${files.length} entries into ${out}`);
