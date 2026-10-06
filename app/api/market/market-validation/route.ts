import {decisionData} from "@/lib/decision-data";
import {marketValidation} from "@/lib/market-validation";
import {validDate} from "@/lib/market-data";
import {MarketError} from "@/lib/tushare";
export const dynamic="force-dynamic";
export async function GET(request:Request){
  const date=new URL(request.url).searchParams.get("date")??"";
  if(!validDate(date))return Response.json({error:"日期无效"},{status:400});
  try{const {days,overview}=await decisionData(date,"close",80);return Response.json(marketValidation(days,overview),{headers:{"Cache-Control":"private, no-store"}});}
  catch(e){return Response.json({error:e instanceof MarketError?e.message:"历史样本读取失败，未输出检验结果"},{status:502});}
}
