import {decisionMinutes,type MinuteBundle} from "./decision-data";
import {ENGINE_VERSION,minuteEngine,sectorMinuteEngine} from "./minute-engine";
import {marketDates,MarketError} from "./tushare";
import {evaluateSignalDay,ROUND_TRIP_COST_BPS,type SignalEvent} from "./signal-metrics";

export const VALIDATION_VERSION="SIGNAL-0.1";
export type ValidationDay={date:string;bars:number;basisDate:string|null;marketAllowed:boolean|null;industryAllowed:boolean|null;themeAllowed:boolean|null;industryPeers:number;themePeers:number;events:SignalEvent[];excluded:string[];warnings:string[];error:string|null};
export type ValidationReport={code:string;themeCode:string;endDate:string;requestedDays:number;version:string;engineVersion:string;costBps:number;days:ValidationDay[];summary:{validDays:number;signalDays:number;events:number;positive:number;meanNetPct:number|null;minNetPct:number|null;maxNetPct:number|null};fetchedAt:string};

function evaluateBundle(bundle:MinuteBundle):ValidationDay{
  const {date,bars}=bundle;
  if(!bars.length)return {date,bars:0,basisDate:bundle.basisDate,marketAllowed:bundle.marketAllowed,industryAllowed:bundle.mainlineCore,themeAllowed:bundle.themeAllowed,industryPeers:bundle.peers.length,themePeers:bundle.themePeers.length,events:[],excluded:[],warnings:bundle.warnings,error:"个股分钟数据缺失"};
  const times=bars.map(b=>b.time),sector=sectorMinuteEngine(bundle.peers,times),theme=sectorMinuteEngine(bundle.themePeers,times);
  const frames=minuteEngine(bars,{preClose:bundle.preClose??undefined,floatShares:bundle.floatShares??undefined,upLimit:bundle.upLimit??undefined,marketAllowed:bundle.marketAllowed,mainlineCore:bundle.mainlineCore,themeAllowed:bundle.themeAllowed,sector:sector.frames,theme:theme.frames}).frames;
  const result=evaluateSignalDay(date,bars,frames,bundle.upLimit);
  return {date,bars:bars.length,basisDate:bundle.basisDate,marketAllowed:bundle.marketAllowed,industryAllowed:bundle.mainlineCore,themeAllowed:bundle.themeAllowed,industryPeers:bundle.peers.length,themePeers:bundle.themePeers.length,events:result.events,excluded:result.excluded,warnings:bundle.warnings,error:null};
}

const jobs=new Map<string,Promise<ValidationReport>>();
const memory=new Map<string,{until:number;value:ValidationReport}>();
export async function validateSignals(code:string,themeCode:string,date:string,requestedDays:number):Promise<ValidationReport>{
  const key=`${code}:${themeCode}:${date}:${requestedDays}`,cached=memory.get(key);
  if(cached&&cached.until>Date.now())return cached.value;
  if(jobs.has(key))return jobs.get(key)!;
  const work=(async()=>{
    const calendar=await marketDates(date,requestedDays);
    if(calendar.dates.at(-1)!==date||calendar.dates.length!==requestedDays)throw new MarketError("历史检验需要完整交易日历，不能跨过缺失日期");
    const days:ValidationDay[]=[];
    for(const day of calendar.dates){
      try{days.push(evaluateBundle(await decisionMinutes(code,day,"close",themeCode)));}
      catch(e){days.push({date:day,bars:0,basisDate:null,marketAllowed:null,industryAllowed:null,themeAllowed:null,industryPeers:0,themePeers:0,events:[],excluded:[],warnings:[],error:e instanceof Error?e.message:"历史数据不可用"});}
    }
    const events=days.flatMap(day=>day.events),nets=events.map(e=>e.netPct);
    const value:ValidationReport={code,themeCode,endDate:date,requestedDays,version:VALIDATION_VERSION,engineVersion:ENGINE_VERSION,costBps:ROUND_TRIP_COST_BPS,days,summary:{validDays:days.filter(d=>!d.error).length,signalDays:days.filter(d=>d.events.length>0).length,events:events.length,positive:nets.filter(n=>n>0).length,meanNetPct:nets.length?nets.reduce((a,b)=>a+b,0)/nets.length:null,minNetPct:nets.length?Math.min(...nets):null,maxNetPct:nets.length?Math.max(...nets):null},fetchedAt:new Date().toISOString()};
    memory.set(key,{until:Date.now()+300000,value});return value;
  })();
  jobs.set(key,work);try{return await work;}finally{jobs.delete(key);}
}
