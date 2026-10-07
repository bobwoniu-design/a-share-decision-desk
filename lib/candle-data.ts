import type {Row} from "./market-data";

export type Candle={date:string;open:number;high:number;low:number;close:number;amountYi:number|null};
const num=(value:unknown)=>value===null||value===undefined||value===""?null:Number.isFinite(Number(value))?Number(value):null;
const day=(value:unknown)=>{const d=String(value??"");return /^\d{8}$/.test(d)?`${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6)}`:null;};

export function candleFromRow(row:Row,amountUnit:"yuan"|"thousand"):Candle|null{
  const date=day(row.trade_date),open=num(row.open),high=num(row.high),low=num(row.low),close=num(row.close),amount=num(row.amount);
  if(!date||open===null||high===null||low===null||close===null||open<=0||low<=0||low>Math.min(open,close)||high<Math.max(open,close)||amount!==null&&amount<0)return null;
  return {date,open,high,low,close,amountYi:amount===null?null:amount*(amountUnit==="thousand"?1000:1)/1e8};
}

export function seriesForCode(rows:Row[],code:string,dates:string[],amountUnit:"yuan"|"thousand"){
  const wanted=new Set(dates),seen=new Set<string>(),points:Candle[]=[];
  for(const row of rows){
    if(row.ts_code!==code)throw new Error("K线代码校验失败");
    const candle=candleFromRow(row,amountUnit);
    if(!candle||!wanted.has(candle.date)||seen.has(candle.date))throw new Error("K线日期或价格校验失败");
    seen.add(candle.date);points.push(candle);
  }
  return points.sort((a,b)=>a.date.localeCompare(b.date));
}

// A fixed-membership, equal-weight descriptive basket, anchored at 100.
// Each day's OHLC uses constituent returns to that day's pre_close, so a
// change in a stock's nominal price level does not dominate the basket.
export function equalWeightBasket(dates:string[],members:Set<string>,dailyByDate:Row[][]):{points:Candle[];coverage:number[]}{
  if(dates.length!==dailyByDate.length||!members.size)throw new Error("行业历史样本不完整");
  let prior=100;const points:Candle[]=[],coverage:number[]=[];
  for(let i=0;i<dates.length;i++){
    const factors:{open:number;high:number;low:number;close:number;amount:number}[]=[];
    for(const row of dailyByDate[i]){
      if(!members.has(String(row.ts_code)))continue;
      const candle=candleFromRow(row,"thousand"),pre=num(row.pre_close);
      if(!candle||candle.date!==dates[i]||pre===null||pre<=0)continue;
      factors.push({open:candle.open/pre,high:candle.high/pre,low:candle.low/pre,close:candle.close/pre,amount:candle.amountYi??0});
    }
    coverage.push(factors.length);
    if(factors.length<Math.max(1,Math.ceil(members.size*.65))){prior=NaN;continue;}
    if(!Number.isFinite(prior))continue; // Never bridge a missing trading day.
    const avg=(key:"open"|"high"|"low"|"close")=>factors.reduce((sum,item)=>sum+item[key],0)/factors.length;
    const open=prior*avg("open"),close=prior*avg("close");
    points.push({date:dates[i],open,high:Math.max(open,close,prior*avg("high")),low:Math.min(open,close,prior*avg("low")),close,amountYi:factors.reduce((sum,item)=>sum+item.amount,0)});
    prior=close;
  }
  return {points,coverage};
}
