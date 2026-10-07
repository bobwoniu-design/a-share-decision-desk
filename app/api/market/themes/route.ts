import { validDate } from "@/lib/market-data";
import { MarketError } from "@/lib/tushare";
import { themeDetail, themeOverview } from "@/lib/theme-data";
import {derivedCache} from "@/lib/derived-cache";
import {chinaNow} from "@/lib/minute-engine";

export const dynamic="force-dynamic";
export async function GET(request:Request){
  const q=new URL(request.url).searchParams,date=q.get("date")??"",mode=q.get("mode")??"close",view=q.get("view")??"overview",code=q.get("code")??"",refresh=q.get("refresh")==="1";
  if(!validDate(date)||!["close","live"].includes(mode)||!["overview","detail"].includes(view)||view==="detail"&&!/^BK\d+\.DC$/.test(code))return Response.json({error:"题材查询参数无效"},{status:400});
  try{return Response.json(view==="detail"?await derivedCache(`theme-detail:${date}:${mode}:${code}`,mode==="live"?30000:date===chinaNow().date?60000:7*86400000,()=>themeDetail(date,mode as "close"|"live",code),refresh):await themeOverview(date,mode as "close"|"live",refresh),{headers:{"Cache-Control":"private, no-store"}});}
  catch(e){return Response.json({error:e instanceof MarketError?e.message:"题材数据校验或存储失败，未输出替代排名"},{status:502});}
}
