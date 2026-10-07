import {validDate} from "@/lib/market-data";
import {chinaNow} from "@/lib/minute-engine";
import {normalizeHotMoneyRoster,normalizeHotMoneyTrades} from "@/lib/hot-money";
import {marketDates,tushare} from "@/lib/tushare";

export const dynamic="force-dynamic";
const headers={"Cache-Control":"private, no-store"};

export async function GET(request:Request){
  const q=new URL(request.url).searchParams;
  const kind=q.get("kind"),date=q.get("date")??"",mode=q.get("mode")??"close";
  if(!["roster","trades"].includes(kind??"")||!validDate(date)||date>chinaNow().date||!["close","live"].includes(mode)||mode==="live"&&date!==chinaNow().date)return Response.json({error:"游资查询参数无效"},{status:400,headers});
  try{
    if(kind==="roster"){
      const packet=await tushare("hm_list",{},"name,desc,orgs",1000,7*86400000);
      return Response.json({items:normalizeHotMoneyRoster(packet.rows),fetchedAt:packet.fetchedAt,source:"Tushare hm_list"},{headers});
    }
    const calendar=mode==="live"?(await marketDates(date,2)).dates:null;
    const tradeDate=calendar?(calendar.at(-1)===date?calendar.at(-2):calendar.at(-1)):date;
    if(!tradeDate)throw new Error("没有可核对的前一交易日");
    const packet=await tushare("hm_detail",{trade_date:tradeDate.replaceAll("-","")},"trade_date,ts_code,ts_name,buy_amount,sell_amount,net_amount,hm_name,hm_orgs,tag",2000,tradeDate===chinaNow().date?5*60000:86400000);
    return Response.json({date:tradeDate,requestedDate:date,items:normalizeHotMoneyTrades(packet.rows,tradeDate),fetchedAt:packet.fetchedAt,source:"Tushare hm_detail"},{headers});
  }catch(error){return Response.json({error:error instanceof Error?error.message:"游资数据读取失败"},{status:502,headers});}
}
