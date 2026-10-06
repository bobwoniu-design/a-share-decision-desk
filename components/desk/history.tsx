"use client";
import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Panel } from "./workspace";
import { useDesk } from "./provider";
import {DecisionHeader, MinuteDecision, CoreProfile, useDecision} from "./decision";
import type {DecisionOverview} from "@/lib/decision-engine";
import {chinaNow} from "@/lib/minute-engine";
import { calculate } from "@/lib/ledger";
import { MarketHistory, InstrumentHistory, type HistoryStock } from "./history-charts";
import { SectorBrowser } from "./sector-browser";
import { ThemeBrowser } from "./theme-browser";
import { type MarketSnapshot } from "@/lib/market-data";
const percent=(n:number|null|undefined)=>n==null?"—":`${n>=0?"+":""}${n.toFixed(2)}%`;
export type MarketNavigation={mode:"close"|"live";date:string;code:string;selectedStock?:HistoryStock};
export function HistoricalMarket({view,navigation,onNavigationChange,onSelectStock}:{view:"overview"|"selection";navigation:MarketNavigation;onNavigationChange:(value:MarketNavigation|((current:MarketNavigation)=>MarketNavigation))=>void;onSelectStock:()=>void}){
  const {ledger}=useDesk();
  const {mode,date,code,selectedStock}=navigation;
  const update=(change:Partial<MarketNavigation>)=>onNavigationChange(current=>({...current,...change}));
  const [sectorFocus,setSectorFocus]=useState({name:"",serial:0}),[historyOpen,setHistoryOpen]=useState(false);
  const [dimension,setDimension]=useState<"theme"|"industry">("theme");
  const [snapshot,setSnapshot]=useState<MarketSnapshot|null>(null),[busy,setBusy]=useState(true),[error,setError]=useState(""),[retry,setRetry]=useState(0),[query,setQuery]=useState("");
  const decision=useDecision<DecisionOverview>(`/api/market/decision?date=${date}&mode=${mode}`,mode==="live");
  useEffect(()=>{
    const controller=new AbortController();setBusy(true);setSnapshot(null);setError("");
    if(mode==="live"){setBusy(false);return()=>controller.abort();}
    fetch(`/api/market/history?date=${date}`,{signal:controller.signal,cache:"no-store"}).then(async r=>{const d=await r.json() as MarketSnapshot & {error?:string};if(!r.ok)throw new Error(d.error||"当日行情读取失败");return d;}).then(d=>{if(!controller.signal.aborted){setSnapshot(d);onNavigationChange(current=>current.code?current:{...current,code:d.candidates[0]?.code||""});}}).catch(e=>{if(!controller.signal.aborted)setError(e.message);}).finally(()=>{if(!controller.signal.aborted)setBusy(false);});
    return()=>controller.abort();
  },[date,retry,mode,onNavigationChange]);
  useEffect(()=>{if(mode==="live"&&!code&&decision.data?.cores[0]){update({code:decision.data.cores[0].code,selectedStock:decision.data.cores[0]});}},[mode,code,decision.data]);
  const personal=[...new Map([...calculate(ledger.trades).positions,...ledger.watchlist].map(p=>[p.code,{code:p.code,name:p.name}])).values()];
  const stock=(selectedStock?.code===code?selectedStock:undefined)??snapshot?.candidates.find(s=>s.code===code)??personal.find(s=>s.code===code)??(code?{code,name:code}:undefined),stats=snapshot?.coverage,l=snapshot?.limits;
  const cards=[
    ["上涨 / 下跌",stats?`${stats.up} / ${stats.down}`:"—",stats?`平盘 ${stats.flat} · 有行情 ${stats.total} 只`:"沪深北当日有行情股票"],
    ["涨停 / 跌停",l?`${l.up} / ${l.down}`:"—","Tushare 涨跌停名单 · 不含ST"],
    ["连板高度",l?`${l.height} 板`:"—","当日收盘涨停股票最大连板数"],
    ["炸板率",l?.brokenRate!=null?`${l.brokenRate.toFixed(1)}%`:"—",l?`${l.broken} 只炸板 ÷ 触板股票数`:"炸板 /（涨停＋炸板）"],
    ["昨日涨停溢价",percent(snapshot?.premium?.value),snapshot?.premium?`收盘等权 · ${snapshot.premium.matched}/${snapshot.premium.total}只有行情`:"前一交易日涨停样本 · 待数据"],
    ["沪深A股成交额",stats?`${stats.amountYi.toLocaleString("zh-CN",{maximumFractionDigits:1})} 亿`:"—","daily股票成交额合计 · 不含北交所"]
  ];
  return <div className="compact-desk">
    <div className="history-bar"><div><span className="mode-badge">TUSHARE · {mode==="live"?"盘中监测":"历史复盘"}</span><b>{date}</b><span className="muted">{busy?"正在加载…":snapshot?`${snapshot.coverage.total} 只日线已载入`:decision.data?`${decision.data.asOf} 更新`:"数据未载入"}</span></div><div><button className={`button ${mode==="live"?"primary":""}`} onClick={()=>update({mode:"live",date:chinaNow().date,selectedStock:undefined})}>今日盘中</button><button className={`button ${mode==="close"?"primary":""}`} onClick={()=>update({mode:"close",selectedStock:undefined})}>历史复盘</button><label htmlFor="market-date">交易日期</label><input id="market-date" type="date" value={date} onInput={e=>{if(e.currentTarget.value)update({mode:"close",date:e.currentTarget.value,selectedStock:undefined});}}/><button className="button" disabled={busy} onClick={()=>{setRetry(v=>v+1);decision.retry();}}><RefreshCw size={14}/>重新读取</button></div></div>
    {error&&<div className="error-banner" role="alert">{error}</div>}
    {view==="overview"&&<>
      <DecisionHeader {...decision} showIndustry={dimension==="industry"} onSelect={s=>{update({code:s.code,selectedStock:s});onSelectStock();}} onSector={name=>{setSectorFocus(current=>({name,serial:current.serial+1}));const c=decision.data?.sectors.find(s=>s.name===name)?.cores[0];if(c)update({code:c.code,selectedStock:c});}}/>
      {mode==="close"&&<div className="metric-grid">{cards.map(([name,value,note])=><div className="metric" key={name}><label>{name}</label><strong>{value}</strong><div className="metric-bottom"><span>{note}</span></div></div>)}</div>}
      <details className="market-history-fold" onToggle={e=>setHistoryOpen(e.currentTarget.open)}><summary>市场情绪历史 · 7 / 20 个交易日对比</summary>{historyOpen&&<MarketHistory date={date} onDate={d=>update({mode:"close",date:d,selectedStock:undefined})}/>}</details>
      <div className="market-dimension-tabs" aria-label="市场总览维度"><button aria-pressed={dimension==="theme"} className={dimension==="theme"?"active":""} onClick={()=>setDimension("theme")}>题材主线</button><button aria-pressed={dimension==="industry"} className={dimension==="industry"?"active":""} onClick={()=>setDimension("industry")}>行业板块</button><span>两个来源独立排名，分数不跨维度比较</span></div>
      {dimension==="theme"?<ThemeBrowser date={date} mode={mode} onSelect={s=>{update({code:s.code,selectedStock:{code:s.code,name:s.name,preClose:s.quote?.preClose}});onSelectStock();}}/>:<SectorBrowser date={date} code={code} mode={mode} scored={decision.data?.sectors} focus={sectorFocus} onSelect={s=>{update({code:s.code,selectedStock:{code:s.code,name:s.name,preClose:s.quote?.preClose}});onSelectStock();}}/>}
    </>}
    {view==="selection"&&<div className="market-grid selection-grid">
      <div className="column"><Panel title="系统选股池" extra={<span className="muted">{mode==="live"?"盘中快照":"收盘观察"}</span>}><div className="history-stock-list">{(mode==="live"?(decision.data?.cores??[]):(snapshot?.candidates??[])).map(s=><button key={s.code} className={`history-stock ${s.code===code?"selected":""}`} onClick={()=>update({code:s.code,selectedStock:s})}><span><b>{s.name}</b><small>{s.code} · {"label" in s?s.label:"核心候选"}</small></span>{"pct" in s&&<span className={s.pct<0?"down":"up"}>{percent(s.pct)}</span>}</button>)}{!busy&&!decision.busy&&!(mode==="live"?decision.data?.cores.length:snapshot?.candidates.length)&&<p className="history-small-empty">当前没有满足筛选条件的候选。</p>}</div></Panel><Panel title="持仓 / 自选" extra={<span className="muted">个人记录</span>}><div className="history-personal">{personal.map(p=><button key={p.code} className={`tag ${p.code===code?"active":""}`} onClick={()=>update({code:p.code,selectedStock:undefined})}>{p.name}</button>)}{!personal.length&&<span className="muted">录入期初持仓或自选后将在这里显示。</span>}<form onSubmit={e=>{e.preventDefault();const q=query.trim().toUpperCase();if(/^\d{6}\.(SH|SZ|BJ)$/.test(q))update({code:q,selectedStock:undefined});}}><input aria-label="查询证券代码" placeholder="例如 600418.SH" pattern="[0-9]{6}\.(SH|SZ|BJ)" required value={query} onChange={e=>setQuery(e.target.value.toUpperCase())}/><button className="button">查看行情</button></form></div></Panel></div>
      <div className="column"><CoreProfile stock={stock} date={date} mode={mode}/><InstrumentHistory key={`${date}${code}`} stock={stock} date={date} live={mode==="live"} minutes={(s,d,showChart)=><MinuteDecision key={`${s?.code}${d}${mode}`} stock={s} date={d} showChart={showChart} mode={mode}/>}/></div>
    </div>}
    {snapshot&&<details className="history-details" open={snapshot.warnings.length>0}><summary>数据来源与完整性{snapshot.warnings.length?` · ${snapshot.warnings.length} 项未完整获取`:""}</summary><p>交易日期 {date}（北京时间）。日线保留当日全部有效记录，包括北交所；沪深成交额单独汇总。股票名称优先用当日涨跌停名单，其他名称来自当前股票基础列表。收盘排名仅用于复盘。</p>{snapshot.sources.map((s,i)=><p key={`${s.api}${i}`}>{s.api}：{s.rows} 条 · 获取于 {new Date(s.fetchedAt).toLocaleString("zh-CN",{timeZone:"Asia/Shanghai"})}</p>)}{snapshot.warnings.map(w=><p className="amber-text" key={w}>{w}</p>)}<p><a href="https://tushare.pro/document/2?doc_id=27" target="_blank" rel="noreferrer">日线口径</a> · <a href="https://tushare.pro/document/2?doc_id=298" target="_blank" rel="noreferrer">涨跌停口径</a> · <a href="https://tushare.pro/document/2?doc_id=370" target="_blank" rel="noreferrer">分钟口径</a></p></details>}
  </div>;
}
