import {env} from "cloudflare:workers";
import type {DecisionOverview} from "./decision-engine";
import type {Phase} from "./minute-engine";

type Observation={time:string;score:number|null;phase:Phase;reason:string};
export function observedPhase(score:number|null,previous:Observation|null):{phase:Phase;reason:string}{
  if(score===null)return {phase:"待数据",reason:"当前评分缺少有效输入"};
  if(!previous||previous.score===null)return {phase:"观察",reason:"首个真实盘中观察点，等待下一次快照"};
  const delta=score-previous.score;
  if(score<35||delta<=-15)return {phase:"转弱",reason:`较上次观察 ${delta>=0?"+":""}${delta} 分`};
  if(delta<=-7)return {phase:"分歧",reason:`较上次观察 ${delta} 分`};
  if((previous.phase==="分歧"||previous.phase==="转弱")&&delta>=3)return {phase:"承接",reason:`较上次观察 +${delta} 分，分歧后修复`};
  if(previous.phase==="承接"&&score>=65&&delta>=3)return {phase:"转强",reason:`较上次观察 +${delta} 分，承接后继续增强`};
  if(["转强","一致","加速"].includes(previous.phase)&&score>=80&&delta>=4)return {phase:"加速",reason:`较上次观察 +${delta} 分，高位继续增强`};
  return {phase:score>=65?"一致":"观察",reason:`较上次观察 ${delta>=0?"+":""}${delta} 分；未满足转换阈值`};
}
export async function recordIntraday(overview:DecisionOverview){
  if(overview.mode!=="live")return overview;
  const db=env.DB,date=overview.date,time=overview.asOf.slice(11,16);
  if(!db||!/^\d\d:\d\d$/.test(time))return {...overview,intraday:{phase:"待数据" as Phase,status:"盘中时间线存储不可用",observations:0,timeline:[]}};
  try{
    const prior=await db.prepare("SELECT time,score,phase,reason FROM market_observations WHERE date=? AND time<? ORDER BY time DESC LIMIT 1").bind(date,time).first<Observation>();
    const next=observedPhase(overview.market.score,prior??null);
    await db.prepare("INSERT OR IGNORE INTO market_observations(date,time,score,phase,reason,captured_at) VALUES(?,?,?,?,?,?)").bind(date,time,overview.market.score,next.phase,next.reason,new Date().toISOString()).run();
    const rows=await db.prepare("SELECT time,score,phase,reason FROM market_observations WHERE date=? ORDER BY time DESC LIMIT 120").bind(date).all<Observation>();
    const observations=rows.results.filter(r=>r.time<=time).reverse();
    return {...overview,intraday:{phase:observations.at(-1)?.phase??"待数据" as Phase,status:observations.length<2?"仅有一个真实观察点，暂不能判断盘中转换":"基于实际采集的盘中快照；未采集的时段保持空白",observations:observations.length,timeline:observations.filter((r,i)=>i===0||r.phase!==observations[i-1].phase).map(r=>({time:r.time,phase:r.phase,score:r.score,reason:r.reason}))}};
  }catch{return {...overview,intraday:{phase:"待数据" as Phase,status:"盘中时间线暂不可用，未将收盘数据回填为盘中状态",observations:0,timeline:[]}};}
}
