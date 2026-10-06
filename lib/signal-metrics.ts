import type {Bar} from "./market-data";
import {tradingMinute,type MinuteFrame} from "./minute-engine.ts";

export const ROUND_TRIP_COST_BPS=20;
export const SIGNAL_NAMES=["第一笔条件出现：承接","第二笔条件出现：确认","第三笔条件出现：转强"] as const;
export type SignalName=typeof SIGNAL_NAMES[number];
export type SignalEvent={date:string;signal:SignalName;time:string;entryTime:string;entry:number;exit:number;grossPct:number;netPct:number};

// One first occurrence per stage and day; no same-bar entry or future prices in the signal engine.
export function evaluateSignalDay(date:string,bars:Bar[],frames:MinuteFrame[],upLimit:number|null,costBps=ROUND_TRIP_COST_BPS){
  const events:SignalEvent[]=[],excluded:string[]=[],used=new Set<SignalName>();
  if(bars.length!==frames.length)throw new Error("分钟价格与信号数量不一致");
  if(bars.at(-1)?.time!=="15:00")return {events,excluded:["收盘分钟缺失，不能计算当日收盘后的观察结果"]};
  for(let i=0;i<frames.length;i++){
    const signal=SIGNAL_NAMES.find(s=>s===frames[i].signal);if(!signal||used.has(signal))continue;used.add(signal);
    const next=bars[i+1],final=bars.at(-1)!;
    if(!next||tradingMinute(next.time)===null||tradingMinute(next.time)!-tradingMinute(bars[i].time)! !==1){excluded.push(`${frames[i].time} ${signal}：下一交易分钟不可用`);continue;}
    if(next.vol<=0||next.open<=0||final.close<=0){excluded.push(`${frames[i].time} ${signal}：后续分钟无可核对成交价格`);continue;}
    if(upLimit!==null&&next.low>=upLimit-.005&&next.high<=upLimit+.005){excluded.push(`${frames[i].time} ${signal}：下一分钟一字涨停，无法假定买入`);continue;}
    const grossPct=(final.close/next.open-1)*100,netPct=grossPct-costBps/100;
    events.push({date,signal,time:frames[i].time,entryTime:next.time,entry:next.open,exit:final.close,grossPct,netPct});
  }
  return {events,excluded};
}
