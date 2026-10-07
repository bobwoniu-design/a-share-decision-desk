import {decisionFunnel} from "./funnel";
import {marketDates,tushare} from "./tushare";

export type FunnelValidationRow={cohortDate:string;code:string;name:string;status:string;risk:string;next1:number|null;next3:number|null;next5:number|null;worstClose:number|null};
export type FunnelValidation={date:string;cohortDates:string[];rows:FunnelValidationRow[];observed:number;missing:number;summary:{count:number;positive5:number;average5:number|null;worstClose:number|null};warnings:string[]};
const pct=(v:number)=>Math.round(v*100)/100;
export async function validateFunnel(date:string,count:2|5=2):Promise<FunnelValidation>{
  const calendar=await marketDates(date,count===5?35:25),dates=calendar.dates;
  if(dates.at(-1)!==date||dates.length<(count===5?26:16))throw new Error("历史样本交易日不足");
  const cohortDates=(count===5?[-26,-21,-16,-11,-6]:[-11,-6]).map(offset=>dates.at(offset)!);
  const warnings=[`仅检验${count}期收盘候选及其后续收盘表现；样本有限，不代表策略胜率。未模拟盘中成交、手续费、滑点和资金容量。`];
  const rows:FunnelValidationRow[]=[];
  for(const cohortDate of cohortDates){
    const index=dates.indexOf(cohortDate),futureDates=dates.slice(index+1,index+6),funnel=await decisionFunnel(cohortDate,"close");
    const packets=await Promise.all(futureDates.map(d=>tushare("daily",{trade_date:d.replaceAll("-","")},"ts_code,trade_date,pct_chg",6000)));
    const byDay=packets.map((p,j)=>new Map(p.rows.filter(r=>r.trade_date===futureDates[j].replaceAll("-","")).map(r=>[String(r.ts_code),r.pct_chg==null?null:Number(r.pct_chg)])));
    for(const c of funnel.candidates){
      let factor=1,worst=0;const returns:(number|null)[]=[];
      for(const day of byDay){const dayPct=day.get(c.code);if(dayPct===null||dayPct===undefined||!Number.isFinite(dayPct)){returns.push(null);continue;}factor*=1+dayPct/100;const value=pct((factor-1)*100);returns.push(value);worst=Math.min(worst,value);}
      // A missing price in any intermediate session invalidates later chained returns.
      const complete=(n:number)=>returns.slice(0,n).every(v=>v!==null)?returns[n-1]:null;
      rows.push({cohortDate,code:c.code,name:c.name,status:c.status,risk:c.risk.level,next1:complete(1),next3:complete(3),next5:complete(5),worstClose:returns.every(v=>v!==null)?worst:null});
    }
    if(funnel.verifiedThemes<funnel.screenedThemes)warnings.push(`${cohortDate} 题材成分只核验 ${funnel.verifiedThemes}/${funnel.screenedThemes}，结果有覆盖缺口。`);
  }
  const valid=rows.filter(r=>r.next5!==null),values=valid.map(r=>r.next5!);
  return {date,cohortDates,rows,observed:valid.length,missing:rows.length-valid.length,summary:{count:rows.length,positive5:values.filter(v=>v>0).length,average5:values.length?pct(values.reduce((a,b)=>a+b,0)/values.length):null,worstClose:valid.length?Math.min(...valid.map(r=>r.worstClose!)):null},warnings};
}
