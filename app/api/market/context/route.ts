import { marketDates,marketDailyHistory,marketTimeline,marketSectorOverview,MarketError } from "@/lib/tushare";
import { validDate } from "@/lib/market-data";
import { derivedCache } from "@/lib/derived-cache";
export const dynamic="force-dynamic";
// Shared market data only; the owner-private Sites dispatch enforces access.
export async function GET(request:Request){
  const q=new URL(request.url).searchParams,date=q.get("date")??"",view=q.get("view"),code=q.get("code")??"",days=Number(q.get("days")??20);
  if(!validDate(date)||![7,20,60].includes(days)||!["calendar","timeline","daily","sectors"].includes(view??"")||(view==="daily"&&!/^\d{6}\.(SH|SZ|BJ)$/.test(code))||(view==="timeline"&&days===60))return Response.json({error:"历史查询参数无效"},{status:400});
  try{return Response.json(view==="sectors"?await marketSectorOverview(date):view==="calendar"?await marketDates(date,days):view==="daily"?await marketDailyHistory(code,date):await derivedCache(`market-timeline:${date}:${days}`,7*86400000,()=>marketTimeline(date,days),false,result=>result.failures.length===0&&result.points.length===result.dates.length&&result.points.every(point=>point.warnings.length===0)),{headers:{"Cache-Control":"private, no-store"}});}
  catch(e){return Response.json({error:e instanceof MarketError?e.message:"历史行情校验或存储失败"},{status:502});}
}
