import {decisionData,decisionMinutes,minuteBasis} from "@/lib/decision-data";
import {decisionFunnel} from "@/lib/funnel";
import {validDate} from "@/lib/market-data";
import {MarketError} from "@/lib/tushare";
import {recordIntraday} from "@/lib/intraday-market";
import {derivedCache} from "@/lib/derived-cache";
import {chinaNow} from "@/lib/minute-engine";
export const dynamic="force-dynamic";
// Read-only, shared market data. Owner-private Sites dispatch enforces access.
export async function GET(request:Request){
  const q=new URL(request.url).searchParams,date=q.get("date")??"",mode=q.get("mode")??"close",code=q.get("code"),view=q.get("view")??"overview";
  const theme=q.get("theme")??"",refresh=q.get("refresh")==="1",ttl=mode==="live"?15000:date===chinaNow().date?60000:7*86400000;
  if(!validDate(date)||!["close","live"].includes(mode)||!["overview","minutes","stock","groups","funnel","basis"].includes(view)||["minutes","stock"].includes(view)&&(!code||!/^\d{6}\.(SH|SZ|BJ)$/.test(code))||view==="basis"&&mode!=="close"||theme&&!/^BK\d+\.DC$/.test(theme))return Response.json({error:"决策查询参数无效"},{status:400});
  try{
    if(view==="basis"){const basis=await minuteBasis(date);return Response.json({date,basisDate:basis.prior.date,ready:true},{headers:{"Cache-Control":"private, no-store"}});}
    if(view==="funnel")return Response.json(await derivedCache(`funnel:${date}:${mode}`,ttl,()=>decisionFunnel(date,mode as "close"|"live"),refresh,v=>v.screenedThemes===0||v.verifiedThemes>0),{headers:{"Cache-Control":"private, no-store"}});
    if(view==="minutes")return Response.json(await derivedCache(`minutes:${date}:${mode}:${code}:${theme}`,ttl,()=>decisionMinutes(code!,date,mode as "close"|"live",theme),refresh,v=>v.bars.length>0&&!v.blocked&&v.peers.every(p=>!p.error)&&v.themePeers.every(p=>!p.error)),{headers:{"Cache-Control":"private, no-store"}});
    if(mode==="close"&&["overview","stock"].includes(view))return Response.json(await derivedCache(`decision:${view}:${date}:${code??""}`,ttl,async()=>{
      const {overview}=await decisionData(date,"close");
      const sector=code?overview.sectors.find(s=>s.cores.some(c=>c.code===code)):null;
      return view==="stock"?{date,core:sector?.cores.find(c=>c.code===code)??null,sector:sector?{...sector,cores:sector.cores.slice(0,10)}:null}:{...overview,sectors:overview.sectors.map(s=>({...s,cores:s.cores.slice(0,10)}))};
    },refresh),{headers:{"Cache-Control":"private, no-store"}});
    const {overview,days}=await decisionData(date,mode as "close"|"live");
    if(view==="groups")return Response.json({date,groups:days.at(-1)!.groups,warnings:overview.warnings,classification:"stock_basic",fetchedAt:overview.fetchedAt},{headers:{"Cache-Control":"private, no-store"}});
    const sector=code?overview.sectors.find(s=>s.cores.some(c=>c.code===code)):null;
    const output=view==="stock"?{date,core:sector?.cores.find(c=>c.code===code)??null,sector:sector?{...sector,cores:sector.cores.slice(0,10)}:null}: {...(mode==="live"?await recordIntraday(overview):overview),sectors:overview.sectors.map(s=>({...s,cores:s.cores.slice(0,10)}))};
    return Response.json(output,{headers:{"Cache-Control":"private, no-store"}});
  }catch(e){return Response.json({error:e instanceof MarketError?e.message:"决策数据读取或校验失败，未输出替代评分"},{status:502});}
}
