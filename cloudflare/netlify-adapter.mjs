import worker from './dist/worker.mjs';
const publicPaths=new Set(['/','/configure','/app.js','/manifest.json','/connectivity']);
const deny=()=>Response.json({error:'Použi hlavnú produkčnú adresu doplnku.'},{status:403,headers:{'Cache-Control':'no-store'}});
export function createNetlifyHandler({getStore,handler=worker,tmdb=''}) {
  return async(request,context)=>{
    try {
      // Preview deploys must never initialize or read production account storage.
      const url=new URL(request.url);
      const canonical=new URL(context.site.url);
      if(url.origin!==canonical.origin || canonical.protocol!=='https:')return deny();
      if(['GET','HEAD','OPTIONS'].includes(request.method) && publicPaths.has(url.pathname)) return handler.fetch(request,{});
      const store=getStore({name:'kinora-private-v1',consistency:'strong'});
      let secret=await store.get('installation-key',{type:'text'});
      if(!secret){
        const bytes=crypto.getRandomValues(new Uint8Array(32));
        const candidate=btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
        // Conditional creation makes parallel cold starts use the same durable key.
        await store.set('installation-key',candidate,{onlyIfNew:true});
        secret=await store.get('installation-key',{type:'text'});
      }
      if(!/^[A-Za-z0-9_-]{43}$/.test(secret||''))throw Error('storage');
      const sessions={
        async get(key){
          const record=await store.get('record/'+key,{type:'json'});
          if(!record || (record.expiration && record.expiration<=Date.now()/1000))return null;
          return record.value;
        },
        async put(key,value,options={}){
          await store.set('record/'+key,JSON.stringify({value,expiration:options.expiration||null}));
        }
      };
      return await handler.fetch(request,{KINORA_SECRET:secret,SESSIONS:sessions,TMDB_API_KEY:tmdb});
    }catch{
      // No upstream exception, submitted account, installation key or private URL in logs/responses.
      return Response.json({error:'Trvalé úložisko doplnku nie je dostupné. Skús neskôr.',code:'HOST_STORAGE'},
        {status:503,headers:{'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});
    }
  };
}
