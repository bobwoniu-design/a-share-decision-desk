import {derivedCache} from "@/lib/derived-cache";
import {buildLimitUpDay} from "@/lib/limit-up";
import {validDate} from "@/lib/market-data";
import {chinaNow} from "@/lib/minute-engine";
import {tushare} from "@/lib/tushare";

export const dynamic="force-dynamic";

export async function GET(request:Request){
  const date=new URL(request.url).searchParams.get("date")??"";
  if(!validDate(date)||date>chinaNow().date)return Response.json({error:"交易日期无效"},{status:400});
  try{
    const result=await derivedCache(`limit-up:v1:${date}`,date===chinaNow().date?60000:7*86400000,async()=>{
      const packet=await tushare("limit_list_d",{trade_date:date.replaceAll("-","")},"ts_code,trade_date,name,limit,limit_times",2500);
      return buildLimitUpDay(date,packet.rows,packet.fetchedAt);
    });
    return Response.json(result,{headers:{"Cache-Control":"private, no-store"}});
  }catch(error){
    return Response.json({error:error instanceof Error?error.message:"涨停榜名单读取失败"},{status:502});
  }
}
