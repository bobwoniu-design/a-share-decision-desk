import {decisionData,decisionMinutes} from "@/lib/decision-data";
import {validDate} from "@/lib/market-data";
import {MarketError} from "@/lib/tushare";
export const dynamic="force-dynamic";
// Read-only, shared market data. Owner-private Sites dispatch enforces access.
export async function GET(request:Request){
  const q=new URL(request.url).searchParams,date=q.get("date")??"",mode=q.get("mode")??"close",code=q.get("code"),view=q.get("view")??"overview";
  if(!validDate(date)||!["close","live"].includes(mode)||!["overview","minutes","stock","groups"].includes(view)||["minutes","stock"].includes(view)&&(!code||!/^\d{6}\.(SH|SZ|BJ)$/.test(code)))return Response.json({error:"决策查询参数无效"},{status:400});
  try{
    if(view==="minutes")return Response.json(await decisionMinutes(code!,date,mode as "close"|"live"),{headers:{"Cache-Control":"private, no-store"}});
    const {overview,days}=await decisionData(date,mode as "close"|"live");
    if(view==="groups")return Response.json({date,groups:days.at(-1)!.groups,warnings:overview.warnings,classification:"stock_basic",fetchedAt:overview.fetchedAt},{headers:{"Cache-Control":"private, no-store"}});
    const sector=code?overview.sectors.find(s=>s.cores.some(c=>c.code===code)):null;
    const output=view==="stock"?{date,core:sector?.cores.find(c=>c.code===code)??null,sector:sector?{...sector,cores:sector.cores.slice(0,10)}:null}: {...overview,sectors:overview.sectors.map(s=>({...s,cores:s.cores.slice(0,10)}))};
    return Response.json(output,{headers:{"Cache-Control":"private, no-store"}});
  }catch(e){return Response.json({error:e instanceof MarketError?e.message:"决策数据读取或校验失败，未输出替代评分"},{status:502});}
}
