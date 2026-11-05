import {test} from 'node:test';
import assert from 'node:assert/strict';
import {makeWorker} from '../dist/worker.mjs';
const origin='https://kinora.example';
const password='synthetic-password';
function setup(status=200){
 const records=new Map();
 const env={KINORA_SECRET:Buffer.alloc(32,42).toString('base64url'),SESSIONS:{get:async k=>records.get(k),put:async(k,v,options)=>{assert.equal(options,undefined);records.set(k,v);}}};
 const worker=makeWorker(async raw=>{
  const u=new URL(raw);
  if(u.hostname==='v3-cinemeta.strem.io') return Response.json({meta:{name:'Matrix',releaseInfo:'1999'}});
  if(u.searchParams.get('process')==='login'){
   assert.equal(u.searchParams.get('password'),password);
   return status===200?Response.json({user:{hash:'synthetic-hash-12345'}}):new Response('',{status});
  }
  if(u.searchParams.get('process')==='search') return Response.json({search:{file:[
   {id:1,filename:'Matrix.1999.CZ.1080p.mkv',data:{value:2e9},download_url:'https://cdn.fastshare.cz/film.mkv'},
   {id:2,filename:'Matrix.S03E01.SK.720p.mkv',data:{value:1e9},download_url:'https://cdn.fastshare.cz/episode.mkv'}]}});
  throw Error('Unexpected test destination');
 });
 const install=()=>worker.fetch(new Request(origin+'/api/install',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({username:'synthetic-user',password})}),env);
 return {worker,env,install,records};
}
test('HTTP addon config, stable encrypted account, film/episode streams and request headers',async()=>{
 const {worker,env,install,records}=setup();
 const publicManifest=await (await worker.fetch(new Request(origin+'/manifest.json'),env)).json();
 assert.equal(publicManifest.name,'Kinora');
 assert.equal(publicManifest.version,'0.4.1');
 assert.equal(publicManifest.behaviorHints.configurationRequired,true);
 const response=await install(); assert.equal(response.status,200);
 const {manifest,expires}=await response.json(); assert.equal(expires,undefined);
 assert.ok(manifest.includes('/a/')); assert.ok(!manifest.includes(password));
 assert.ok(![...records.values()].join('').includes(password));
 const config=await(await worker.fetch(new Request(manifest),env)).json();
 assert.equal(config.behaviorHints.configurationRequired,false);
 assert.ok(config.resources[0].types.includes('series'));
 for(const [type,id,file] of [['movie','tt0133093','film'],['series','tt0133093:3:1','episode']]) {
  const r=await worker.fetch(new Request(manifest.replace('manifest.json','stream/'+type+'/'+id+'.json')),env);
  assert.equal(r.status,200); assert.equal(r.headers.get('Access-Control-Allow-Origin'),'*');
  const {streams}=await r.json(); assert.equal(streams.length,1);
  assert.equal(streams[0].url,'https://cdn.fastshare.cz/'+file+'.mkv');
  assert.equal(streams[0].behaviorHints.proxyHeaders.request.Cookie,'FASTSHARE=synthetic-hash-12345');
 }
 const previousNow=Date.now;Date.now=()=>previousNow()+2*365*86400000;
 try {assert.equal((await worker.fetch(new Request(manifest),env)).status,200);}finally{Date.now=previousNow;}
 assert.equal((await worker.fetch(new Request(manifest.replace('/a/','/a/AA')),env)).status,400);
});
test('upstream 403 never creates misleading installation or stores credentials',async()=>{
 const {install,records}=setup(403);const response=await install();
 assert.equal(response.status,502);const data=await response.json();assert.equal(data.code,'FS_HTTP_403');
 assert.equal(records.size,0);assert.ok(!JSON.stringify(data).includes(password));
});
test('foreign form origin is rejected before login',async()=>{
 const {worker,env,records}=setup();
 const r=await worker.fetch(new Request(origin+'/api/install',{method:'POST',headers:{Origin:'https://foreign.example','Content-Type':'application/json'},body:'{}'}),env);
 assert.equal(r.status,403);assert.equal(records.size,0);
});
test('CORS preflight is bodyless and manifests support HEAD',async()=>{
 const {worker,env}=setup();
 const r=await worker.fetch(new Request(origin+'/manifest.json',{method:'OPTIONS'}),env);
 assert.equal(r.status,204);assert.equal(await r.text(),'');
 assert.equal(r.headers.get('Access-Control-Allow-Origin'),'*');
 const head=await worker.fetch(new Request(origin+'/manifest.json',{method:'HEAD'}),env);
 assert.equal(head.status,200);assert.equal(await head.text(),'');
});
