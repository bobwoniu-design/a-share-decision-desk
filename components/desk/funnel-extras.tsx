"use client";
import {useState} from "react";
import {useDecision} from "./decision";
import {minuteEngine,sectorMinuteEngine} from "@/lib/minute-engine";
import type {MinuteBundle} from "@/lib/decision-data";
import type {FunnelCandidate} from "@/lib/funnel";
import type {FunnelValidation} from "@/lib/funnel-validation";
import type {CandidateEvents} from "@/lib/candidate-events";

const fmt=(n:number|null)=>n===null?"缺数据":`${n>=0?"+":""}${n.toFixed(2)}%`;
export function FunnelMinuteMonitor({candidates,date,mode}:{candidates:FunnelCandidate[];date:string;mode:"close"|"live"}){
  const top=candidates.slice(0,3),[code,setCode]=useState<string|null>(null),selected=top.find(c=>c.code===code);
  const url=selected?`/api/market/decision?view=minutes&date=${date}&mode=${mode}&code=${selected.code}${selected.theme?`&theme=${selected.theme.code}`:""}`:null;
  const {data,error,busy,retry}=useDecision<MinuteBundle>(url,mode==="live");
  const times=data?.bars.map(b=>b.time)??[];
  const industry=data?sectorMinuteEngine(data.peers,times):null,theme=data?sectorMinuteEngine(data.themePeers,times):null;
  const current=data?minuteEngine(data.bars,{preClose:data.preClose??undefined,floatShares:data.floatShares??undefined,upLimit:data.upLimit??undefined,mainlineCore:data.mainlineCore,themeAllowed:data.themeAllowed,marketAllowed:data.marketAllowed,sector:industry?.frames,theme:theme?.frames}).current:null;
  return <div className="funnel-monitor"><div className="funnel-monitor-head"><b>{mode==="live"?"重点候选盘中状态":"重点候选收盘分时回放"}</b><small>只按需读取一只，避免拖慢整个列表</small></div><div className="funnel-monitor-controls">{top.map(c=><button key={c.code} type="button" className={code===c.code?"active":""} onClick={()=>setCode(c.code)}>{c.name}</button>)}</div>{selected&&<div className="funnel-monitor-result">{busy?<span>正在核对个股、行业与题材分钟样本…</span>:error?<span>{error} <button className="text-link" onClick={retry}>重试</button></span>:current?<><b>{current.time} · 个股 {current.phase}</b><span>行业 {industry?.current?.phase??"待数据"} · 题材 {selected.theme?theme?.current?.phase??"待数据":"未匹配"}</span><span>VWAP {current.vwap?.toFixed(2)??"—"} · {current.signal}</span>{data?.stale&&<small>分钟数据已延迟，暂停当前条件提示</small>}</>:<span>分钟数据不足，状态未核验。</span>}</div>}</div>;
}

export function FunnelValidationPanel({date}:{date:string}){
  const [count,setCount]=useState<0|2|5>(0),{data,error,busy,retry}=useDecision<FunnelValidation>(count?`/api/market/funnel-validation?date=${date}&count=${count}`:null);
  return <section className="funnel-validation"><div className="funnel-monitor-head"><b>候选池历史结果</b><span><button type="button" className="text-link" onClick={()=>setCount(2)}>检验2期</button> · <button type="button" className="text-link" onClick={()=>setCount(5)}>扩展5期</button> · <button type="button" className="text-link" onClick={()=>setCount(0)}>收起</button></span></div>{count>0&&(busy?<p>正在逐期重建收盘候选并读取后续行情，首次运行可能较慢…</p>:error?<p role="alert">{error} <button className="text-link" onClick={retry}>重试</button></p>:data?<><p>{data.cohortDates.length} 期收盘候选共 {data.summary.count} 条，后续 5 个交易日有完整行情 {data.observed} 条；正收益 {data.summary.positive5} 条，平均 {fmt(data.summary.average5)}，期间最差收盘回撤 {fmt(data.summary.worstClose)}。</p><small>检验日期：{data.cohortDates.join("、")}。这是候选后的表现，不是可执行交易收益或胜率。</small><div className="funnel-validation-table"><table className="history-table"><thead><tr><th>入池日</th><th>股票</th><th>原判断</th><th>风险</th><th>后1日</th><th>后3日</th><th>后5日</th><th>5日内最差收盘</th></tr></thead><tbody>{data.rows.map(r=><tr key={`${r.cohortDate}:${r.code}`}><td>{r.cohortDate}</td><td>{r.name}</td><td>{r.status}</td><td>{r.risk}</td><td>{fmt(r.next1)}</td><td>{fmt(r.next3)}</td><td>{fmt(r.next5)}</td><td>{fmt(r.worstClose)}</td></tr>)}</tbody></table></div>{data.warnings.map(w=><small key={w}>{w}</small>)}</>:null)}</section>;
}

export function CandidateEventHints({code,date}:{code:string;date:string}){
  const {data,error,busy,retry}=useDecision<CandidateEvents>(`/api/market/candidate-events?code=${code}&date=${date}`);
  return <div className="funnel-events"><b>公告与事件提示</b>{busy?<p>正在核对近7日公司公告…</p>:error?<p>事件未核验：{error} <button className="text-link" onClick={retry}>重试</button></p>:data?<><p className={data.status==="未核验"?"amber-text":""}>{data.message}</p>{data.events.slice(0,8).map((e,i)=><p key={`${e.date}:${e.title}:${i}`}><span>{e.date} {e.time??"时间未知"} · {e.category} · {e.beforeClose===null?"当日收盘前后未核验":e.beforeClose?"截至收盘已发布":"收盘后发布"}</span> {e.url?<a href={e.url} target="_blank" rel="noreferrer">{e.title}</a>:e.title}</p>)}</>:null}<small>仅供人工核对；公告之外的新闻、政策和产业催化未覆盖。</small></div>;
}
