import {validDate} from "@/lib/market-data";
import {validateSignals} from "@/lib/signal-validation";
import {MarketError} from "@/lib/tushare";
export const dynamic="force-dynamic";

export async function GET(request:Request){
  const q=new URL(request.url).searchParams,date=q.get("date")??"",code=q.get("code")??"",theme=q.get("theme")??"",days=Number(q.get("days")??"3");
  if(!validDate(date)||!/^\d{6}\.(SH|SZ|BJ)$/.test(code)||!/^BK\d+\.DC$/.test(theme)||![1,3,5].includes(days))return Response.json({error:"检验参数无效"},{status:400});
  try{return Response.json(await validateSignals(code,theme,date,days),{headers:{"Cache-Control":"private, no-store"}});}
  catch(e){return Response.json({error:e instanceof MarketError?e.message:"历史检验暂时不可用，请稍后重试"},{status:502});}
}
