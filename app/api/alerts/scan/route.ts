import {env} from "cloudflare:workers";
import {decisionFunnel} from "@/lib/funnel";
import {decisionMinutes} from "@/lib/decision-data";
import {marketDates} from "@/lib/tushare";
import {calculate,type Ledger} from "@/lib/ledger";
import {chinaNow,liveSession,minuteEngine,sectorMinuteEngine} from "@/lib/minute-engine";

export const dynamic="force-dynamic";
type ScanTarget={code:string;name:string;theme:string;held:boolean};
type ScanRequest={action:"pool"|"scan"|"test";date?:string;target?:ScanTarget};
const stockCode=/^\d{6}\.(SH|SZ|BJ)$/;
const themeCode=/^BK\d+\.DC$/;
const runtime=env as unknown as {DB?:D1Database;SCAN_KEY?:string;BARK_URL?:string};
const noStore={"Cache-Control":"private, no-store"};

function authorized(request:Request){
  const secret=runtime.SCAN_KEY;
  return !!secret&&request.headers.get("x-scan-key")===secret;
}

async function ownerLedger(){
  const db=runtime.DB;
  if(!db)throw new Error("提醒记录暂不可用");
  const rows=await db.prepare("SELECT owner,payload FROM ledgers ORDER BY updated_at DESC LIMIT 2").all<{owner:string;payload:string}>();
  if(rows.results.length>1)throw new Error("存在多个个人账本，后台扫描已暂停以避免串户");
  const row=rows.results[0];
  return {owner:row?.owner??"site-owner",ledger:row?JSON.parse(row.payload) as Ledger:null};
}

async function pushBark(title:string,body:string){
  const raw=runtime.BARK_URL;
  if(!raw)throw new Error("Bark 尚未配置");
  const destination=new URL(raw);
  if(destination.protocol!=="https:"||destination.hostname!=="api.day.app"||!/^\/[A-Za-z0-9_-]+\/?$/.test(destination.pathname))throw new Error("Bark 地址格式无效");
  const response=await fetch(destination.toString(),{method:"POST",headers:{"Content-Type":"application/json; charset=utf-8"},body:JSON.stringify({title,body,group:"短线决策台",url:"https://a-share-decision-desk.bobzhou198.chatgpt.site/?view=selection"}),signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw new Error(`Bark 返回 HTTP ${response.status}`);
  const result=await response.json().catch(()=>null) as {code?:number}|null;
  if(result?.code!==200)throw new Error("Bark 未确认送达");
}

async function targetsFor(date:string){
  const dates=(await marketDates(date,20)).dates;
  if(dates.at(-1)!==date)return {basisDate:null,targets:[] as ScanTarget[],reason:"今日不是交易日"};
  const basisDate=dates.at(-2);
  if(!basisDate)return {basisDate:null,targets:[] as ScanTarget[],reason:"缺少前一交易日"};
  const [{candidates},{ledger}]=await Promise.all([decisionFunnel(basisDate,"close"),ownerLedger()]);
  const positions=ledger?calculate(ledger.trades).positions:[];
  const held=new Set(positions.map(p=>p.code));
  const targets=new Map<string,ScanTarget>();
  candidates.forEach(c=>targets.set(c.code,{code:c.code,name:c.name,theme:c.theme?.code??"",held:held.has(c.code)}));
  ledger?.watchlist?.forEach(stock=>{
    if(stockCode.test(stock.code)&&!targets.has(stock.code))targets.set(stock.code,{code:stock.code,name:stock.name,theme:"",held:held.has(stock.code)});
  });
  positions.forEach(p=>{if(!targets.has(p.code))targets.set(p.code,{code:p.code,name:p.name,theme:"",held:true});});
  return {basisDate,targets:[...targets.values()],reason:""};
}

async function claim(owner:string,date:string,code:string,kind:string,barTime:string){
  const now=new Date().toISOString();
  const retryBefore=new Date(Date.now()-120000).toISOString();
  const row=await runtime.DB!.prepare("INSERT INTO alert_events(owner,date,code,kind,bar_time,status,updated_at) VALUES(?,?,?,?,?,'pending',?) ON CONFLICT(owner,date,code,kind) DO UPDATE SET bar_time=excluded.bar_time,updated_at=excluded.updated_at WHERE alert_events.status='pending' AND alert_events.updated_at<?")
    .bind(owner,date,code,kind,barTime,now,retryBefore).run();
  return !!row.meta.changes;
}

export async function POST(request:Request){
  if(!authorized(request))return Response.json({error:"无权运行后台扫描"},{status:403,headers:noStore});
  let input:ScanRequest;
  try{input=await request.json() as ScanRequest;}catch{return Response.json({error:"请求格式无效"},{status:400,headers:noStore});}
  const now=chinaNow(),date=input.date??now.date;
  if(date!==now.date||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(date))return Response.json({error:"只能扫描北京时间当天"},{status:400,headers:noStore});
  if(input.action==="test"){
    try{await pushBark("短线决策台 · 提醒测试","Bark 连接成功。此消息仅验证推送通道，不是交易信号。");return Response.json({delivered:true},{headers:noStore});}
    catch(e){return Response.json({error:e instanceof Error?e.message:"推送失败"},{status:502,headers:noStore});}
  }
  if(!liveSession(now.time)||now.time>"15:00")return Response.json({date,skipped:"非连续竞价时段"},{headers:noStore});
  try{
    if(input.action==="pool")return Response.json({date,...await targetsFor(date)},{headers:noStore});
    if(input.action!=="scan"||!input.target||!stockCode.test(input.target.code)||input.target.name.length>30||input.target.theme&&!themeCode.test(input.target.theme)||typeof input.target.held!=="boolean")return Response.json({error:"扫描目标无效"},{status:400,headers:noStore});
    const {code,name,theme,held}=input.target;
    const bundle=await decisionMinutes(code,date,"live",theme);
    if(bundle.stale||bundle.blocked||!bundle.bars.length)return Response.json({code,skipped:bundle.stale?"分钟数据延迟":"分钟数据不足或权限受限"},{headers:noStore});
    const times=bundle.bars.map(b=>b.time);
    const industry=sectorMinuteEngine(bundle.peers,times),subject=sectorMinuteEngine(bundle.themePeers,times);
    const current=minuteEngine(bundle.bars,{preClose:bundle.preClose??undefined,floatShares:bundle.floatShares??undefined,upLimit:bundle.upLimit??undefined,mainlineCore:bundle.mainlineCore,themeAllowed:bundle.themeAllowed,marketAllowed:bundle.marketAllowed,sector:industry.frames,theme:subject.frames}).current;
    if(!current||!current.quality)return Response.json({code,skipped:"当前分钟不完整"},{headers:noStore});
    const buy=current.signal.match(/^第([一二三])笔条件出现：(.+)$/);
    const sell=held&&["逻辑失效","风险：转弱"].includes(current.signal);
    if(!buy&&!sell)return Response.json({code,time:current.time,signal:current.signal,sent:false},{headers:noStore});
    const kind=buy?`买点${buy[1]}`:current.signal;
    const {owner}=await ownerLedger();
    if(!await claim(owner,date,code,kind,current.time))return Response.json({code,time:current.time,signal:current.signal,sent:false,duplicate:true},{headers:noStore});
    try{
      const title=`${name} · ${sell?"持仓风险":"买点条件"}`;
      const body=`${date} ${current.time} · ${code}\n${current.signal}\n个股${current.phase}，行业${industry.current?.phase??"待核验"}，题材${theme?subject.current?.phase??"待核验":"未匹配"}。请人工核对行情和可成交性；系统不自动下单。`;
      await pushBark(title,body);
      await runtime.DB!.prepare("UPDATE alert_events SET status='sent',updated_at=? WHERE owner=? AND date=? AND code=? AND kind=? AND bar_time=? AND status='pending'").bind(new Date().toISOString(),owner,date,code,kind,current.time).run();
      return Response.json({code,time:current.time,signal:current.signal,sent:true},{headers:noStore});
    }catch(e){
      await runtime.DB!.prepare("DELETE FROM alert_events WHERE owner=? AND date=? AND code=? AND kind=? AND bar_time=? AND status='pending'").bind(owner,date,code,kind,current.time).run();
      throw e;
    }
  }catch(e){return Response.json({error:e instanceof Error?e.message:"扫描失败"},{status:502,headers:noStore});}
}
