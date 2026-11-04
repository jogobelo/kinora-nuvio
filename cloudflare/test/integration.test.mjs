import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {makeWorker} from '../dist/worker.mjs';

const env = {KINORA_SECRET: Buffer.alloc(32, 42).toString('base64url')};
const origin = 'https://kinora.example';
const secretHash = 'synthetic-session-12345';
function workerWith(loginResult = {user: {hash: secretHash}}) {
  return makeWorker(async (url, options) => {
    const parsed = new URL(url);
    assert.equal(parsed.origin, 'https://fastshare.cz');
    assert.equal(parsed.searchParams.get('process'), 'login');
    assert.equal(options.redirect, 'manual');
    return Response.json(loginResult);
  });
}
function configure(worker, options = {}) {
  return worker.fetch(new Request(origin + '/configure', {method: 'POST', headers: {'Origin': origin, 'Content-Type': 'application/json'}, body: JSON.stringify({username: 'synthetic-user', password: 'synthetic-password', language: 'CZ_SK', tmdb: 'a'.repeat(32), ...options})}), env);
}
test('private login, repository download and film/series execution without timers', async () => {
  const worker = workerWith();
  const response = await configure(worker);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Cache-Control'), 'no-store, private');
  const {manifest} = await response.json();
  assert.ok(!manifest.includes(secretHash));
  assert.ok(!manifest.includes('synthetic-password'));
  const manifestResponse = await worker.fetch(new Request(manifest), env);
  const repo = await manifestResponse.json();
  assert.equal(repo.scrapers[0].version, '0.4.0');
  assert.ok(repo.scrapers[0].supportedTypes.includes('series'));
  const scriptUrl = new URL(repo.scrapers[0].filename, manifest).toString();
  const code = await (await worker.fetch(new Request(scriptUrl), env)).text();
  assert.ok(!code.includes('synthetic-password'));
  assert.ok(!code.includes(secretHash));
  for (const type of ['movie', 'tv', 'series']) {
    const context = {module: {exports: {}}, TMDB_API_KEY: '', fetch: async (raw) => {
      const url = new URL(raw);
      if (url.origin === origin) return worker.fetch(new Request(url), env);
      if (url.hostname === 'api.themoviedb.org') {
        assert.ok(url.pathname.includes(type === 'movie' ? '/movie/' : '/tv/'));
        return Response.json({id: 603, title: 'Matrix', name: 'Matrix', original_title: 'Matrix', original_language: 'en', release_date: '1999-01-01'});
      }
      assert.equal(url.hostname, 'fastshare.cz');
      assert.equal(url.searchParams.get('process'), 'search');
      const filename = type === 'movie' ? 'Matrix.1999.CZ.1080p.mkv' : 'Matrix.S03E01.CZ.1080p.mkv';
      return Response.json({search: {file: [{id: '1', filename, data: {value: 2000000000}, download_url: 'https://cdn.fastshare.cz/video.mkv'}]}});
    }};
    vm.createContext(context);
    vm.runInContext(code, context);
    const results = await context.module.exports.getStreams('603', type, 3, 1);
    assert.equal(results.length, 1);
    assert.equal(results[0].headers.Cookie, 'FASTSHARE=' + secretHash);
  }
  const head = await worker.fetch(new Request(scriptUrl, {method: 'HEAD'}), env);
  assert.equal(head.status, 200);
  assert.equal(await head.text(), '');
});
test('wrong account never creates a repository', async () => {
  const result = await configure(workerWith({error: 'password rejected'}));
  assert.equal(result.status, 401);
  assert.ok(!(await result.text()).includes('synthetic-password'));
});
test('forged and expired tokens are rejected', async () => {
  const worker = workerWith();
  const {manifest} = await (await configure(worker)).json();
  const forged = manifest.replace('/r/', '/r/A');
  assert.equal((await worker.fetch(new Request(forged), env)).status, 401);
  const previousNow = Date.now;
  try {
    Date.now = () => previousNow() + 31 * 86400000;
    assert.equal((await worker.fetch(new Request(manifest), env)).status, 401);
  } finally { Date.now = previousNow; }
});
test('missing secret, cross-origin POST and unsafe redirect fail closed', async () => {
  const worker = workerWith();
  assert.equal((await worker.fetch(new Request(origin + '/health'), {})).status, 503);
  const request = new Request(origin + '/configure', {method: 'POST', headers: {'Origin': 'https://untrusted.example', 'Content-Type': 'application/json'}, body: '{}'});
  assert.equal((await worker.fetch(request, env)).status, 403);
});
test('account token never authorizes arbitrary hosts or wrong episodes', async () => {
  const worker = workerWith();
  const {manifest} = await (await configure(worker)).json();
  const code = await (await worker.fetch(new Request(new URL('fastshare.js', manifest)), env)).text();
  const context = {module: {exports: {}}, fetch: async raw => {
    const url = new URL(raw);
    if (url.origin === origin) return worker.fetch(new Request(url), env);
    if (url.hostname === 'api.themoviedb.org') return Response.json({id: 603, name: 'Matrix', original_language: 'en'});
    return Response.json({search: {file: [
      {filename: 'Matrix.S03E01.CZ.mkv', download_url: 'https://attacker.example/video.mkv'},
      {filename: 'Matrix.S03E02.CZ.mkv', download_url: 'https://cdn.fastshare.cz/video.mkv'}
    ]}});
  }};
  vm.createContext(context); vm.runInContext(code, context);
  assert.equal((await context.module.exports.getStreams('603', 'series', 3, 1)).length, 0);
});

test('HTTP errors and invalid JSON are distinguished without leaking credentials', async () => {
  for (const [response, code] of [
    [new Response('blocked', {status: 403}), 'FS_HTTP_403'],
    [new Response('limited', {status: 429}), 'FS_HTTP_429'],
    [new Response('<html>not JSON</html>'), 'FS_FORMAT'],
    [Response.json({user: {}}), 'FS_SESSION']
  ]) {
    const worker = makeWorker(async () => response);
    const result = await configure(worker);
    const body = await result.json();
    assert.equal(body.code, code);
    assert.ok(!JSON.stringify(body).includes('synthetic-password'));
  }
});

test('network errors are sanitized and not mislabeled as bad password', async () => {
  const worker = makeWorker(async () => { throw Error('URL contains synthetic-password'); });
  const response = await configure(worker);
  const body = await response.json();
  assert.equal(body.code, 'FS_NETWORK');
  assert.ok(!JSON.stringify(body).includes('synthetic-password'));
});

test('redirects remain HTTPS and confined to the FastShare service', async () => {
  let calls = 0;
  const worker = makeWorker(async url => {
    calls++;
    if (calls === 1) return new Response(null, {status: 302, headers: {Location: 'https://fastshare.cloud/api/api_kodi.php'}});
    assert.equal(new URL(url).hostname, 'fastshare.cloud');
    return Response.json({user: {hash: secretHash}});
  });
  assert.equal((await configure(worker)).status, 200);
  assert.equal(calls, 2);
  for (const location of ['https://attacker.example/login', 'http://fastshare.cz/login', 'https://fastshare.cz:444/login', 'https://a@fastshare.cz/login']) {
    let blockedCalls = 0;
    const blocked = makeWorker(async () => {
      blockedCalls++;
      return new Response(null, {status: 302, headers: {Location: location}});
    });
    assert.equal((await (await configure(blocked)).json()).code, 'FS_REDIRECT');
    assert.equal(blockedCalls, 1);
  }
});

test('desktop session pairing never sends a FastShare request from the Worker', async () => {
  const worker = makeWorker(async () => { assert.fail('Server must not log into FastShare when importing a desktop session'); });
  const request = new Request(origin + '/configure-session', {method: 'POST', headers: {'Origin': origin, 'Content-Type': 'application/json'}, body: JSON.stringify({hash: secretHash, language: 'CZ_SK', tmdb: 'a'.repeat(32)})});
  const response = await worker.fetch(request, env);
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.ok(!data.manifest.includes(secretHash));
  assert.equal((await worker.fetch(new Request(data.manifest), env)).status, 200);
  const restored = await worker.fetch(new Request(new URL('session.json', data.manifest)), env);
  assert.equal((await restored.json()).hash, secretHash);
  const badRequest = new Request(origin + '/configure-session', {method: 'POST', headers: {'Origin': origin, 'Content-Type': 'application/json'}, body: JSON.stringify({hash: 'bad\r\nheader'})});
  assert.equal((await worker.fetch(badRequest, env)).status, 400);
});
