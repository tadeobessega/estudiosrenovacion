// Copia el sitio estático a dist/ (lo que publica el Worker como assets).
// Deja afuera lo que no es del sitio: el Worker, scripts, la copia vieja, el bot, etc.
import { cpSync, rmSync, mkdirSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = process.cwd();
const out = join(root, 'dist');
const include = ['index.html', 'pages', 'admin', 'assets'];
const skip = [/\.py$/, /_temp\.xlsx$/, /(^|\/)README\.md$/, /\.DS_Store$/, /Thumbs\.db$/];

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
for (const item of include) {
  const src = join(root, item);
  if (!existsSync(src)) continue;
  cpSync(src, join(out, item), {
    recursive: true,
    filter: (p) => !skip.some((re) => re.test(relative(root, p).replace(/\\/g, '/')))
  });
}
console.log('Sitio copiado a dist/');
