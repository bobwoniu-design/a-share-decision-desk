"use client";
import {useDecision} from "./decision";
type Result={requested:number;warmup:number;available:number;eligible:number;excluded:number;note:string;buckets:{name:string;count:number;averageNextDay:number|null;positiveNextDay:number|null;averageNextBreadth:number|null}[]};
const fmt=(v:number|null,suffix="")=>v===null?"样本不足":`${v>=0?"+":""}${v.toFixed(2)}${suffix}`;
export function MarketValidation({date}:{date:string}){
  const {data,error,busy,retry}=useDecision<Result>(`/api/market/market-validation?date=${date}`);
  return <div className="research-body market-validation"><h3>市场环境历史检验 · 60 个交易日</h3>{busy?<p role="status">首次构建需读取 80 个交易日；完成后将复用历史检验缓存。前 20 日用于规则预热，后 60 日检查下一日表现…</p>:error?<p className="error-banner" role="alert">{error} <button className="text-link" onClick={retry}>重试</button></p>:data?<><p>有数据 {data.available} 日 · 可比样本 {data.eligible}/{data.requested} · 排除 {data.excluded} 日。每个日期只用当日收盘已知的分数，对照下一交易日全市场表现。</p><div className="validation-buckets">{data.buckets.map(b=><div key={b.name}><b>{b.name}</b><small>{b.count} 日</small><span>次日等权涨幅 {fmt(b.averageNextDay,"%")}</span><span>次日正收益日占比 {fmt(b.positiveNextDay,"%")}</span><span>次日上涨股票占比 {fmt(b.averageNextBreadth,"%")}</span></div>)}</div><p>{data.note}</p></>:null}</div>;
}
