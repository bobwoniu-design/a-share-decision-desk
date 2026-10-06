"use client";
import {useState} from "react";
import {useDecision} from "./decision";
type Result={requested:number;warmup:number;available:number;eligible:number;excluded:number;note:string;buckets:{name:string;count:number;averageNextDay:number|null;positiveNextDay:number|null;averageNextBreadth:number|null}[]};
const fmt=(v:number|null,suffix="")=>v===null?"样本不足":`${v>=0?"+":""}${v.toFixed(2)}${suffix}`;
export function MarketValidation({date}:{date:string}){
  const [open,setOpen]=useState(false),{data,error,busy,retry}=useDecision<Result>(open?`/api/market/market-validation?date=${date}`:null);
  return <details className="engine-method market-validation" onToggle={e=>setOpen(e.currentTarget.open)}><summary>市场环境历史检验 · 60 个交易日</summary>{open&&<>{busy?<p>正在读取 80 日数据，前 20 日用于规则预热，后 60 日检查下一日市场表现…</p>:error?<p className="error-banner">{error} <button className="text-link" onClick={retry}>重试</button></p>:data?<><p>有数据 {data.available} 日 · 可比样本 {data.eligible}/{data.requested} · 排除 {data.excluded} 日。每个日期只用当日收盘已知的分数，对照下一交易日全市场表现。</p><div className="validation-buckets">{data.buckets.map(b=><div key={b.name}><b>{b.name}</b><small>{b.count} 日</small><span>次日等权涨幅 {fmt(b.averageNextDay,"%")}</span><span>次日正收益日占比 {fmt(b.positiveNextDay,"%")}</span><span>次日上涨股票占比 {fmt(b.averageNextBreadth,"%")}</span></div>)}</div><p>{data.note}</p></>:null}</>}</details>;
}
