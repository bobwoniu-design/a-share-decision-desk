"use client";
import { useEffect, useState } from "react";
import { RefreshCw, NotebookPen } from "lucide-react";
import { Panel, Positions } from "./workspace";
import { useDesk } from "./provider";
import { Plot, evidence } from "./market";
import { calculate } from "@/lib/ledger";
import { MarketHistory, InstrumentHistory, type HistoryStock } from "./history-charts";
import { Slider } from "@/components/ui/slider";
import { DEFAULT_MARKET_DATE, type MarketSnapshot, type Bar } from "@/lib/market-data";
const percent=(n:number|null|undefined)=>n==null?"—":`${n>=0?"+":""}${n.toFixed(2)}%`;
function MinutePanel({stock,date}:{stock:HistoryStock|undefined;date:string}){
  const [result,setResult]=useState<{bars:Bar[];fetchedAt:string}|null>(null),[error,setError]=useState(""),[busy,setBusy]=useState(false),[cursor,setCursor]=useState(1),[retry,setRetry]=useState(0);
  useEffect(()=>{
    const controller=new AbortController();setResult(null);setError("");
    if(!stock){setBusy(false);return()=>controller.abort();}
    setBusy(true);
    fetch(`/api/market/history?date=${date}&code=${stock.code}`,{signal:controller.signal,cache:"no-store"}).then(async r=>{
      const d=await r.json() as {bars:Bar[];fetchedAt:string;error?:string};if(!r.ok)throw new Error(d.error||"分钟行情读取失败");return d;
    }).then(d=>{if(!controller.signal.aborted){setResult(d);setCursor(d.bars.length||1);if(!d.bars.length)setError("该股票当日没有分钟行情，无法计算 VWAP 或状态。");}}).catch(e=>{if(!controller.signal.aborted)setError(e.message);}).finally(()=>{if(!controller.signal.aborted)setBusy(false);});
    return()=>controller.abort();
  },[stock?.code,date,retry]);
  const bars=result?.bars.slice(0,cursor)||[],e=evidence(bars);
  const pct=e&&stock?.preClose?(e.last.close/stock.preClose-1)*100:null;
  return <Panel title={stock?.name||"个股分时与 VWAP"} extra={<span className="muted">{stock?.code||"等待日线候选"}</span>} className="chart-panel">
    <div className="quote"><strong className={pct!==null&&pct<0?"down":"up"}>{e?.last.close.toFixed(2)||"—"} <span>{percent(pct)}</span></strong><span>{date} · {e?.last.time||"历史1分钟"}</span></div>
    {busy?<div className="history-empty" role="status">正在读取真实分钟行情…</div>:error?<div className="history-empty"><p role="alert">{error}</p><button className="button" onClick={()=>setRetry(v=>v+1)}>重试分钟行情</button></div>:!e?<div className="history-empty">选择一只候选股，查看当日真实分时。</div>:<>
      <div className="chart-toolbar"><span className="pill">历史回放</span><div><i className="legend white"/>价格<i className="legend amber"/>VWAP</div></div>
      <Plot bars={bars}/>
      <div className="replay-control"><span>{result!.bars[0].time}</span><Slider aria-label="真实分时回放分钟" min={1} max={Math.max(result!.bars.length,2)} value={[cursor]} onValueChange={v=>setCursor(v[0])}/><span>{e.last.time}</span></div>
      <div className="state-path">{["观察","分歧","承接","确认","转强"].map(s=><span key={s} className={e.state===s?"active":""}>{s}</span>)}</div>
      <div className="evidence"><div><small>累计 VWAP</small><b>{e.vwap?.toFixed(3)??"—"}</b></div><div><small>连续位于均价上方</small><b>{e.above} 根</b></div><div><small>板块同步</small><b className="amber-text">尚未验证</b></div></div>
      <div className="signal-note"><div><b>{e.state}候选 · 原型规则</b><p>使用当前回放时点前的分钟线。收盘候选池用于事后复盘，不能作为无未来信息的策略回测。</p></div></div>
      <details className="history-details"><summary>数据与状态依据</summary><p>共 {result!.bars.length} 根；数据获取于 {new Date(result!.fetchedAt).toLocaleString("zh-CN",{timeZone:"Asia/Shanghai"})}。成交额（元）÷成交量（股）累计计算 VWAP。缺失分钟不补齐。</p><p>至少20根后，已观察区间振幅≥2%为分歧候选；后半段低点高于前半段为承接候选；再连续3根收盘站上VWAP为确认候选。当前未验证策略有效性，暂不输出“转强”。</p></details>
    </>}
  </Panel>;
}
export function HistoricalMarket({onRecordEvent,onReview}:{onRecordEvent:()=>void;onReview:()=>void}){
  const {ledger}=useDesk();
  const [date,setDate]=useState(DEFAULT_MARKET_DATE),[snapshot,setSnapshot]=useState<MarketSnapshot|null>(null),[busy,setBusy]=useState(true),[error,setError]=useState(""),[retry,setRetry]=useState(0),[code,setCode]=useState(""),[sector,setSector]=useState(""),[query,setQuery]=useState("");
  useEffect(()=>{
    const controller=new AbortController();setBusy(true);setSnapshot(null);setError("");setCode("");setSector("");
    fetch(`/api/market/history?date=${date}`,{signal:controller.signal,cache:"no-store"}).then(async r=>{const d=await r.json() as MarketSnapshot & {error?:string};if(!r.ok)throw new Error(d.error||"当日行情读取失败");return d;}).then(d=>{if(!controller.signal.aborted){setSnapshot(d);setCode(d.candidates[0]?.code||"");}}).catch(e=>{if(!controller.signal.aborted)setError(e.message);}).finally(()=>{if(!controller.signal.aborted)setBusy(false);});
    return()=>controller.abort();
  },[date,retry]);
  const personal=[...new Map([...calculate(ledger.trades).positions,...ledger.watchlist].map(p=>[p.code,{code:p.code,name:p.name}])).values()];
  const stock=snapshot?.candidates.find(s=>s.code===code)??personal.find(s=>s.code===code)??(code?{code,name:code}:undefined),stats=snapshot?.coverage,l=snapshot?.limits;
  const cards=[
    ["上涨 / 下跌",stats?`${stats.up} / ${stats.down}`:"—",stats?`平盘 ${stats.flat} · 有行情 ${stats.total} 只`:"沪深北当日有行情股票"],
    ["涨停 / 跌停",l?`${l.up} / ${l.down}`:"—","Tushare 涨跌停名单 · 不含ST"],
    ["连板高度",l?`${l.height} 板`:"—","当日收盘涨停股票最大连板数"],
    ["炸板率",l?.brokenRate!=null?`${l.brokenRate.toFixed(1)}%`:"—",l?`${l.broken} 只炸板 ÷ 触板股票数`:"炸板 /（涨停＋炸板）"],
    ["昨日涨停溢价",percent(snapshot?.premium?.value),snapshot?.premium?`收盘等权 · ${snapshot.premium.matched}/${snapshot.premium.total}只有行情`:"前一交易日涨停样本 · 待数据"],
    ["沪深A股成交额",stats?`${stats.amountYi.toLocaleString("zh-CN",{maximumFractionDigits:1})} 亿`:"—","daily股票成交额合计 · 不含北交所"]
  ];
  const events=ledger.events.filter(e=>e.date===date).slice().reverse();
  return <>
    <div className="history-bar"><div><span className="mode-badge">TUSHARE · 历史复盘</span><b>{date}</b><span className="muted">{busy?"正在加载…":snapshot?`${snapshot.coverage.total} 只日线已载入`:"数据未载入"}</span></div><div><label htmlFor="market-date">交易日期</label><input id="market-date" type="date" value={date} onInput={e=>{if(e.currentTarget.value)setDate(e.currentTarget.value);}}/><button className="button" disabled={busy} onClick={()=>setRetry(v=>v+1)}><RefreshCw size={14}/>重新读取</button></div></div>
    {error&&<div className="error-banner" role="alert">{error}</div>}
    <div className="metric-grid">{cards.map(([name,value,note])=><div className="metric" key={name}><label>{name}</label><strong>{value}</strong><div className="metric-bottom"><span>{note}</span></div></div>)}</div>
    <MarketHistory date={date} onDate={setDate}/>
    <div className="cycle"><b>情绪周期</b><span className="tag">待人工判定</span><small>结合近 7 / 20 个交易日的涨跌停、成交额与溢价，记录人工周期判断。</small></div>
    <div className="market-grid">
      <div className="column"><Panel title="主线观察" extra={<span className="muted">按行业涨停家数</span>}><div className="sectors">{snapshot?.sectors.slice(0,6).map((s,i)=><button className="sector" key={s.name} onClick={()=>setSector(v=>v===s.name?"":s.name)}><span className="rank">{String(i+1).padStart(2,"0")}</span><b>{s.name}</b><div className="bar"><i style={{width:`${s.count/(snapshot.sectors[0]?.count||1)*100}%`}}/></div><strong>{s.count}</strong><span className="tag">涨停</span></button>)}{!snapshot?.sectors.length&&<p className="history-small-empty">{busy?"正在读取涨停行业…":"暂无可用行业涨停名单"}</p>}</div><p className="history-caption">涨停名单的当日行业分类。排名用于观察，尚未判定主线持续性。</p></Panel>
      <Panel title="核心观察候选" extra={<span className="count">{snapshot?.candidates.length??0} 只</span>}><p className="history-caption">连板高度前列＋上涨成交活跃股；角色待人工确认。</p>{sector&&<button className="text-link history-caption" onClick={()=>setSector("")}>{sector} · 显示全部</button>}<div className="history-stock-list">{snapshot?.candidates.filter(s=>!sector||s.industry===sector).map(s=><button key={s.code} className={`history-stock ${s.code===code?"selected":""}`} onClick={()=>setCode(s.code)}><span><b>{s.name}</b><small>{s.code} · {s.label}</small></span><span className={s.pct<0?"down":"up"}>{percent(s.pct)}</span></button>)}{!snapshot&&<p className="history-small-empty">{busy?"正在筛选当日候选…":"等待真实日线数据"}</p>}{snapshot&&sector&&!snapshot.candidates.some(s=>s.industry===sector)&&<p className="history-small-empty">该行业不在当前20只观察候选中。</p>}</div></Panel></div>
      <div className="column"><Panel title="持仓 / 自选行情" extra={<span className="muted">支持任意 A 股</span>}><div className="history-personal">{personal.map(p=><button key={p.code} className={`tag ${p.code===code?"active":""}`} onClick={()=>setCode(p.code)}>{p.name}</button>)}{!personal.length&&<span className="muted">录入期初持仓后将在这里显示。</span>}<form onSubmit={e=>{e.preventDefault();const q=query.trim().toUpperCase();if(/^\d{6}\.(SH|SZ|BJ)$/.test(q))setCode(q);}}><input aria-label="查询证券代码" placeholder="例如 600418.SH" pattern="[0-9]{6}\.(SH|SZ|BJ)" required value={query} onChange={e=>setQuery(e.target.value.toUpperCase())}/><button className="button">查看行情</button></form></div></Panel><InstrumentHistory key={`${date}${code}`} stock={stock} date={date} minutes={(s,d)=><MinutePanel key={`${s?.code}${d}`} stock={s} date={d}/>}/></div>
      <div className="column"><Panel title="当日新闻与事件" extra={<button className="text-link" onClick={onRecordEvent}>＋ 记录事件</button>}><div className="events">{events.map(e=><article key={e.id}><div><time>{e.date}</time><span className="tag">{e.verified?"已核实":"待核实"}</span></div><h3>{e.title}</h3><p>{e.note}</p>{e.url&&<a className="event-link" href={e.url} target="_blank" rel="noreferrer">查看来源</a>}</article>)}{!events.length&&<p className="history-small-empty">这一天尚未记录事件。新闻尚未自动接入。</p>}</div></Panel><Positions/><button className="summary-card" onClick={onReview}><NotebookPen/><div><h3>每日复盘</h3><p>记录人工判断与交易执行</p></div></button></div>
    </div>
    {snapshot&&<details className="history-details" open={snapshot.warnings.length>0}><summary>数据来源与完整性{snapshot.warnings.length?` · ${snapshot.warnings.length} 项未完整获取`:""}</summary><p>交易日期 {date}（北京时间）。日线保留当日全部有效记录，包括北交所；沪深成交额单独汇总。股票名称优先用当日涨跌停名单，其他名称来自当前股票基础列表。收盘排名仅用于复盘。</p>{snapshot.sources.map((s,i)=><p key={`${s.api}${i}`}>{s.api}：{s.rows} 条 · 获取于 {new Date(s.fetchedAt).toLocaleString("zh-CN",{timeZone:"Asia/Shanghai"})}</p>)}{snapshot.warnings.map(w=><p className="amber-text" key={w}>{w}</p>)}<p><a href="https://tushare.pro/document/2?doc_id=27" target="_blank" rel="noreferrer">日线口径</a> · <a href="https://tushare.pro/document/2?doc_id=298" target="_blank" rel="noreferrer">涨跌停口径</a> · <a href="https://tushare.pro/document/2?doc_id=370" target="_blank" rel="noreferrer">分钟口径</a></p></details>}
  </>;
}
