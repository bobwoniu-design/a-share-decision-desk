import { env } from "cloudflare:workers";
import { dailyRows, minuteRows, breadth, limits, numeric, tradingDates, dailyHistory, type Row, type MarketSnapshot, type MarketTimeline, type DailyHistory } from "./market-data";
type Packet = {rows:Row[];fetchedAt:string};
export class MarketError extends Error {}
const inflight = new Map<string,Promise<Packet>>();
export async function tushare(api:string,params:Record<string,unknown>,fields:string,cap=6000):Promise<Packet> {
  const db = env.DB; if (!db) throw new MarketError("行情缓存暂时不可用");
  const key = JSON.stringify(["v1",api,params,fields]);
  const cached = await db.prepare("SELECT payload FROM market_cache WHERE cache_key = ?").bind(key).first<{payload:string}>();
  if(cached){ const data=JSON.parse(cached.payload) as Packet; if(Date.now()-Date.parse(data.fetchedAt)<86400000) return data; }
  if(inflight.has(key)) return inflight.get(key)!;
  const work = (async()=>{
    const token=(env as unknown as {TUSHARE_TOKEN?:string}).TUSHARE_TOKEN?.trim();
    if(!token) throw new MarketError("尚未配置 TUSHARE_TOKEN");
    const rows:Row[]=[];
    for(let offset=0;offset<30000;offset+=cap){
      let response:Response;
      try { response=await fetch("https://api.tushare.pro",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({api_name:api,token,params:{...params,limit:cap,offset},fields}),signal:AbortSignal.timeout(20000)}); }
      catch {throw new MarketError(`${api} 连接超时或网络不可用`);}
      if(!response.ok) throw new MarketError(`${api} 服务返回 HTTP ${response.status}`);
      const json=await response.json() as {code:number;msg?:string;data?:{fields:string[];items:unknown[][]}};
      if(json.code!==0){
        const message=String(json.msg||"权限、配额或参数异常").split(token).join("[已隐藏]").replace(/[a-fA-F0-9]{24,}/g,"[已隐藏]").slice(0,220);
        throw new MarketError(`${api}：${message}（${json.code}）`);
      }
      if(!Array.isArray(json.data?.fields)||!Array.isArray(json.data?.items)) throw new MarketError(`${api} 数据结构异常`);
      const {fields:cols,items}=json.data;
      rows.push(...items.map(item=>Object.fromEntries(cols.map((f,i)=>[f,item[i]]))));
      if(items.length<cap)break;
      if(offset+cap>=30000) throw new MarketError(`${api} 返回数据超过当前单日上限，未展示不完整汇总`);
    }
    const result={rows,fetchedAt:new Date().toISOString()};
    // Empty responses and failures are not cached, so corrected permissions/data can be retried.
    if(rows.length) await db.prepare("INSERT INTO market_cache(cache_key,payload) VALUES(?,?) ON CONFLICT(cache_key) DO UPDATE SET payload=excluded.payload").bind(key,JSON.stringify(result)).run();
    return result;
  })();
  inflight.set(key,work);try{return await work;}finally{inflight.delete(key);}
}
const limitFields="ts_code,trade_date,name,industry,limit,limit_times,close,pct_chg";
export async function marketSnapshot(date:string):Promise<MarketSnapshot>{
  const d=date.replaceAll("-","");
  const daily=await tushare("daily",{trade_date:d},"ts_code,trade_date,close,pre_close,pct_chg,amount");
  if(!daily.rows.length) throw new MarketError(`${date} 没有返回日线数据。请核对年份、交易日期和数据权限；系统不会换用其他日期。`);
  const prices=dailyRows(daily.rows,date),warnings:string[]=[],sources=[{api:"daily",rows:daily.rows.length,fetchedAt:daily.fetchedAt}];
  async function optional(api:string,params:Record<string,unknown>,fields:string,cap=6000){
    try{const p=await tushare(api,params,fields,cap);sources.push({api,rows:p.rows.length,fetchedAt:p.fetchedAt});return p.rows;}
    catch(e){warnings.push(e instanceof MarketError?e.message:`${api} 暂时不可用`);return null;}
  }
  const [limitRows,basic,calendar]=await Promise.all([
    optional("limit_list_d",{trade_date:d},limitFields,2500),
    optional("stock_basic",{list_status:"L"},"ts_code,name"),
    optional("trade_cal",{exchange:"SSE",start_date:d,end_date:d},"cal_date,is_open,pretrade_date")
  ]);
  if(limitRows?.some(r=>r.trade_date!==d))throw new MarketError("涨跌停数据日期不一致");
  const nameMap=new Map((basic??[]).map(r=>[String(r.ts_code),String(r.name)]));
  const limitMap=new Map((limitRows??[]).map(r=>[String(r.ts_code),r]));
  const sectors=new Map<string,number>();
  for(const r of limitRows??[])if(r.limit==="U") {const sector=String(r.industry||"未分类");sectors.set(sector,(sectors.get(sector)||0)+1);}
  let premium:MarketSnapshot["premium"]=null;
  const prev=String(calendar?.[0]?.pretrade_date??"");
  if(/^\d{8}$/.test(prev)){
    const yesterday=await optional("limit_list_d",{trade_date:prev,limit_type:"U"},limitFields,2500);
    if(yesterday){const wanted=new Set(yesterday.map(r=>String(r.ts_code))),matched=prices.filter(r=>wanted.has(r.code));premium={value:matched.length?matched.reduce((a,r)=>a+r.pct,0)/matched.length:null,matched:matched.length,total:wanted.size,date:prev};}
  }
  const leaders=prices.filter(r=>limitMap.get(r.code)?.limit==="U").sort((a,b)=>(numeric(limitMap.get(b.code)?.limit_times)??0)-(numeric(limitMap.get(a.code)?.limit_times)??0)||b.amount-a.amount).slice(0,8);
  const active=prices.filter(r=>r.pct>0).sort((a,b)=>b.amount-a.amount);
  const chosen=[...new Map([...leaders,...active].map(r=>[r.code,r])).values()].slice(0,20);
  return {date,fetchedAt:new Date().toISOString(),source:"Tushare",coverage:breadth(prices),limits:limits(limitRows),premium,
    sectors:[...sectors].map(([name,count])=>({name,count})).sort((a,b)=>b.count-a.count),
    candidates:chosen.map(r=>{const l=limitMap.get(r.code);return {...r,name:String(l?.name??nameMap.get(r.code)??r.code),industry:String(l?.industry??"未分类"),label:l?.limit==="U"?`${numeric(l.limit_times)??1}板 · 收盘涨停`:"上涨成交活跃"};}),warnings,sources};
}
export async function marketMinutes(code:string,date:string){
  const result=await tushare("stk_mins",{ts_code:code,freq:"1min",start_date:date+" 09:00:00",end_date:date+" 15:30:00"},"ts_code,trade_time,open,high,low,close,vol,amount",8000);
  return {code,date,source:"Tushare stk_mins",fetchedAt:result.fetchedAt,rows:result.rows,bars:minuteRows(result.rows,code,date)};
}

export async function marketDates(date:string,count:number){
  const start=new Date(date+"T00:00:00Z");start.setUTCDate(start.getUTCDate()-Math.ceil(count*2.6)-20);
  const packet=await tushare("trade_cal",{exchange:"SSE",start_date:start.toISOString().slice(0,10).replaceAll("-",""),end_date:date.replaceAll("-","")},"cal_date,is_open,pretrade_date");
  const dates=tradingDates(packet.rows,date,count);
  if(!dates.length)throw new MarketError("没有取得该日期之前的交易日历");
  return {date,dates,requestedDays:count,fetchedAt:packet.fetchedAt};
}
export async function marketDailyHistory(code:string,date:string):Promise<DailyHistory>{
  const {dates}=await marketDates(date,60),params={ts_code:code,start_date:dates[0].replaceAll("-",""),end_date:dates.at(-1)!.replaceAll("-","")};
  const packet=await tushare("daily",params,"ts_code,trade_date,close,pre_close,pct_chg,amount");
  if(!packet.rows.length)throw new MarketError("该证券在所选60个交易日内没有A股日线。请核对代码；基金暂不纳入此视图。");
  let factors:Row[]=[],warnings:string[]=[];
  try{factors=(await tushare("adj_factor",params,"ts_code,trade_date,adj_factor")).rows;}catch(e){warnings.push(e instanceof MarketError?e.message:"复权因子读取失败");}
  const result=dailyHistory(packet.rows,factors,code,dates);
  if(!result.adjusted)warnings.push("复权因子不完整：仅展示原始收盘价，不计算跨日收益和均线。");
  if(result.missingDates.length)warnings.push(`窗口内有 ${result.missingDates.length} 个交易日缺少行情（可能停牌或尚未上市），未用前值补齐。`);
  return {...result,date,warnings,fetchedAt:packet.fetchedAt};
}
export async function marketTimeline(date:string,count:number):Promise<MarketTimeline>{
  const {dates}=await marketDates(date,count),points:MarketTimeline["points"]=[],failures:MarketTimeline["failures"]=[];
  // Bounded batches keep account rate limits and single-worker outbound concurrency predictable.
  for(let i=0;i<dates.length;i+=2){
    const results=await Promise.allSettled(dates.slice(i,i+2).map(d=>marketSnapshot(d)));
    results.forEach((r,n)=>{if(r.status==="fulfilled"){const {date,coverage,limits,premium,sectors,warnings}=r.value;points.push({date,coverage,limits,premium,sectors,warnings});}else failures.push({date:dates[i+n],error:r.reason instanceof MarketError?r.reason.message:"该日数据读取或校验失败"});});
  }
  return {date,dates,points:points.sort((a,b)=>a.date.localeCompare(b.date)),failures,fetchedAt:new Date().toISOString()};
}
