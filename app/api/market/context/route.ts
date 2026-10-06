import { marketDates,marketDailyHistory,marketTimeline,MarketError } from "@/lib/tushare";
import { validDate } from "@/lib/market-data";
export const dynamic="force-dynamic";
// Shared market data only; the owner-private Sites dispatch enforces access.
export async function GET(request:Request){
  const q=new URL(request.url).searchParams,date=q.get("date")??"",view=q.get("view"),code=q.get("code")??"",days=Number(q.get("days")??20);
  if(!validDate(date)||![7,20,60].includes(days)||!["calendar","timeline","daily"].includes(view??"")||(view==="daily"&&!/^\d{6}\.(SH|SZ|BJ)$/.test(code))||(view==="timeline"&&days===60))return Response.json({error:"历史查询参数无效"},{status:400});
  try{return Response.json(view==="calendar"?await marketDates(date,days):view==="daily"?await marketDailyHistory(code,date):await marketTimeline(date,days),{headers:{"Cache-Control":"private, no-store"}});}
  catch(e){return Response.json({error:e instanceof MarketError?e.message:"历史行情校验或存储失败"},{status:502});}
}
