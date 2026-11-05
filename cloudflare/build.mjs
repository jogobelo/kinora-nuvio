import {readFile, writeFile, mkdir} from 'node:fs/promises';
const root = new URL('./', import.meta.url);
let source = await readFile(new URL('src/worker.js', root), 'utf8');
for (const [name, path] of [['providerTemplate', 'provider.js'], ['page', 'index.html'], ['app', 'app.js']]) {
  const content = await readFile(new URL('src/' + path, root), 'utf8');
  source = source.replace(`import ${name} from './${path}.txt';`, () => `const ${name} = ${JSON.stringify(content)};`);
}
const providerSource = await readFile(new URL('src/provider.js', root), 'utf8');
const factory = 'function createProvider(config, fetch) { const module = {exports:{}};\n' + providerSource.replace('__KINORA_PRIVATE_CONFIG__', 'config') + '\nreturn module.exports;\n}';
const addonSource = await readFile(new URL('src/addon.js', root), 'utf8');
source = source.replace("import {handleAddon} from './addon.js';", () => factory + '\n' + addonSource.replace('export async function handleAddon', 'async function handleAddon'));
await mkdir(new URL('dist/', root), {recursive: true});
await writeFile(new URL('dist/worker.mjs', root), source);
console.log('Vytvoreny dist/worker.mjs');
// Static assets may use Netlify's CDN; source code and account data never enter publish/.
await mkdir(new URL('public/',root),{recursive:true});
await writeFile(new URL('public/robots.txt',root),'User-agent: *\nDisallow: /\n');
await writeFile(new URL('public/app.js',root),await readFile(new URL('src/app.js',root),'utf8'));
