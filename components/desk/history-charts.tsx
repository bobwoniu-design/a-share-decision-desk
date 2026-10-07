"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Panel } from "./workspace";
import { DailyChart } from "./daily-chart";
import type { DailyHistory, MarketTimeline } from "@/lib/market-data";
const pct=(n:number|null|undefined)=>n==null?"—":`${n>=0?"+":""}${n.toFixed(2)}%`;
const historyCache=new Map<string,unknown>();
function useHistory<T>(url:string|null){
  const [data,setData]=useState<T|null>(null),[error,setError]=useState(""),[busy,setBusy]=useState(false),[attempt,setAttempt]=useState(0);
  const lastUrl=useRef<string|null>(null);
  useEffect(()=>{const c=new AbortController(),force=lastUrl.current===url&&attempt>0;lastUrl.current=url;const cached=url&&!force?historyCache.get(url) as T|undefined:undefined;setData(cached??null);setError("");setBusy(!!url&&!cached);if(!url||cached)return()=>c.abort();
    fetch(url,{signal:c.signal,cache:"no-store"}).then(async r=>{const d=await r.json() as T & {error?:string};if(!r.ok)throw new Error(d.error||"历史数据读取失败");return d;}).then(d=>{if(!c.signal.aborted){historyCache.set(url,d);while(historyCache.size>80)historyCache.delete(historyCache.keys().next().value!);setData(d);}}).catch(e=>{if(!c.signal.aborted)setError(e.message);}).finally(()=>{if(!c.signal.aborted)setBusy(false);});return()=>c.abort();
  },[url,attempt]);
  return {data,error,busy,retry:()=>setAttempt(n=>n+1)};
}
// Missing dates break lines rather than joining across unavailable market data.
function paths(values:(number|null)[],x:(i:number)=>number,y:(v:number)=>number){return values.map((v,i)=>v===null?"":`${i&&values[i-1]!==null?"L":"M"}${x(i)},${y(v)}`).join(" ");}
export function MarketHistory({date,onDate}:{date:string;onDate:(date:string)=>void}){
  const [days,setDays]=useState(7),[metric,setMetric]=useState<"limits"|"amount"|"premium">("limits");
  const {data,error,busy,retry}=useHistory<MarketTimeline>(`/api/market/context?view=timeline&date=${date}&days=${days}`);
  const rows=data?.dates.map(d=>data.points.find(p=>p.date===d)??null)??[];
  const series=metric==="limits"?[{name:"涨停家数",color:"#f87171",values:rows.map(p=>p?.limits?.up??null)},{name:"跌停家数",color:"#34d399",values:rows.map(p=>p?.limits?.down??null)}]:metric==="amount"?[{name:"沪深成交额 / 亿元",color:"#77aaff",values:rows.map(p=>p?.coverage.amountYi??null)}]:[{name:"昨日涨停溢价 / %",color:"#fbbf24",values:rows.map(p=>p?.premium?.value??null)}];
  const values=series.flatMap(s=>s.values.filter((v):v is number=>v!==null)),lo=Math.min(0,...values),hi=Math.max(1,...values),x=(i:number)=>54+i/Math.max(1,rows.length-1)*930,y=(n:number)=>20+(hi-n)/(hi-lo)*150;
  const sectorDays=new Map<string,number>();data?.points.forEach(p=>p.sectors.slice(0,3).forEach(s=>sectorDays.set(s.name,(sectorDays.get(s.name)??0)+1)));
  const rankedDays=data?.points.filter(p=>p.limits!==null).length??0;
  return <Panel title="市场情绪 · 历史轨迹" className="market-history" extra={<div className="history-switch">{[7,20].map(n=><button key={n} aria-pressed={days===n} className={days===n?"active":""} onClick={()=>setDays(n)}>近 {n} 个交易日</button>)}</div>}>
    <div className="history-controls"><div className="history-switch">{([["limits","涨停 / 跌停"],["amount","成交额"],["premium","涨停溢价"]] as const).map(([key,label])=><button key={key} className={metric===key?"active":""} aria-pressed={metric===key} onClick={()=>setMetric(key)}>{label}</button>)}</div><span className="muted">{data?`${data.dates[0]} — ${data.dates.at(-1)} · ${data.points.length}/${data.dates.length} 日有效`:"正在按交易日历读取"}</span></div>
    {busy?<p className="history-small-empty" role="status">正在读取近 {days} 个交易日；首次加载需要补齐历史缓存…</p>:error?<p className="history-small-empty" role="alert">{error} <button className="text-link" onClick={retry}>重试</button></p>:data&&<>
      <svg className="history-trend" viewBox="0 0 1040 210" role="img" aria-label={`近${days}个交易日${series.map(s=>s.name).join("、")}走势；下方提供逐日数值`}>
        {[0,1,2,3].map(i=>{const v=lo+(hi-lo)*i/3;return <g key={i}><line x1="54" x2="984" y1={y(v)} y2={y(v)} stroke="#26344b"/><text x="47" y={y(v)+4} textAnchor="end" fill="#91a4bf" fontSize="11">{v.toFixed(metric==="premium"?1:0)}</text></g>;})}
        {series.map(s=><path key={s.name} d={paths(s.values,x,y)} fill="none" stroke={s.color} strokeWidth="2.3"/>)}
        {data.dates.map((d,i)=><g key={d}>{i%Math.max(1,Math.ceil(days/10))===0||i===days-1?<text x={x(i)} y="193" textAnchor="middle" fill="#91a4bf" fontSize="11">{d.slice(5)}</text>:null}{series.map(s=>s.values[i]!==null&&<circle key={s.name} cx={x(i)} cy={y(s.values[i]!)} r="3" fill={s.color}><title>{`${d} ${s.name}：${s.values[i]!.toFixed(2)}`}</title></circle>)}</g>)}
      </svg>
      <div className="history-legend">{series.map(s=><span key={s.name}><i style={{background:s.color}}/>{s.name}</span>)}</div>
      <div className="sector-continuity"><span className="muted">行业涨停数前三出现天数</span>{[...sectorDays].sort((a,b)=>b[1]-a[1]).slice(0,5).map(([name,n])=><span className="tag" key={name}>{name} {n}/{rankedDays} 日</span>)}</div>
      <details className="history-details"><summary>逐日数据与缺口 · 点击日期查看当天工作台</summary><div className="history-table-wrap"><table className="history-table"><thead><tr><th>交易日</th><th>上涨 / 下跌</th><th>涨停 / 跌停</th><th>高度</th><th>炸板率</th><th>昨日涨停溢价</th><th>沪深成交额</th></tr></thead><tbody>{data.dates.slice().reverse().map(d=>{const p=data.points.find(r=>r.date===d);return <tr key={d}><td><button className="text-link" onClick={()=>onDate(d)}>{d}</button></td>{p?<><td>{p.coverage.up} / {p.coverage.down}</td><td>{p.limits?`${p.limits.up} / ${p.limits.down}`:"—"}</td><td>{p.limits?.height??"—"}</td><td>{p.limits?.brokenRate==null?"—":`${p.limits.brokenRate.toFixed(1)}%`}</td><td>{pct(p.premium?.value)} {p.premium&&<small>({p.premium.matched}/{p.premium.total})</small>}</td><td>{p.coverage.amountYi.toFixed(0)} 亿</td></>:<td colSpan={6}>数据缺失</td>}</tr>;})}</tbody></table></div>{data.failures.map(f=><p key={f.date} className="amber-text">{f.date}：{f.error}</p>)}{data.points.filter(p=>p.warnings.length).map(p=><p key={p.date} className="amber-text">{p.date}：{p.warnings.join("；")}</p>)}<p>覆盖沪深北当日有日线股票；涨跌停名单不含ST。前三出现天数只反映行业涨停分布，不等同于已确认主线。曲线缺失不补值；自动规则评分与阶段见首页决策引擎。</p></details>
    </>}
  </Panel>;
}
export type HistoryStock={code:string;name:string;preClose?:number};
export function InstrumentHistory({stock,date,minutes,live=false,fixedMode}:{stock:HistoryStock|undefined;date:string;live?:boolean;fixedMode?:"minute"|"daily";minutes:(stock:HistoryStock|undefined,date:string,showChart:boolean)=>ReactNode}){
  const [selectedMode,setSelectedMode]=useState<"minute"|"daily">("minute"),[selectedDay,setSelectedDay]=useState(date);
  const mode=fixedMode??selectedMode;
  const calendar=useHistory<{dates:string[]}>(mode==="minute"&&!live?`/api/market/context?view=calendar&date=${date}&days=7`:null);
  const {data,error,busy,retry}=useHistory<DailyHistory>(mode==="daily"&&stock?`/api/market/context?view=daily&date=${date}&code=${stock.code}`:null);
  const dates=calendar.data?.dates??[date],minuteDate=live?date:dates.includes(selectedDay)?selectedDay:dates.at(-1)!;
  return <div className="column instrument-history">{(!fixedMode||mode==="minute"&&!live)&&<div className="history-controls instrument-controls">{!fixedMode&&<div className="history-switch"><button aria-pressed={mode==="daily"} className={mode==="daily"?"active":""} onClick={()=>setSelectedMode("daily")}>日K · 60交易日</button><button aria-pressed={mode==="minute"} className={mode==="minute"?"active":""} onClick={()=>setSelectedMode("minute")}>{live?"实时分时":"7日分时回放"}</button></div>}{mode==="minute"&&!live&&<label className="minute-day-picker">分时日期 <select aria-label="分时交易日" value={minuteDate} onChange={e=>setSelectedDay(e.target.value)}>{dates.slice().reverse().map(d=><option key={d} value={d}>{d}</option>)}</select></label>}</div>}
    {mode==="minute"&&minutes(stock,minuteDate,true)}
    {mode==="daily"&&<Panel title={fixedMode?"日K走势":stock?.name||"个股历史趋势"} extra={<span className="muted">{fixedMode?"近60个交易日":stock?.code??"选择股票"}</span>} className="chart-panel">
      {!stock?<p className="history-empty">选择持仓、自选或当日候选股。</p>:busy?<p className="history-empty" role="status">正在读取 60 个交易日日线与复权因子…</p>:error?<div className="history-empty" role="alert">{error}<button className="button" onClick={retry}>重试</button></div>:data&&<>
        <div className="quote"><strong className={(data.points.at(-1)?.pct??0)<0?"down":"up"}>{data.points.at(-1)?.close.toFixed(2)} <span>{pct(data.points.at(-1)?.pct)}</span></strong><span>{data.points.at(-1)?.date} 收盘 · 未复权</span></div>
        <div className="evidence"><div><small>近 5 交易日涨幅</small><b>{pct(data.return5)}</b></div><div><small>近 20 交易日涨幅</small><b>{pct(data.return20)}</b></div><div><small>有效日线</small><b>{data.points.length}/{data.dates.length}</b></div></div>
        <DailyChart data={data}/>
        <p className="history-caption">{data.dates[0]} — {data.dates.at(-1)} · 均线与区间涨幅使用前复权价格；成交额和成交量为原始数据，不代表持仓收益。</p>
        {data.warnings.map(w=><p className="history-caption amber-text" key={w}>{w}</p>)}
        <details className="history-details"><summary>逐日价格与数据来源</summary><div className="history-table-wrap daily-price-table"><table className="history-table"><thead><tr><th>日期</th><th>收盘</th><th>复权收盘</th><th>当日涨跌</th><th>成交额/亿</th></tr></thead><tbody>{data.dates.slice().reverse().map(d=>{const p=data.points.find(r=>r.date===d);return <tr key={d}><td>{d}</td>{p?<><td>{p.close.toFixed(2)}</td><td>{p.adjustedClose?.toFixed(3)??"—"}</td><td>{pct(p.pct)}</td><td>{p.amountYi.toFixed(2)}</td></>:<td colSpan={4}>缺失，未补值</td>}</tr>;})}</tbody></table></div><p>Tushare daily + adj_factor；获取于 {new Date(data.fetchedAt).toLocaleString("zh-CN",{timeZone:"Asia/Shanghai"})}。区间边界缺行情或复权因子不完整时不输出区间收益。</p></details>
      </>}
    </Panel>}
  </div>;
}
