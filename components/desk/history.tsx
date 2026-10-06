"use client";
import { useEffect, useState } from "react";
import { RefreshCw, NotebookPen } from "lucide-react";
import { Panel, Positions } from "./workspace";
import { useDesk } from "./provider";
import {DecisionHeader, MinuteDecision, CoreProfile, useDecision} from "./decision";
import type {DecisionOverview} from "@/lib/decision-engine";
import {chinaNow} from "@/lib/minute-engine";
import { calculate } from "@/lib/ledger";
import { MarketHistory, InstrumentHistory, type HistoryStock } from "./history-charts";
import { SectorBrowser } from "./sector-browser";
import { DEFAULT_MARKET_DATE, type MarketSnapshot } from "@/lib/market-data";
const percent=(n:number|null|undefined)=>n==null?"—":`${n>=0?"+":""}${n.toFixed(2)}%`;
export function HistoricalMarket({onRecordEvent,onReview}:{onRecordEvent:()=>void;onReview:()=>void}){
  const {ledger}=useDesk();
  const [mode,setMode]=useState<"close"|"live">("close"),[sectorFocus,setSectorFocus]=useState(""),[historyOpen,setHistoryOpen]=useState(false);
  const [date,setDate]=useState(DEFAULT_MARKET_DATE),[snapshot,setSnapshot]=useState<MarketSnapshot|null>(null),[busy,setBusy]=useState(true),[error,setError]=useState(""),[retry,setRetry]=useState(0),[code,setCode]=useState(""),[selectedStock,setSelectedStock]=useState<HistoryStock|undefined>(undefined),[query,setQuery]=useState("");
  const decision=useDecision<DecisionOverview>(`/api/market/decision?date=${date}&mode=${mode}`,mode==="live");
  useEffect(()=>{
    const controller=new AbortController();setBusy(true);setSnapshot(null);setError("");setCode("");setSelectedStock(undefined);
    if(mode==="live"){setBusy(false);return()=>controller.abort();}
    fetch(`/api/market/history?date=${date}`,{signal:controller.signal,cache:"no-store"}).then(async r=>{const d=await r.json() as MarketSnapshot & {error?:string};if(!r.ok)throw new Error(d.error||"当日行情读取失败");return d;}).then(d=>{if(!controller.signal.aborted){setSnapshot(d);setCode(d.candidates[0]?.code||"");}}).catch(e=>{if(!controller.signal.aborted)setError(e.message);}).finally(()=>{if(!controller.signal.aborted)setBusy(false);});
    return()=>controller.abort();
  },[date,retry,mode]);
  useEffect(()=>{if(mode==="live"&&!code&&decision.data?.cores[0]){setCode(decision.data.cores[0].code);setSelectedStock(decision.data.cores[0]);}},[mode,code,decision.data]);
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
  const events=ledger.events.filter(e=>e.date===date).slice().reverse();
  return <div className="compact-desk">
    <div className="history-bar"><div><span className="mode-badge">TUSHARE · {mode==="live"?"盘中监测":"历史复盘"}</span><b>{date}</b><span className="muted">{busy?"正在加载…":snapshot?`${snapshot.coverage.total} 只日线已载入`:decision.data?`${decision.data.asOf} 更新`:"数据未载入"}</span></div><div><button className={`button ${mode==="live"?"primary":""}`} onClick={()=>{setMode("live");setDate(chinaNow().date);}}>今日盘中</button><button className={`button ${mode==="close"?"primary":""}`} onClick={()=>setMode("close")}>历史复盘</button><label htmlFor="market-date">交易日期</label><input id="market-date" type="date" value={date} onInput={e=>{if(e.currentTarget.value){setMode("close");setDate(e.currentTarget.value);}}}/><button className="button" disabled={busy} onClick={()=>{setRetry(v=>v+1);decision.retry();}}><RefreshCw size={14}/>重新读取</button></div></div>
    {error&&<div className="error-banner" role="alert">{error}</div>}
    <DecisionHeader {...decision} onSelect={s=>{setCode(s.code);setSelectedStock(s);}} onSector={name=>{setSectorFocus(name);const c=decision.data?.sectors.find(s=>s.name===name)?.cores[0];if(c){setCode(c.code);setSelectedStock(c);}}}/>
    {mode==="close"&&<div className="metric-grid">{cards.map(([name,value,note])=><div className="metric" key={name}><label>{name}</label><strong>{value}</strong><div className="metric-bottom"><span>{note}</span></div></div>)}</div>}
    <details className="market-history-fold" onToggle={e=>setHistoryOpen(e.currentTarget.open)}><summary>市场情绪历史 · 7 / 20 个交易日对比</summary>{historyOpen&&<MarketHistory date={date} onDate={d=>{setMode("close");setDate(d);}}/>}</details>
    <div className="market-grid">
      <div className="column sector-column"><SectorBrowser date={date} code={code} mode={mode} scored={decision.data?.sectors} focus={sectorFocus} onSelect={s=>{setCode(s.code);setSelectedStock({code:s.code,name:s.name,preClose:s.quote?.preClose});}}/>
      <details className="watch-pool-fold"><summary>全市场观察池 · {snapshot?.candidates.length??0}只</summary><div className="history-stock-list">{snapshot?.candidates.map(s=><button key={s.code} className={`history-stock ${s.code===code?"selected":""}`} onClick={()=>{setCode(s.code);setSelectedStock(s);}}><span><b>{s.name}</b><small>{s.code} · {s.label}</small></span><span className={s.pct<0?"down":"up"}>{percent(s.pct)}</span></button>)}</div></details></div>
      <div className="column"><Panel title="持仓 / 自选行情" extra={<span className="muted">支持任意 A 股</span>}><div className="history-personal">{personal.map(p=><button key={p.code} className={`tag ${p.code===code?"active":""}`} onClick={()=>setCode(p.code)}>{p.name}</button>)}{!personal.length&&<span className="muted">录入期初持仓后将在这里显示。</span>}<form onSubmit={e=>{e.preventDefault();const q=query.trim().toUpperCase();if(/^\d{6}\.(SH|SZ|BJ)$/.test(q))setCode(q);}}><input aria-label="查询证券代码" placeholder="例如 600418.SH" pattern="[0-9]{6}\.(SH|SZ|BJ)" required value={query} onChange={e=>setQuery(e.target.value.toUpperCase())}/><button className="button">查看行情</button></form></div></Panel><CoreProfile stock={stock} date={date} mode={mode}/><InstrumentHistory key={`${date}${code}`} stock={stock} date={date} live={mode==="live"} minutes={(s,d,showChart)=><MinuteDecision key={`${s?.code}${d}${mode}`} stock={s} date={d} showChart={showChart} mode={mode}/>}/></div>
      <div className="column"><Panel title="当日新闻与事件" extra={<button className="text-link" onClick={onRecordEvent}>＋ 记录事件</button>}><div className="events">{events.map(e=><article key={e.id}><div><time>{e.date}</time><span className="tag">{e.verified?"已核实":"待核实"}</span></div><h3>{e.title}</h3><p>{e.note}</p>{e.url&&<a className="event-link" href={e.url} target="_blank" rel="noreferrer">查看来源</a>}</article>)}{!events.length&&<p className="history-small-empty">这一天尚未记录事件。新闻尚未自动接入。</p>}</div></Panel><Positions/><button className="summary-card" onClick={onReview}><NotebookPen/><div><h3>每日复盘</h3><p>记录人工判断与交易执行</p></div></button></div>
    </div>
    {snapshot&&<details className="history-details" open={snapshot.warnings.length>0}><summary>数据来源与完整性{snapshot.warnings.length?` · ${snapshot.warnings.length} 项未完整获取`:""}</summary><p>交易日期 {date}（北京时间）。日线保留当日全部有效记录，包括北交所；沪深成交额单独汇总。股票名称优先用当日涨跌停名单，其他名称来自当前股票基础列表。收盘排名仅用于复盘。</p>{snapshot.sources.map((s,i)=><p key={`${s.api}${i}`}>{s.api}：{s.rows} 条 · 获取于 {new Date(s.fetchedAt).toLocaleString("zh-CN",{timeZone:"Asia/Shanghai"})}</p>)}{snapshot.warnings.map(w=><p className="amber-text" key={w}>{w}</p>)}<p><a href="https://tushare.pro/document/2?doc_id=27" target="_blank" rel="noreferrer">日线口径</a> · <a href="https://tushare.pro/document/2?doc_id=298" target="_blank" rel="noreferrer">涨跌停口径</a> · <a href="https://tushare.pro/document/2?doc_id=370" target="_blank" rel="noreferrer">分钟口径</a></p></details>}
  </div>;
}
