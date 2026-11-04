// HTTP addon protocol. Account records are encrypted in the owner's KV namespace.
function addonManifest(configured) {
  return {id:'sk.kinora.fastshare.http', version:'0.4.0', name:'Kinora FastShare',
    description:'FastShare pre Nuvio a Stremio. Nastavenie účtu cez web, bez párovania s mobilom.',
    resources:[{name:'stream',types:['movie','series'],idPrefixes:['tt','tmdb:']}],
    types:['movie','series'], catalogs:[],
    behaviorHints:{configurable:true,configurationRequired:!configured}};
}
async function readAccount(token, env, h) {
  if (!/^[A-Za-z0-9_-]{32}$/.test(token)) throw h.fail('INPUT');
  const ciphertext = await h.kv(env).get('a:' + token);
  if (!ciphertext) return null;
  try {
    const bytes = h.unb64(ciphertext);
    const plain = await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes.slice(0,12),additionalData:new TextEncoder().encode('kinora-v1')}, await h.key(env), bytes.slice(12));
    const account = JSON.parse(new TextDecoder().decode(plain));
    if (account.kind !== 'http-account') return null;
    return account;
  } catch { return null; }
}
async function addonMetadata(id, type, account, fetcher) {
  if (/^tmdb:\d+$/.test(id)) return id.slice(5);
  if (!/^tt\d+$/.test(id)) throw Error('id');
  if (account.tmdb) {
    const key = account.tmdb;
    const u = new URL('https://api.themoviedb.org/3/find/' + id);
    u.searchParams.set('external_source','imdb_id');
    const headers = {};
    if (/^[a-f0-9]{32}$/i.test(key)) u.searchParams.set('api_key',key);
    else headers.Authorization = 'Bearer ' + key;
    const response = await fetcher(u.toString(),{headers,signal:AbortSignal.timeout(12000)});
    if (!response.ok) throw Error('metadata');
    const data = await response.json();
    const match = (type === 'movie' ? data.movie_results : data.tv_results)?.[0];
    if (!Number.isInteger(match?.id)) throw Error('metadata');
    return String(match.id);
  }
  // Cinemeta fallback supports IMDb IDs without a personal TMDB key.
  const response = await fetcher('https://v3-cinemeta.strem.io/meta/' + type + '/' + id + '.json',{signal:AbortSignal.timeout(12000)});
  if (!response.ok) throw Error('metadata');
  const meta = (await response.json()).meta;
  if (!meta?.name) throw Error('metadata');
  return {id:1,title:meta.name,name:meta.name,original_title:meta.name,
    release_date:String(meta.releaseInfo || '').slice(0,4) + '-01-01',first_air_date:String(meta.releaseInfo || '').slice(0,4) + '-01-01'};
}
export async function handleAddon(request, env, fetcher, h) {
  const url = new URL(request.url);
  if (url.pathname === '/connectivity' && request.method === 'GET') {
    try {
      const r = await fetcher('https://fastshare.cz/api/api_kodi.php?process=search&pagination=1&term=Matrix&adult=0',{redirect:'manual',signal:AbortSignal.timeout(12000),headers:{Accept:'application/json'}});
      return h.json({fastshareStatus:r.status,ready:r.ok});
    } catch {return h.json({fastshareStatus:null,ready:false},502);}
  }
  if (request.method === 'OPTIONS') return h.reply('', 'text/plain',204);
  if (url.pathname === '/manifest.json' && ['GET','HEAD'].includes(request.method)) return h.json(addonManifest(false),200,request.method==='HEAD');
  const match = url.pathname.match(/^\/a\/([A-Za-z0-9_-]+)\/(manifest\.json|configure|stream\/(movie|series)\/([^/]+)\.json)$/);
  if (url.pathname !== '/api/install' && !match) return null;
  if (url.pathname === '/api/install') {
    if (request.method !== 'POST') return h.json({error:'Nepovolená metóda.'},405);
    if (request.headers.get('Origin') !== url.origin || !request.headers.get('Content-Type')?.startsWith('application/json')) return h.json({error:'Neplatná požiadavka.'},403);
    const raw = await request.text();
    if (raw.length>10000) throw h.fail('INPUT');
    let body; try { body=JSON.parse(raw); } catch {throw h.fail('INPUT');}
    // Validate before persisting. A failed login must never produce an install URL.
    const verified = await h.login(body,env,fetcher);
    const account={kind:'http-account',username:body.username.trim(),password:body.password,
      tmdb:verified.tmdb,language:verified.language,sort:verified.sort};
    const token= btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(24)))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
    // No expiration: installation remains valid until explicitly revoked/deleted.
    await h.kv(env).put('a:'+token,await h.seal(account,env));
    return h.json({manifest:url.origin+'/a/'+token+'/manifest.json'});
  }
  if (!['GET','HEAD'].includes(request.method)) return h.json({error:'Nepovolená metóda.'},405);
  if (match[2] === 'configure') return new Response(null,{status:302,headers:{Location:url.origin+'/configure','Referrer-Policy':'no-referrer','Cache-Control':'no-store'}});
  const account=await readAccount(match[1],env,h);
  if (!account) return h.json({error:'Konfigurácia neexistuje. Otvor /configure a nastav účet.'},401);
  if(match[2]==='manifest.json') return h.json(addonManifest(true),200,request.method==='HEAD');
  let rawId; try {rawId=decodeURIComponent(match[4]);}catch {return h.json({error:'Neplatné ID.'},400);}
  const type=match[3];
  const parsed=rawId.match(/^(tt\d+|tmdb:\d+)(?::(\d+):(\d+))?$/);
  if(!parsed || (type==='series' && (!parsed[2] || !parsed[3])) || (type==='movie' && parsed[2])) return h.json({error:'Neplatné ID alebo číslo epizódy.'},400);
  let upstreamFailure=null;
  try {
    const meta=await addonMetadata(parsed[1],type,account,fetcher);
    const tmdbId=typeof meta==='string'?meta:'1';
    const providerFetch=async (raw, options={})=>{
      const target=new URL(raw);
      if(typeof meta==='object' && target.hostname==='api.themoviedb.org') return Response.json(meta);
      // Fixed provider destinations; never include upstream URLs in error responses.
      const response=await fetcher(raw,{...options,signal:AbortSignal.timeout(12000)});
      if (!response.ok && target.hostname==='fastshare.cz') {
        upstreamFailure=response.status===403?'FS_HTTP_403':response.status===429?'FS_HTTP_429':'FS_HTTP';
      }
      return response;
    };
    const provider=createProvider({...account,tmdb:account.tmdb || 'cinemeta-fallback'},providerFetch);
    const found=await provider.getStreams(tmdbId,type,parsed[2],parsed[3]);
    const streams=found.map(stream=>({name:stream.name,title:stream.title,url:stream.url,
      behaviorHints:{notWebReady:true,proxyHeaders:{request:stream.headers},bingeGroup:'kinora-'+stream.language+'-'+stream.quality}}));
    return h.json({streams},200,request.method==='HEAD');
  } catch {
    if(upstreamFailure) throw h.fail(upstreamFailure);
    return h.json({error:'Kinora nedokázala načítať zdroje. Over pripojenie, účet a prípadne TMDB kľúč.',code:'STREAM_LOOKUP'},502);
  }
}
