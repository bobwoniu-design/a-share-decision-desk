import {marketIndexHistory,MarketError} from "@/lib/tushare";
import {validDate} from "@/lib/market-data";
import {derivedCache} from "@/lib/derived-cache";
export const dynamic="force-dynamic";

export async function GET(request:Request){
  const date=new URL(request.url).searchParams.get("date")??"";
  if(!validDate(date))return Response.json({error:"日期无效"},{status:400});
  try{
    const data=await derivedCache(`index-history:v1:${date}`,7*86400000,()=>marketIndexHistory(date),false,value=>value.missingDates.length===0);
    return Response.json(data,{headers:{"Cache-Control":"private, no-store"}});
  }catch(e){return Response.json({error:e instanceof MarketError?e.message:"指数日线读取失败"},{status:502});}
}
