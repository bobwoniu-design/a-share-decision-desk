import { marketSnapshot, marketMinutes, MarketError } from "@/lib/tushare";
import { validDate } from "@/lib/market-data";
export const dynamic="force-dynamic";
// Shared, non-personal market data on this owner-private Site. Sites dispatch
// enforces visitor/service authentication. This route never reads any ledger.
export async function GET(request:Request){
  const url=new URL(request.url),date=url.searchParams.get("date")??"",code=url.searchParams.get("code");
  if(!validDate(date)||(code!==null&&!/^\d{6}\.(SH|SZ|BJ)$/.test(code)))return Response.json({error:"请输入有效日期和证券代码"},{status:400});
  try{return Response.json(code?await marketMinutes(code,date):await marketSnapshot(date),{headers:{"Cache-Control":"private, no-store"}});}
  catch(e){return Response.json({error:e instanceof MarketError?e.message:"行情数据校验或存储失败，未使用演示数据替代"},{status:502});}
}
