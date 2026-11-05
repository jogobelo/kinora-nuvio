import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createNetlifyHandler} from '../netlify-adapter.mjs';
import {makeWorker} from '../dist/worker.mjs';
const origin='https://kinora.example.netlify.app';
const context={site:{url:origin}};
function setup(){
 const data=new Map();
 const store={
  async get(key,{type}){const value=data.get(key);return value===undefined?null:type==='json'?JSON.parse(value):value;},
  async set(key,value,options={}){if(options.onlyIfNew && data.has(key))return {modified:false};data.set(key,value);return {modified:true};}
 };
 const getStore=options=>{assert.equal(options.consistency,'strong');return store;};
 const handler=makeWorker(async()=>Response.json({user:{hash:'synthetic-session-12345'}}));
 return {data,getStore,handler,create:()=>createNetlifyHandler({getStore,handler})};
}
test('parallel cold starts create one durable key; accounts survive a new function instance',async()=>{
 const s=setup();
 const responses=await Promise.all(Array.from({length:20},()=>s.create()(new Request(origin+'/health'),context)));
 for(const response of responses)assert.equal((await response.json()).ready,true);
 assert.equal(s.data.size,1);
 const installationKey=s.data.get('installation-key');
 assert.equal(installationKey.length,43);
 const response=await s.create()(new Request(origin+'/api/install',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({username:'synthetic-user',password:'synthetic-password'})}),context);
 assert.equal(response.status,200);
 const {manifest}=await response.json();
 assert.ok(![...s.data.values()].join('').includes('synthetic-password'));
 assert.ok(!manifest.includes('synthetic-password'));
 const anotherInstance=s.create();
 const m=await anotherInstance(new Request(manifest),context);
 assert.equal(m.status,200);assert.equal((await m.json()).behaviorHints.configurationRequired,false);
 assert.equal(s.data.get('installation-key'),installationKey);
});
test('deploy preview cannot read production key or records',async()=>{
 let reads=0;
 const handler=createNetlifyHandler({getStore:()=>{reads++;throw Error('must not access');}});
 const r=await handler(new Request('https://deploy-preview-7--kinora.netlify.app/health'),context);
 assert.equal(r.status,403);assert.equal(reads,0);
});
test('public config works without storage; storage outages never disclose errors',async()=>{
 const handler=createNetlifyHandler({getStore:()=>{throw Error('synthetic-private-detail');}});
 assert.equal((await handler(new Request(origin+'/configure'),context)).status,200);
 const r=await handler(new Request(origin+'/health'),context);
 assert.equal(r.status,503);assert.ok(!(await r.text()).includes('synthetic-private-detail'));
});
