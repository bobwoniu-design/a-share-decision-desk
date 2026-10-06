"use client";
import {useState} from "react";
import {Panel} from "./workspace";
import {useDecision} from "./decision";
import type {ValidationReport} from "@/lib/signal-validation";

const pct=(n:number|null)=>n===null?"—":`${n>=0?"+":""}${n.toFixed(2)}%`;
const gate=(v:boolean|null)=>v===null?"待核验":v?"通过":"未通过";
export function ValidationPanel({code,date,themeCode}:{code:string;date:string;themeCode?:string}){
  const [days,setDays]=useState(3),[run,setRun]=useState(false);
  const url=run&&code&&themeCode?`/api/market/validation?code=${code}&date=${date}&theme=${encodeURIComponent(themeCode)}&days=${days}`:null;
  const {data,error,busy,retry}=useDecision<ValidationReport>(url);
  return <Panel title="历史信号检验" extra={<span className="muted">按需运行 · 所选股票与题材</span>} className="validation-panel">
    <div className="validation-controls"><span>观察区间</span>{[1,3,5].map(n=><button key={n} className={`button ${days===n?"primary":""}`} aria-pressed={days===n} onClick={()=>{setDays(n);setRun(false);}}>{n} 个交易日</button>)}<button className="button primary" disabled={!code||!themeCode||busy} onClick={()=>{if(run)retry();else setRun(true);}}>运行检验</button></div>
    {!themeCode?<p className="history-small-empty">先从题材详情或交易候选池选择股票，确定要核验的题材。</p>:!run?<p className="history-small-empty">仅在点击后读取历史分钟数据。逐日使用前一交易日已知的市场、行业和题材资格。</p>:busy?<p className="history-small-empty" role="status">正在逐日读取分钟与独立样本，首次可能需要一些时间…</p>:error?<p className="error-banner" role="alert">{error} <button className="text-link" onClick={retry}>重试</button></p>:data&&<>
      <div className="validation-summary"><span><b>{data.summary.validDays}/{data.requestedDays}</b><small>已读取分钟日</small></span><span><b>{data.summary.events}</b><small>可评估条件</small></span><span><b>{data.summary.events?`${data.summary.positive}/${data.summary.events}`:"—"}</b><small>假设净变化为正</small></span><span><b>{pct(data.summary.meanNetPct)}</b><small>平均假设净变化</small></span></div>
      {data.summary.events===0&&<p className="validation-empty">本区间没有同时满足全部资格与同步条件、且可评估的三笔信号；不计算胜率或收益率。</p>}
      <div className="validation-days">{data.days.map(day=><details key={day.date}><summary><b>{day.date}</b><span>{day.error?"数据不可用":`${day.bars} 根分钟 · ${day.events.length} 个可评估条件`}</span><small>前日市场 {gate(day.marketAllowed)} · 行业 {gate(day.industryAllowed)} · 题材 {gate(day.themeAllowed)}</small></summary><div>{day.error&&<p className="amber-text">{day.error}</p>}<p>行业独立样本 {day.industryPeers} 只 · 题材独立样本 {day.themePeers} 只；资格基于 {day.basisDate??"未取得"}。</p>{day.events.map(e=><p key={`${e.time}-${e.signal}`}>{e.time} {e.signal} → {e.entryTime} 下一分钟开盘 {e.entry.toFixed(3)} → 收盘 {e.exit.toFixed(3)}；假设净变化 <b className={e.netPct>=0?"up":"down"}>{pct(e.netPct)}</b></p>)}{day.excluded.map(x=><p key={x} className="amber-text">排除：{x}</p>)}{day.warnings.slice(0,4).map(x=><p key={x} className="muted">{x}</p>)}</div></details>)}</div>
      <p className="validation-method">方法：每种条件每天只取首次出现；下一交易分钟开盘至当日收盘测算，往返合计扣除 {data.costBps} 基点假设摩擦。分钟触发与价格不保证真实可成交，涨停锁死和缺少收盘分钟的样本剔除；同一天不同条件可能重叠，不能当作独立交易。规则 {data.engineVersion} / 检验 {data.version}，小样本结果不能证明策略有效。</p>
    </>}
  </Panel>;
}
