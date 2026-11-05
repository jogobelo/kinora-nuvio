import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
test('configured addon opens the same private manifest in Nuvio or Stremio',async()=>{
 const elements=new Map();let focused='';
 const el=id=>{if(!elements.has(id))elements.set(id,{hidden:true,value:'',addEventListener(type,fn){this[type]=fn;},focus(){focused=id;},before(){},select(){}});return elements.get(id);};
 const manifest='https://kinora.example/a/synthetic-private-token/manifest.json';
 const context={document:{getElementById:el},FormData:class{*[Symbol.iterator](){yield ['username','synthetic-user'];yield ['password','synthetic-password'];}},fetch:async url=>({ok:true,json:async()=>url==='/api/install'?{manifest}:{ready:true}})};
 vm.createContext(context);vm.runInContext(await readFile(new URL('../src/app.js',import.meta.url),'utf8'),context);
 await el('setup').submit({preventDefault(){}});
 assert.equal(el('install').href,'stremio://kinora.example/a/synthetic-private-token/manifest.json');
 assert.equal(el('install-nuvio').href,'nuvio://kinora.example/a/synthetic-private-token/manifest.json');
 assert.equal(el('manifest').value,manifest);assert.equal(el('result').hidden,false);assert.equal(focused,'install-nuvio');
 assert.ok(!el('install-nuvio').href.includes('synthetic-password'));
});
