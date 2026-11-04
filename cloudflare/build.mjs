import {readFile, writeFile, mkdir} from 'node:fs/promises';
const root = new URL('./', import.meta.url);
let source = await readFile(new URL('src/worker.js', root), 'utf8');
for (const [name, path] of [['providerTemplate', 'provider.js'], ['page', 'index.html'], ['app', 'app.js']]) {
  const content = await readFile(new URL('src/' + path, root), 'utf8');
  source = source.replace(`import ${name} from './${path}.txt';`, () => `const ${name} = ${JSON.stringify(content)};`);
}
await mkdir(new URL('dist/', root), {recursive: true});
await writeFile(new URL('dist/worker.mjs', root), source);
console.log('Vytvoreny dist/worker.mjs');
