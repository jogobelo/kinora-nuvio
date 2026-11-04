import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readdir,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {diskStorage,startServer} from '../server.mjs';
test('disk storage persists encrypted records across instances and honours legacy expiration',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'kinora-'));
 try {
  const first=await diskStorage(dir);await first.put('a:opaque','encrypted-record');
  const second=await diskStorage(dir);assert.equal(await second.get('a:opaque'),'encrypted-record');
  await second.put('p:expired','old',{expiration:1});assert.equal(await first.get('p:expired'),null);
  assert.equal(await first.get('unknown'),null);
  for(const name of await readdir(dir))assert.equal((await stat(join(dir,name))).mode&0o777,0o600);
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('portable server retains key, serves manifests and uses canonical public URL',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'kinora-'));let server;
 try{
  server=await startServer({directory:dir,port:0,publicUrl:'https://kinora.example'});
  const url='http://127.0.0.1:'+server.address().port;
  const response=await fetch(url+'/manifest.json');assert.equal(response.status,200);
  assert.equal((await response.json()).id,'sk.kinora.fastshare.http');
  assert.equal((await fetch(url+'/health')).status,200);
  assert.equal((await fetch(url+'/api/install',{method:'POST',headers:{Origin:'https://wrong.example','Content-Type':'application/json'},body:'{}'})).status,403);
  const keyStat=await stat(join(dir,'installation.key'));assert.equal(keyStat.mode&0o777,0o600);
 }finally{if(server)await new Promise(r=>server.close(r));await rm(dir,{recursive:true,force:true});}
});
