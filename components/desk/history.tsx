"use client";
import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { Panel } from "./workspace";
import { useDesk } from "./provider";
import {DecisionHeader, MinuteDecision, CoreProfile, useDecision} from "./decision";
import type {DecisionOverview} from "@/lib/decision-engine";
import {chinaNow} from "@/lib/minute-engine";
import { calculate } from "@/lib/ledger";
import { InstrumentHistory, type HistoryStock } from "./history-charts";
import { SectorBrowser } from "./sector-browser";
import { ThemeBrowser } from "./theme-browser";
import { FunnelBrowser } from "./funnel-browser";
import { BoardBrowser } from "./board-browser";
import { ValidationPanel } from "./validation-panel";
export type MarketNavigation={mode:"close"|"live";date:string;code:string;themeCode?:string;selectedStock?:HistoryStock};
export function HistoricalMarket({view,navigation,onNavigationChange,onSelectStock}:{view:"overview"|"selection";navigation:MarketNavigation;onNavigationChange:(value:MarketNavigation|((current:MarketNavigation)=>MarketNavigation))=>void;onSelectStock:()=>void}){
  const {ledger}=useDesk();
  const {mode,date,code,selectedStock}=navigation;
  const update=(change:Partial<MarketNavigation>)=>onNavigationChange(current=>({...current,...change}));
  const [dimension,setDimension]=useState<"theme"|"industry"|"board">("theme");
  const [query,setQuery]=useState("");
  const decision=useDecision<DecisionOverview>(view==="overview"?`/api/market/decision?date=${date}&mode=${mode}`:null,view==="overview"&&mode==="live");
  const personal=[...new Map([...calculate(ledger.trades).positions,...ledger.watchlist].map(p=>[p.code,{code:p.code,name:p.name}])).values()];
  const stock=(selectedStock?.code===code?selectedStock:undefined)??personal.find(s=>s.code===code)??(code?{code,name:code}:undefined);
  return <div className="compact-desk">
    <div className="history-bar"><div><span className="mode-badge">TUSHARE · {mode==="live"?"盘中监测":"历史复盘"}</span><b>{date}</b><span className="muted">{view==="selection"?"候选与个股按需读取":decision.busy?"正在加载…":decision.data?`${decision.data.marketDays.at(-1)?.total??"—"} 只日线已载入`:"数据未载入"}</span></div><div><button className={`button ${mode==="live"?"primary":""}`} onClick={()=>update({mode:"live",date:chinaNow().date,selectedStock:undefined})}>今日盘中</button><button className={`button ${mode==="close"?"primary":""}`} onClick={()=>update({mode:"close",selectedStock:undefined})}>历史复盘</button><label htmlFor="market-date">交易日期</label><input id="market-date" type="date" value={date} onInput={e=>{if(e.currentTarget.value)update({mode:"close",date:e.currentTarget.value,selectedStock:undefined});}}/><button className="button" disabled={decision.busy} onClick={decision.retry}><RefreshCw size={14}/>重新读取</button></div></div>
    {view==="overview"&&<>
      <DecisionHeader {...decision} onDate={d=>update({mode:"close",date:d,selectedStock:undefined})}/>
      <div className="market-dimension-tabs" aria-label="市场总览维度"><button type="button" aria-pressed={dimension==="theme"} className={dimension==="theme"?"active":""} onClick={()=>setDimension("theme")}>题材主线</button><button type="button" aria-pressed={dimension==="industry"} className={dimension==="industry"?"active":""} onClick={()=>setDimension("industry")}>行业板块</button><button type="button" aria-pressed={dimension==="board"} className={dimension==="board"?"active":""} onClick={()=>setDimension("board")}>涨停榜单</button><span>{dimension==="board"?"当日封板与近7日触板统计":"题材与行业独立排名，分数不跨维度比较"}</span></div>
      {dimension==="theme"?<ThemeBrowser date={date} mode={mode} onSelect={(s,themeCode)=>{update({code:s.code,themeCode,selectedStock:{code:s.code,name:s.name,preClose:s.quote?.preClose}});onSelectStock();}}/>:dimension==="industry"?<SectorBrowser date={date} code={code} mode={mode} scored={decision.data?.sectors} onSelect={s=>{update({code:s.code,themeCode:undefined,selectedStock:{code:s.code,name:s.name,preClose:s.quote?.preClose}});onSelectStock();}}/>:<BoardBrowser date={date} mode={mode} overview={decision.data} onSelect={s=>{update({code:s.code,themeCode:undefined,selectedStock:s});onSelectStock();}}/>}
    </>}
    {view==="selection"&&<div className="market-grid selection-grid">
      <div className="column"><FunnelBrowser date={date} mode={mode} selectedCode={code} onSelect={c=>update({code:c.code,themeCode:c.theme?.code,selectedStock:{code:c.code,name:c.name}})}/><Panel title="持仓 / 自选" extra={<span className="muted">个人记录</span>}><div className="history-personal">{personal.map(p=><button key={p.code} className={`tag ${p.code===code?"active":""}`} onClick={()=>update({code:p.code,themeCode:undefined,selectedStock:undefined})}>{p.name}</button>)}{!personal.length&&<span className="muted">录入期初持仓或自选后将在这里显示。</span>}<form onSubmit={e=>{e.preventDefault();const q=query.trim().toUpperCase();if(/^\d{6}\.(SH|SZ|BJ)$/.test(q))update({code:q,themeCode:undefined,selectedStock:undefined});}}><input aria-label="查询证券代码" placeholder="例如 600418.SH" pattern="[0-9]{6}\.(SH|SZ|BJ)" required value={query} onChange={e=>setQuery(e.target.value.toUpperCase())}/><button className="button">查看行情</button></form></div></Panel></div>
      <div className="column"><CoreProfile stock={stock} date={date} mode={mode}/><InstrumentHistory key={`${date}${code}`} stock={stock} date={date} live={mode==="live"} minutes={(s,d,showChart)=><MinuteDecision key={`${s?.code}${d}${mode}${navigation.themeCode??""}`} stock={s} date={d} showChart={showChart} mode={mode} themeCode={navigation.themeCode}/>}/>{mode==="close"&&code&&<ValidationPanel key={`${code}:${navigation.themeCode??""}:${date}`} code={code} date={date} themeCode={navigation.themeCode}/>}</div>
    </div>}
    {view==="overview"&&decision.data&&<details className="history-details" open={decision.data.warnings.length>0}><summary>数据来源与完整性{decision.data.warnings.length?` · ${decision.data.warnings.length} 项提示`:""}</summary><p>交易日期 {date}（北京时间）。市场指标来自 Tushare A股日线与涨跌停名单；沪深成交额不含北交所。指数K线单独来自上证综指 index_daily，价格不参与全市场情绪评分。收盘排名仅用于复盘。</p><p>市场决策数据获取于 {new Date(decision.data.fetchedAt).toLocaleString("zh-CN",{timeZone:"Asia/Shanghai"})}。</p>{decision.data.warnings.map(w=><p className="amber-text" key={w}>{w}</p>)}<p><a href="https://tushare.pro/document/2?doc_id=27" target="_blank" rel="noreferrer">日线口径</a> · <a href="https://tushare.pro/document/2?doc_id=298" target="_blank" rel="noreferrer">涨跌停口径</a> · <a href="https://tushare.pro/document/1?doc_id=95" target="_blank" rel="noreferrer">指数日线口径</a></p></details>}
  </div>;
}
