import providerTemplate from './provider.js.txt';
import page from './index.html.txt';
import app from './app.js.txt';
import {handleAddon} from './addon.js';

const encoder = new TextEncoder();
const API = 'https://fastshare.cz/api/api_kodi.php';
const VERSION = '0.4.1';
const TTL = 30 * 86400;
const hashPattern = /^[a-zA-Z0-9._~-]{8,512}$/;
function fail(code) {
  const error = new Error('Kinora request failed');
  error.kinoraCode = code;
  return error;
}
const safeErrors = {
  PAIR_CONFIG: [503, 'PAIR_CONFIG: V Cloudflare pripoj KV namespace ako binding SESSIONS.'],
  PAIR_EMPTY: [409, 'PAIR_EMPTY: Najprv v mobilnom Nuvio vypln ucet, zapni odosielanie relacie a otvor zoznam zdrojov filmu.'],
  PAIR_EXPIRED: [401, 'PAIR_EXPIRED: Sparovanie vyprsalo alebo je neplatne. Vytvor novu sukromnu URL.'],
  CONFIG: [503, 'CONFIG: Nespravne nastaveny KINORA_SECRET. Skontroluj ulozeny kluc v Cloudflare.'],
  INPUT: [400, 'INPUT: Vypln meno a heslo FastShare.'],
  FS_NETWORK: [502, 'FS_NETWORK: Worker sa nespojil s FastShare. Toto nepotvrdzuje nespravne heslo.'],
  FS_TIMEOUT: [504, 'FS_TIMEOUT: FastShare neodpovedal v casovom limite.'],
  FS_REDIRECT: [502, 'FS_REDIRECT: FastShare vratil nepodporovane presmerovanie.'],
  FS_HTTP_403: [502, 'FS_HTTP_403: FastShare odmietol poziadavku z hosťovania (HTTP 403).'],
  FS_HTTP_429: [502, 'FS_HTTP_429: FastShare obmedzil pocet poziadaviek (HTTP 429). Skus neskor.'],
  FS_HTTP: [502, 'FS_HTTP: FastShare vratil neuspesny HTTP stav.'],
  FS_FORMAT: [502, 'FS_FORMAT: FastShare nevratil ocakavanu JSON odpoved.'],
  FS_SESSION: [401, 'FS_SESSION: FastShare nevratil prihlasovaciu relaciu. Over ucet na FastShare; moze ist aj o zmenu API.'],
  INTERNAL: [500, 'INTERNAL: Chyba spracovania na serveri Kinora.']
};
const security = {
  'Cache-Control': 'no-store, private',
  'Referrer-Policy': 'no-referrer',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
};
function reply(body, type = 'application/json', status = 200, head = false) {
  return new Response(head ? null : body, {status, headers: {...security, 'Content-Type': type + '; charset=utf-8'}});
}
function json(value, status = 200, head = false) { return reply(JSON.stringify(value), 'application/json', status, head); }
function b64(bytes) { return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
function unb64(text) {
  if (!/^[A-Za-z0-9_-]+$/.test(text) || text.length > 12000) throw Error('token');
  return Uint8Array.from(atob(text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - text.length % 4) % 4)), c => c.charCodeAt(0));
}
async function key(env) {
  let raw;
  try { raw = unb64(env.KINORA_SECRET || ''); }
  catch { throw fail('CONFIG'); }
  if (raw.length !== 32) throw fail('CONFIG');
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}
async function seal(data, env) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const bytes = new Uint8Array(await crypto.subtle.encrypt({name: 'AES-GCM', iv, additionalData: encoder.encode('kinora-v1')}, await key(env), encoder.encode(JSON.stringify(data))));
  return b64(new Uint8Array([...iv, ...bytes]));
}
async function open(token, env) {
  const bytes = unb64(token);
  const plain = await crypto.subtle.decrypt({name: 'AES-GCM', iv: bytes.slice(0, 12), additionalData: encoder.encode('kinora-v1')}, await key(env), bytes.slice(12));
  const data = JSON.parse(new TextDecoder().decode(plain));
  if (data.v !== 1 || !Number.isFinite(data.exp) || data.exp < Date.now() / 1000 || !hashPattern.test(data.hash)) throw Error('expired');
  return data;
}
async function login(body, env, fetcher) {
  if (!body || typeof body.username !== 'string' || !body.username.trim() || body.username.length > 256 || typeof body.password !== 'string' || !body.password || body.password.length > 1024) throw fail('INPUT');
  let upstream = new URL(API);
  upstream.search = new URLSearchParams({process: 'login', login: body.username.trim(), password: body.password}).toString();
  // FastShare's Kodi API uses a query string. Never log this URL or upstream errors.
  // Follow redirects only after validating the destination, before any credentials leave.
  const hosts = ['fastshare.cz', 'www.fastshare.cz', 'fastshare.cloud', 'www.fastshare.cloud'];
  const signal = AbortSignal.timeout(12000);
  let response;
  for (let step = 0; step < 4; step++) {
    try {
      response = await fetcher(upstream.toString(), {redirect: 'manual', signal, headers: {Accept: 'application/json'}});
    } catch {
      throw fail(signal.aborted ? 'FS_TIMEOUT' : 'FS_NETWORK');
    }
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('Location');
      if (!location || step === 3) throw fail('FS_REDIRECT');
      let next;
      try { next = new URL(location, upstream); } catch { throw fail('FS_REDIRECT'); }
      if (next.protocol !== 'https:' || next.username || next.password || next.port || !hosts.includes(next.hostname)) throw fail('FS_REDIRECT');
      upstream = next;
      continue;
    }
    break;
  }
  if (!response.ok) {
    throw fail(response.status === 403 ? 'FS_HTTP_403' : response.status === 429 ? 'FS_HTTP_429' : 'FS_HTTP');
  }
  let data;
  try { data = await response.json(); }
  catch { throw fail('FS_FORMAT'); }
  const hash = data?.user?.hash;
  if (typeof hash !== 'string' || !hashPattern.test(hash)) throw fail('FS_SESSION');
  const tmdb = typeof body.tmdb === 'string' ? body.tmdb.trim().replace(/^Bearer\s+/i, '') : '';
  if (tmdb.length > 4096 || /[\r\n]/.test(tmdb)) throw fail('INPUT');
  // Password and username are deliberately excluded from the installation token.
  return {v: 1, hash, exp: Math.floor(Date.now() / 1000) + TTL, tmdb: tmdb || env.TMDB_API_KEY || '', language: body.language === 'EN_ORIGINAL' ? 'EN_ORIGINAL' : 'CZ_SK', sort: body.sort === 'smallest' ? 'smallest' : 'largest'};
}
function importSession(body, env) {
  if (!body || typeof body.hash !== 'string' || !hashPattern.test(body.hash)) throw fail('INPUT');
  // The desktop helper has obtained this session directly from FastShare.
  // The Worker does not claim to have independently verified it.
  const tmdb = typeof body.tmdb === 'string' ? body.tmdb.trim().replace(/^Bearer\s+/i, '') : '';
  if (tmdb.length > 4096 || /[\r\n]/.test(tmdb)) throw fail('INPUT');
  return {v: 1, hash: body.hash, exp: Math.floor(Date.now() / 1000) + TTL,
    tmdb: tmdb || env.TMDB_API_KEY || '', language: body.language === 'EN_ORIGINAL' ? 'EN_ORIGINAL' : 'CZ_SK',
    sort: body.sort === 'smallest' ? 'smallest' : 'largest'};
}

function kv(env) {
  if (!env.SESSIONS || typeof env.SESSIONS.get !== 'function' || typeof env.SESSIONS.put !== 'function') throw fail('PAIR_CONFIG');
  return env.SESSIONS;
}
async function openPair(token, env) {
  try {
    const bytes = unb64(token);
    const plain = await crypto.subtle.decrypt({name: 'AES-GCM', iv: bytes.slice(0, 12), additionalData: encoder.encode('kinora-v1')}, await key(env), bytes.slice(12));
    const data = JSON.parse(new TextDecoder().decode(plain));
    if (data.kind !== 'pair' || !/^[A-Za-z0-9_-]{32}$/.test(data.id) || !Number.isFinite(data.exp) || data.exp <= Date.now() / 1000) throw Error('pair');
    return data;
  } catch { throw fail('PAIR_EXPIRED'); }
}
async function sharedSession(pair, env) {
  const stored = await kv(env).get('p:' + pair.id);
  if (!stored) throw fail('PAIR_EMPTY');
  try { return await open(stored, env); }
  catch { throw fail('PAIR_EMPTY'); }
}
function pairManifest() {
  return {name: 'Kinora — mobil a TV', version: VERSION,
    description: 'Ucet vypln v mobilnom Nuvio a zapni odosielanie relacie. Na TV pridaj rovnaku sukromnu URL.',
    scrapers: [{id: 'kinora-fastshare-paired', name: 'Kinora FastShare — mobil a TV', version: VERSION,
      filename: 'fastshare.js', supportedTypes: ['movie', 'tv', 'series'], enabled: true, hasSettings: true,
      contentLanguage: ['sk', 'cs', 'en'], formats: ['mkv', 'mp4', 'avi', 'm4v', 'mov', 'webm', 'ts', 'm2ts']}]};
}
export function makeWorker(fetcher = fetch) {
  return {async fetch(request, env) {
    const url = new URL(request.url);
    const head = request.method === 'HEAD';
    try {
      const addonResponse = await handleAddon(request, env, fetcher, {seal, key, unb64, kv, login, fail, json, reply, providerTemplate});
      if (addonResponse) return addonResponse;
      if (url.pathname === '/pair/new' && request.method === 'POST') {
        if (request.headers.get('Origin') !== url.origin || !request.headers.get('Content-Type')?.startsWith('application/json')) return json({error: 'Neplatna poziadavka.'}, 403);
        kv(env); await key(env);
        const data = {kind: 'pair', id: b64(crypto.getRandomValues(new Uint8Array(24))), exp: Math.floor(Date.now() / 1000) + 365 * 86400};
        const pairToken = await seal(data, env);
        return json({manifest: url.origin + '/p/' + pairToken + '/manifest.json', expires: new Date(data.exp * 1000).toISOString()});
      }
      const paired = url.pathname.match(/^\/p\/([A-Za-z0-9_-]+)\/(manifest\.json|fastshare\.js|session\.json|status\.json)$/);
      if (paired) {
        const pair = await openPair(paired[1], env);
        kv(env);
        if (request.method === 'POST' && paired[2] === 'session.json') {
          const requestOrigin = request.headers.get('Origin');
          if ((requestOrigin && requestOrigin !== url.origin) || !request.headers.get('Content-Type')?.startsWith('application/json')) return json({error: 'Neplatna poziadavka.'}, 403);
          if (Number(request.headers.get('Content-Length') || 0) > 10000) throw fail('INPUT');
          const text = await request.text();
          if (text.length > 10000) throw fail('INPUT');
          let body; try { body = JSON.parse(text); } catch { throw fail('INPUT'); }
          const data = importSession(body, env);
          data.exp = Math.min(data.exp, pair.exp);
          let old = null;
          try { old = await sharedSession(pair, env); } catch {}
          const same = old && old.hash === data.hash && old.tmdb === data.tmdb && old.language === data.language && old.sort === data.sort && old.exp > Date.now() / 1000 + 7 * 86400;
          if (!same) await kv(env).put('p:' + pair.id, await seal(data, env), {expiration: data.exp});
          return json({paired: true, expires: new Date((same ? old.exp : data.exp) * 1000).toISOString()});
        }
        if (!['GET', 'HEAD'].includes(request.method)) return json({error: 'Nepovolena metoda.'}, 405);
        if (paired[2] === 'manifest.json') return json(pairManifest(), 200, head);
        if (paired[2] === 'fastshare.js') {
          const config = {pairMode: true, sessionEndpoint: url.origin + '/p/' + paired[1] + '/session.json'};
          return reply(providerTemplate.replace('__KINORA_PRIVATE_CONFIG__', () => JSON.stringify(config)), 'application/javascript', 200, head);
        }
        if (paired[2] === 'status.json') {
          try {
            const data = await sharedSession(pair, env);
            return json({ready: true, version: VERSION, expires: new Date(data.exp * 1000).toISOString()}, 200, head);
          } catch (error) {
            if (error?.kinoraCode !== 'PAIR_EMPTY') throw error;
            return json({ready: false, version: VERSION, message: safeErrors.PAIR_EMPTY[1]}, 200, head);
          }
        }
        const data = await sharedSession(pair, env);
        return json({hash: data.hash, tmdb: data.tmdb, language: data.language, sort: data.sort}, 200, head);
      }
      if (['/configure', '/configure-session'].includes(url.pathname) && request.method === 'POST') {
        if (request.headers.get('Origin') !== url.origin || !request.headers.get('Content-Type')?.startsWith('application/json')) return json({error: 'Neplatna poziadavka.'}, 403);
        if (Number(request.headers.get('Content-Length') || 0) > 10000) return json({error: 'Prilis dlha poziadavka.'}, 413);
        const text = await request.text();
        if (text.length > 10000) return json({error: 'Prilis dlha poziadavka.'}, 413);
        // Check deployment secret before attempting account login.
        await key(env);
        let body;
        try { body = JSON.parse(text); } catch { throw fail('INPUT'); }
        const data = url.pathname === '/configure-session' ? importSession(body, env) : await login(body, env, fetcher);
        const token = await seal(data, env);
        return json({manifest: url.origin + '/r/' + token + '/manifest.json', expires: new Date(data.exp * 1000).toISOString()});
      }
      if (!['GET', 'HEAD'].includes(request.method)) return json({error: 'Nepovolena metoda.'}, 405);
      if (url.pathname === '/' || url.pathname === '/configure') return reply(page, 'text/html', 200, head);
      if (url.pathname === '/app.js') return reply(app, 'application/javascript', 200, head);
      if (url.pathname === '/health') {
        try { await key(env); return json({ready: true, version: VERSION, pairingReady: Boolean(env.SESSIONS)}, 200, head); }
        catch { return json({ready: false, error: 'Spravca musi nastavit KINORA_SECRET.'}, 503, head); }
      }
      const match = url.pathname.match(/^\/r\/([A-Za-z0-9_-]+)\/(manifest\.json|fastshare\.js|session\.json)$/);
      if (!match) return json({error: 'Nenajdene.'}, 404, head);
      let data;
      try { data = await open(match[1], env); }
      catch { return json({error: 'Prihlasenie je neplatne alebo vyprsalo. Vytvor novu instalacnu URL.'}, 401, head); }
      if (match[2] === 'session.json') return json({hash: data.hash}, 200, head);
      if (match[2] === 'manifest.json') return json({
        name: 'Kinora FastShare — osobne prihlasenie', version: VERSION,
        description: 'Sukromna konfiguracia FastShare. Nastavenia men na webovej prihlasovacej stranke.',
        scrapers: [{id: 'kinora-fastshare-web', name: 'Kinora FastShare', version: VERSION,
          filename: 'fastshare.js', supportedTypes: ['movie', 'tv', 'series'], enabled: true,
          hasSettings: false, contentLanguage: ['sk', 'cs', 'en'], formats: ['mkv', 'mp4', 'avi', 'm4v', 'mov', 'webm', 'ts', 'm2ts']}]
      }, 200, head);
      const config = {sessionEndpoint: url.origin + '/r/' + match[1] + '/session.json', tmdb: data.tmdb, language: data.language, sort: data.sort};
      return reply(providerTemplate.replace('__KINORA_PRIVATE_CONFIG__', () => JSON.stringify(config)), 'application/javascript', 200, head);
    } catch (error) {
      // Do not include exception strings, URLs, submitted credentials or API responses.
      const code = Object.hasOwn(safeErrors, error?.kinoraCode) ? error.kinoraCode : 'INTERNAL';
      return json({error: safeErrors[code][1], code}, safeErrors[code][0], head);
    }
  }};
}
export default makeWorker();
