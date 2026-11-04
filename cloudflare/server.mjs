// Portable Node host. Video playback goes directly from FastShare to the TV.
import {createServer} from 'node:http';
import {readFile,writeFile,mkdir,rename,unlink} from 'node:fs/promises';
import {createHash,randomBytes} from 'node:crypto';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import worker from './dist/worker.mjs';

export async function diskStorage(directory) {
  await mkdir(directory,{recursive:true,mode:0o700});
  const filename=key=>join(directory,createHash('sha256').update(key).digest('hex')+'.json');
  return {
    async get(key){
      try {
        const stored=JSON.parse(await readFile(filename(key),'utf8'));
        if(stored.expiration && stored.expiration<=Date.now()/1000) return null;
        return stored.value;
      }catch(error){if(error.code==='ENOENT') return null;throw error;}
    },
    async put(key,value,options={}){
      const destination=filename(key);
      const temp=destination+'.'+randomBytes(8).toString('hex')+'.tmp';
      try {
        await writeFile(temp,JSON.stringify({value,expiration:options.expiration||null}),{mode:0o600,flag:'wx'});
        await rename(temp,destination);
      }finally{await unlink(temp).catch(error=>{if(error.code!=='ENOENT')throw error;});}
    }
  };
}
async function installationKey(directory) {
  const filename=join(directory,'installation.key');
  try {await writeFile(filename,randomBytes(32).toString('base64url'),{flag:'wx',mode:0o600});}
  catch(error){if(error.code!=='EEXIST')throw error;}
  const value=(await readFile(filename,'utf8')).trim();
  if(!/^[A-Za-z0-9_-]{43}$/.test(value)) throw Error('Invalid installation key');
  return value;
}
export async function startServer(options={}) {
  const directory=resolve(options.directory||process.env.DATA_DIR||'./data');
  const sessions=await diskStorage(directory);
  const publicUrl=new URL(options.publicUrl||process.env.PUBLIC_URL||'http://localhost:8080');
  if(publicUrl.pathname!=='/' || publicUrl.search || publicUrl.hash || publicUrl.username || publicUrl.password ||
    (publicUrl.protocol!=='https:' && !(['localhost','127.0.0.1'].includes(publicUrl.hostname) && publicUrl.protocol==='http:'))) throw Error('PUBLIC_URL must be HTTPS origin (HTTP allowed only on localhost)');
  const env={KINORA_SECRET:process.env.KINORA_SECRET||await installationKey(directory),SESSIONS:sessions,TMDB_API_KEY:process.env.TMDB_API_KEY||''};
  const handler=options.worker||worker;
  const server=createServer(async(req,res)=>{
    try {
      if(!req.url?.startsWith('/') || req.url.startsWith('//')) {res.writeHead(400).end();return;}
      const chunks=[];let bytes=0;
      for await(const chunk of req){bytes+=chunk.length;if(bytes>10000){res.writeHead(413).end();return;}chunks.push(chunk);}
      const request=new Request(publicUrl.origin+req.url,{method:req.method,headers:req.headers,
        ...(!['GET','HEAD'].includes(req.method)?{body:Buffer.concat(chunks)}:{})});
      const response=await handler.fetch(request,env);
      res.writeHead(response.status,Object.fromEntries(response.headers));
      res.end(Buffer.from(await response.arrayBuffer()));
    }catch{if(!res.headersSent)res.writeHead(500,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end('{"error":"Server request failed"}');}
  });
  server.requestTimeout=60000;
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(options.port??Number(process.env.PORT||8080),options.host||process.env.HOST||'127.0.0.1',resolve);});
  return server;
}
if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  startServer().then(()=>console.log('Kinora server ready; request logging disabled.')).catch(()=>{console.error('Kinora startup failed. Check PUBLIC_URL, DATA_DIR and installation key.');process.exitCode=1;});
}
