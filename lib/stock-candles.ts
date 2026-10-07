import {candleFromRow,type Candle} from "./candle-data";
import type {Row} from "./market-data";
import {MarketError,tushare} from "./tushare";

export async function stockCandles(dates:string[],codes:string[]):Promise<Map<string,Candle[]>>{
  const daily:Row[][]=[];
  for(let i=0;i<dates.length;i+=4){
    const packets=await Promise.all(dates.slice(i,i+4).map(d=>tushare("daily",{trade_date:d.replaceAll("-","")},"ts_code,trade_date,open,high,low,close,amount")));
    daily.push(...packets.map(p=>p.rows));
  }
  const wanted=new Set(codes),candles=new Map(codes.map(code=>[code,[] as Candle[]]));
  daily.forEach((rows,i)=>{const seen=new Set<string>();for(const row of rows){const code=String(row.ts_code);if(!wanted.has(code))continue;const point=candleFromRow(row,"thousand");if(!point||point.date!==dates[i]||seen.has(code))throw new MarketError("个股小K线日期或价格校验失败");seen.add(code);candles.get(code)!.push(point);}});
  return candles;
}
