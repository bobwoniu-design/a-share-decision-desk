import {derivedCache} from "@/lib/derived-cache";
import {buildDragonTigerDay} from "@/lib/dragon-tiger";
import {validDate} from "@/lib/market-data";
import {chinaNow} from "@/lib/minute-engine";
import {tushare} from "@/lib/tushare";

export const dynamic="force-dynamic";

export async function GET(request:Request){
  const date=new URL(request.url).searchParams.get("date")??"";
  if(!validDate(date)||date>chinaNow().date)return Response.json({error:"交易日期无效"},{status:400});
  try{
    const result=await derivedCache(`dragon-tiger:v1:${date}`,date===chinaNow().date?60000:7*86400000,async()=>{
      const packet=await tushare("top_list",{trade_date:date.replaceAll("-","")},"trade_date,ts_code,name,reason",10000);
      return buildDragonTigerDay(date,packet.rows,packet.fetchedAt);
    });
    return Response.json(result,{headers:{"Cache-Control":"private, no-store"}});
  }catch(error){
    return Response.json({error:error instanceof Error?error.message:"龙虎榜名单读取失败"},{status:502});
  }
}
