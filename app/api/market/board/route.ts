import {buildBoardList} from "@/lib/board-list";
import {derivedCache} from "@/lib/derived-cache";
import {dailyRows,validDate} from "@/lib/market-data";
import {chinaNow} from "@/lib/minute-engine";
import {MarketError,marketDates,tushare} from "@/lib/tushare";

export const dynamic="force-dynamic";
const fields="ts_code,trade_date,name,industry,limit,limit_times,close,pct_chg,amount,fd_amount,first_time,last_time,open_times";
export async function GET(request:Request){
  const q=new URL(request.url).searchParams,date=q.get("date")??"",refresh=q.get("refresh")==="1";
  if(!validDate(date)||date>chinaNow().date)return Response.json({error:"交易日期无效"},{status:400});
  try{
    const result=await derivedCache(`board-list:v2:${date}`,date===chinaNow().date?60000:7*86400000,async()=>{
      const {dates}=await marketDates(date,7);
      if(dates.length!==7||dates.at(-1)!==date)throw new MarketError("所选日期不是交易日，或近7个交易日不完整");
      const [packets,daily]=await Promise.all([Promise.all(dates.map(d=>tushare("limit_list_d",{trade_date:d.replaceAll("-", "")},fields,2500))),tushare("daily",{trade_date:date.replaceAll("-", "")},"ts_code,trade_date,close,pre_close,pct_chg,amount")]);
      const amounts=new Map(dailyRows(daily.rows,date).map(row=>[row.code,row.amount]));
      return {...buildBoardList(date,dates,packets.map(p=>p.rows),amounts),fetchedAt:new Date().toISOString(),source:"Tushare limit_list_d + daily" as const};
    },refresh,v=>v.items.length>0);
    return Response.json(result,{headers:{"Cache-Control":"private, no-store"}});
  }catch(e){return Response.json({error:e instanceof Error?e.message:"涨停榜单读取失败"},{status:502});}
}
