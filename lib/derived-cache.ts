import {env} from "cloudflare:workers";

type Cached<T>={expires:number;value:T};
const pending=new Map<string,Promise<unknown>>();

/** Cache only validated, successful derived results. Raw Tushare data retains its own cache. */
export async function derivedCache<T>(key:string,ttlMs:number,compute:()=>Promise<T>,refresh=false):Promise<T>{
  const db=env.DB,cacheKey=`derived:v2:${key}`;
  if(!refresh&&db){
    try{
      const row=await db.prepare("SELECT payload FROM market_cache WHERE cache_key=?").bind(cacheKey).first<{payload:string}>();
      if(row){const cached=JSON.parse(row.payload) as Cached<T>;if(cached.expires>Date.now())return cached.value;}
    }catch{/* Cache misses must never suppress a valid market calculation. */}
  }
  const running=pending.get(cacheKey) as Promise<T>|undefined;
  if(running)return running;
  const work=(async()=>{
    const value=await compute();
    if(db){
      try{
        const payload=JSON.stringify({expires:Date.now()+ttlMs,value} satisfies Cached<T>);
        if(new TextEncoder().encode(payload).byteLength<1_800_000)await db.prepare("INSERT INTO market_cache(cache_key,payload) VALUES(?,?) ON CONFLICT(cache_key) DO UPDATE SET payload=excluded.payload").bind(cacheKey,payload).run();
      }catch{/* Results remain usable if cache storage is unavailable. */}
    }
    return value;
  })();
  pending.set(cacheKey,work);
  try{return await work;}finally{pending.delete(cacheKey);}
}
