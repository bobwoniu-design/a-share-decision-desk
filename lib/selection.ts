import type { FunnelCandidate } from "./funnel";

export type SelectionSource = {kind:"盘前候选"|"盘中新增"; basisDate:string; foundAt:string; backfilled:boolean; candidate:FunnelCandidate};
export type SelectionCheck = {label:string; pass:boolean|null; detail:string};
export type SelectionEvidence = {at:string; expiresAt:string; stage:string; status:"待核验"|"继续观察"|"风险待核实"|"逻辑失效"|"条件满足"; reason:string; checks:SelectionCheck[]; price:number|null; quoteTime:string|null; links:{title:string;url:string|null;time:string;source?:string;reason?:string}[]};
export type SelectionPlan = {low:number;high:number;invalidation:string;qty:number;note:string};
export type SelectionEvent = {at:string;kind:string;detail:string;evidence?:SelectionEvidence;plan?:SelectionPlan|null};
export type SelectionItem = {code:string;name:string;sources:SelectionSource[];firstSeenAt:string;latest:SelectionEvidence|null;intent:"观察"|"计划"|"跳过";plan:SelectionPlan|null;events:SelectionEvent[]};
export type SelectionDay = {date:string;basisDate:string;items:SelectionItem[];preparedAt:string|null;lastScanAt:string|null;warnings:string[]};
export type SelectionResponse = {day:SelectionDay;today:string;previous:string;next:string;isTradingDay:boolean;revision:number;calendarError?:string};
export const emptySelectionDay=(date:string,basisDate=""):SelectionDay=>({date,basisDate,items:[],preparedAt:null,lastScanAt:null,warnings:[]});

export function addCandidates(day:SelectionDay,candidates:FunnelCandidate[],kind:SelectionSource["kind"],basisDate:string,at:string,backfilled=false){
  for(const candidate of candidates){
    let item=day.items.find(i=>i.code===candidate.code);
    if(!item){item={code:candidate.code,name:candidate.name,sources:[],firstSeenAt:at,latest:null,intent:"观察",plan:null,events:[]};day.items.push(item);}
    // Repeated scans never rewrite the first inclusion or its evidence.
    if(item.sources.some(s=>s.kind===kind))continue;
    item.sources.push({kind,basisDate,foundAt:at,backfilled,candidate:structuredClone(candidate)});
    item.events.push({at,kind:"入选",detail:`${kind}${backfilled?"（历史依据补建，非当时保存）":""} · 依据 ${basisDate} · ${candidate.reasons.join("；")}`});
  }
}
export function recordEvidence(item:SelectionItem,evidence:SelectionEvidence){
  if(item.latest&&evidence.at<item.latest.at)return;
  const old=item.latest;
  const checkSignature=(value:SelectionEvidence)=>JSON.stringify(value.checks.map(c=>[c.label,c.pass]));
  if(!old||old.status!==evidence.status||old.stage!==evidence.stage||old.reason!==evidence.reason||checkSignature(old)!==checkSignature(evidence)){
    item.events.push({at:evidence.at,kind:"复核",detail:`${old?`${old.status} → `:""}${evidence.status} · ${evidence.reason}`,evidence:structuredClone(evidence)});
  }
  item.latest=evidence;
}
export function selectionStatus(item:SelectionItem,now=new Date().toISOString()){
  if(!item.latest)return "待核验";
  if(item.latest.expiresAt<=now)return "核验已过期";
  return item.latest.status;
}
export function applyIntent(item:SelectionItem,intent:SelectionItem["intent"],plan:SelectionPlan|null,at:string){
  item.intent=intent;item.plan=intent==="计划"?plan:null;
  item.events.push({at,kind:"人工操作",plan:plan?structuredClone(plan):null,detail:intent==="计划"?`加入交易计划：${plan!.low}–${plan!.high} 元，${plan!.qty} 股；失效条件：${plan!.invalidation}。核验结果：${selectionStatus(item,at)}，不代表成交。`:intent==="跳过"?"今日跳过；继续保留风险及历史记录":"恢复观察"});
}
export function selectionStage(time:string){return time<"09:26"?"盘前消息":time<"09:30"?"竞价复核":time<"09:40"?"开盘复核":time<="15:00"?"盘中复核":"收盘检查";}
export function discoverySession(time:string){return time>="09:30"&&time<="11:30"||time>="13:00"&&time<="15:00";}
export function summarizeChecks(checks:SelectionCheck[],invalidated:boolean,minuteReady:boolean):Pick<SelectionEvidence,"status"|"reason">{
  if(invalidated)return {status:"逻辑失效",reason:"分钟结构转弱或原承接结构失效"};
  const risk=checks.find(c=>c.label==="消息风险"&&c.pass===false);
  if(risk)return {status:"风险待核实",reason:risk.detail};
  const failed=checks.filter(c=>c.pass===false),missing=checks.filter(c=>c.pass===null);
  if(failed.length)return {status:"继续观察",reason:`尚未通过：${failed.map(c=>c.label).join("、")}`};
  if(missing.length)return {status:"待核验",reason:`待核验：${missing.map(c=>c.label).join("、")}`};
  return minuteReady?{status:"条件满足",reason:"当前预设条件通过；需核对价格范围并人工决定"}:{status:"继续观察",reason:"等待分钟交易条件"};
}
