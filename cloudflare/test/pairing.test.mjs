import {test} from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {makeWorker} from '../dist/worker.mjs';

const origin = 'https://kinora.example';
const hash = 'synthetic-mobile-session-123456';
function setup() {
  const records = new Map();
  let writes = 0;
  const env = {KINORA_SECRET: Buffer.alloc(32, 44).toString('base64url'), SESSIONS: {
    async get(k) { return records.get(k) || null; },
    async put(k, v, options) { assert.ok(options.expiration > Date.now() / 1000); writes++; records.set(k, v); }
  }};
  const worker = makeWorker(async () => { assert.fail('Worker must never authenticate with FastShare in pairing flow'); });
  return {env, worker, records, writes: () => writes};
}
async function createPair(worker, env) {
  const result = await worker.fetch(new Request(origin + '/pair/new', {method: 'POST', headers: {Origin: origin, 'Content-Type': 'application/json'}, body: '{}'}), env);
  assert.equal(result.status, 200);
  return (await result.json()).manifest;
}
async function loadDevice(worker, env, manifest, local, calls) {
  const repo = await (await worker.fetch(new Request(manifest), env)).json();
  assert.equal(repo.scrapers[0].hasSettings, true);
  const code = await (await worker.fetch(new Request(new URL('fastshare.js', manifest)), env)).text();
  assert.ok(!code.includes('synthetic-password'));
  assert.ok(!code.includes(hash));
  const context = {module: {exports: {}}, SCRAPER_SETTINGS: local, fetch: async (raw, options = {}) => {
    const url = new URL(raw);
    if (url.origin === origin) {
      if (options.method === 'POST') {
        const body = JSON.parse(options.body);
        assert.ok(!('username' in body)); assert.ok(!('password' in body));
      }
      return worker.fetch(new Request(raw, options), env);
    }
    if (url.hostname === 'api.themoviedb.org') {
      assert.ok(url.searchParams.has('api_key'));
      return Response.json({id: 603, title: 'Matrix', name: 'Matrix', original_language: 'en', release_date: '1999-01-01'});
    }
    assert.equal(url.hostname, 'fastshare.cz');
    if (url.searchParams.get('process') === 'login') {
      calls.logins++; assert.equal(local.password, 'synthetic-password');
      return Response.json({user: {hash}});
    }
    const series = /S03E01/.test(url.searchParams.get('term'));
    return Response.json({search: {file: [
      {id: 'cz', filename: 'Matrix.' + (series ? 'S03E01' : '1999') + '.CZ.1080p.mkv', download_url: 'https://cdn.fastshare.cz/cz.mkv', data: {value: 2000000000}},
      {id: 'en', filename: 'Matrix.' + (series ? 'S03E01' : '1999') + '.ENG.1080p.mkv', download_url: 'https://cdn.fastshare.cz/en.mkv', data: {value: 1000000000}}
    ]}});
  }};
  vm.createContext(context); vm.runInContext(code, context);
  return context.module.exports;
}
test('native mobile settings pair session and preferences; TV searches films and series without credentials', async () => {
  const {worker, env, records, writes} = setup();
  const manifest = await createPair(worker, env);
  const statusUrl = new URL('status.json', manifest);
  assert.equal((await (await worker.fetch(new Request(statusUrl), env)).json()).ready, false);
  const mobileCalls = {logins: 0};
  const mobile = await loadDevice(worker, env, manifest, {username: 'synthetic-user', password: 'synthetic-password', tmdb: 'a'.repeat(32), language: 'EN_ORIGINAL', sort: 'smallest', syncTv: true}, mobileCalls);
  const fields = mobile.onSettings();
  assert.ok(fields.some(x => x.key === 'password' && x.isPassword));
  assert.ok(fields.some(x => x.key === 'syncTv' && x.defaultValue === false));
  const mobileResults = await mobile.getStreams('603', 'movie');
  assert.equal(mobileCalls.logins, 1);
  assert.equal(mobileResults[0].url, 'https://cdn.fastshare.cz/en.mkv');
  assert.equal(writes(), 1);
  for (const value of records.values()) { assert.ok(!value.includes(hash)); assert.ok(!value.includes('synthetic-password')); }
  const status = await (await worker.fetch(new Request(statusUrl), env)).json();
  assert.equal(status.ready, true); assert.ok(!JSON.stringify(status).includes(hash));
  const tvCalls = {logins: 0};
  const tv = await loadDevice(worker, env, manifest, {}, tvCalls);
  for (const type of ['movie', 'tv', 'series']) {
    const streams = await tv.getStreams('603', type, 3, 1);
    assert.equal(streams.length, 2);
    assert.equal(streams[0].url, 'https://cdn.fastshare.cz/en.mkv');
    assert.equal(streams[0].headers.Cookie, 'FASTSHARE=' + hash);
  }
  assert.equal(tvCalls.logins, 0);
  await mobile.getStreams('603', 'movie');
  assert.equal(writes(), 1, 'same session should not write KV for every search');
});
test('sharing is opt-in and missing namespace is explicit', async () => {
  const {worker, env, writes} = setup();
  const manifest = await createPair(worker, env);
  const mobile = await loadDevice(worker, env, manifest, {username: 'synthetic-user', password: 'synthetic-password', tmdb: 'a'.repeat(32), syncTv: false}, {logins: 0});
  assert.equal((await mobile.getStreams('603', 'movie')).length, 2);
  assert.equal(writes(), 0);
  const missing = {...env}; delete missing.SESSIONS;
  const response = await worker.fetch(new Request(origin + '/pair/new', {method: 'POST', headers: {Origin: origin, 'Content-Type': 'application/json'}, body: '{}'}), missing);
  assert.equal((await response.json()).code, 'PAIR_CONFIG');
});
test('pairing is isolated, expires, and refuses foreign browser writes', async () => {
  const {worker, env} = setup();
  const first = await createPair(worker, env);
  const second = await createPair(worker, env);
  assert.notEqual(first, second);
  const endpoint = new URL('session.json', first);
  const body = JSON.stringify({hash, language: 'CZ_SK'});
  assert.equal((await worker.fetch(new Request(endpoint, {method: 'POST', headers: {'Content-Type': 'application/json', Origin: 'https://untrusted.example'}, body}), env)).status, 403);
  assert.equal((await worker.fetch(new Request(endpoint, {method: 'POST', headers: {'Content-Type': 'application/json'}, body}), env)).status, 200);
  assert.equal((await worker.fetch(new Request(new URL('session.json', second)), env)).status, 409);
  const now = Date.now;
  try {
    Date.now = () => now() + 366 * 86400000;
    assert.equal((await worker.fetch(new Request(first), env)).status, 401);
  } finally { Date.now = now; }
});
