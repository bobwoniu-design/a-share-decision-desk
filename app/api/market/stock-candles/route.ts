import type {Candle} from "@/lib/candle-data";
import {derivedCache} from "@/lib/derived-cache";
import {validDate} from "@/lib/market-data";
import {chinaNow} from "@/lib/minute-engine";
import {stockCandles} from "@/lib/stock-candles";
import {MarketError,marketDates} from "@/lib/tushare";

export const dynamic="force-dynamic";
type Result={date:string;mode:"close"|"live";asOf:string;dates:string[];byCode:Record<string,Candle[]>};
const codePattern=/^\d{6}\.(SH|SZ|BJ)$/;

export async function GET(request:Request){
  const q=new URL(request.url).searchParams,date=q.get("date")??"",mode=q.get("mode")==="live"?"live":q.get("mode")==="close"?"close":null,codes=(q.get("codes")??"").split(",").filter(Boolean);
  if(!validDate(date)||date>chinaNow().date||!mode||codes.length<1||codes.length>40||new Set(codes).size!==codes.length||codes.some(code=>!codePattern.test(code)))return Response.json({error:"候选股K线参数无效"},{status:400});
  try{
    const sorted=codes.slice().sort();
    const result=await derivedCache(`stock-candles:v3:20:${date}:${mode}:${sorted.join(",")}`,date===chinaNow().date?60000:7*86400000,async():Promise<Result>=>{
      const calendar=await marketDates(date,mode==="live"?21:20),dates=mode==="live"&&calendar.dates.at(-1)===date?calendar.dates.slice(0,-1):calendar.dates.slice(-20);
      if(dates.length!==20||mode==="close"&&dates.at(-1)!==date)throw new MarketError("近20个完整交易日不足，未绘制K线");
      const candles=await stockCandles(dates,sorted);
      return {date,mode,asOf:dates.at(-1)!,dates,byCode:Object.fromEntries(sorted.map(code=>[code,candles.get(code)??[]]))};
    },false,(value:Result)=>Object.keys(value.byCode).length===sorted.length&&value.dates.length===20);
    return Response.json(result,{headers:{"Cache-Control":"private, no-store"}});
  }catch(e){return Response.json({error:e instanceof Error?e.message:"候选股K线暂不可用"},{status:502});}
}
