"use client";
import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { useDesk } from "./provider";
import {DecisionHeader, CoreProfile, useDecision} from "./decision";
import type {DecisionOverview} from "@/lib/decision-engine";
import {chinaNow} from "@/lib/minute-engine";
import { calculate } from "@/lib/ledger";
import type { HistoryStock } from "./history-charts";
import { StockChartPreview, type StockCandleBatch } from "./stock-chart-preview";
import { SectorBrowser } from "./sector-browser";
import { ThemeBrowser } from "./theme-browser";
import { FunnelBrowser } from "./funnel-browser";
import { CandidateExplanation } from "./funnel-browser";
import { StockResearch } from "./stock-research";
import { StockDetailCard } from "./stock-detail-card";
import { BoardBrowser } from "./board-browser";
import { HotMoneyBrowser } from "./hot-money-browser";
import type { LimitUpDay } from "@/lib/limit-up";
import { ValidationPanel } from "./validation-panel";
import type { FunnelCandidate } from "@/lib/funnel";
export type MarketNavigation={mode:"close"|"live";date:string;code:string;themeCode?:string;selectedStock?:HistoryStock};
export function HistoricalMarket({view,navigation,onNavigationChange,onSelectStock}:{view:"overview"|"selection";navigation:MarketNavigation;onNavigationChange:(value:MarketNavigation|((current:MarketNavigation)=>MarketNavigation))=>void;onSelectStock:()=>void}){
  const {ledger}=useDesk();
  const {mode,date,code,selectedStock}=navigation;
  const update=(change:Partial<MarketNavigation>)=>onNavigationChange(current=>({...current,...change}));
  const [dimension,setDimension]=useState<"theme"|"industry"|"board"|"hot-money">("theme");
  const [stockOpen,setStockOpen]=useState(false);
  const [expandedSource,setExpandedSource]=useState<"candidate"|"personal"|"external">("candidate");
  const decision=useDecision<DecisionOverview>(view==="overview"?`/api/market/decision?date=${date}&mode=${mode}`:null,view==="overview"&&mode==="live");
  const limitUp=useDecision<LimitUpDay>(view==="selection"&&mode==="close"?`/api/market/limit-up?date=${date}`:null);
  const positions=calculate(ledger.trades).positions;
  const heldCodes=new Set(positions.map(p=>p.code));
  const watchedCodes=new Set(ledger.watchlist.map(p=>p.code));
  const personal=[...new Map([...positions,...ledger.watchlist].map(p=>[p.code,{code:p.code,name:p.name,kind:heldCodes.has(p.code)?watchedCodes.has(p.code)?"持仓 · 自选":"持仓":"自选"}])).values()];
  const personalCandles=useDecision<StockCandleBatch>(view==="selection"&&personal.length?`/api/market/stock-candles?date=${date}&mode=${mode}&codes=${personal.slice(0,40).map(p=>p.code).join(",")}`:null);
  const stock=(selectedStock?.code===code?selectedStock:undefined)??personal.find(s=>s.code===code)??(code?{code,name:code}:undefined);
  const openStock=(change:Partial<MarketNavigation>,source:"candidate"|"personal"|"external",toggle=true)=>{const same=stockOpen&&code===change.code&&expandedSource===source;update(change);setExpandedSource(source);setStockOpen(toggle&&!same);};
  return <div className="compact-desk">
    <div className="history-bar"><h1>{view==="overview"?"市场总览":"选股与自选"}</h1><div className="history-controls"><button className={`button ${mode==="live"?"primary":""}`} onClick={()=>{setStockOpen(false);update({mode:"live",date:chinaNow().date,selectedStock:undefined});}}>今日盘中</button><button className={`button ${mode==="close"?"primary":""}`} onClick={()=>{setStockOpen(false);update({mode:"close",selectedStock:undefined});}}>历史复盘</button><input id="market-date" type="date" aria-label="交易日期" title="交易日期" value={date} onInput={e=>{if(e.currentTarget.value){setStockOpen(false);update({mode:"close",date:e.currentTarget.value,selectedStock:undefined});}}}/>{view==="overview"&&<button className="button" type="button" aria-label="重新读取行情" title="重新读取行情" disabled={decision.busy} onClick={decision.retry}><RefreshCw size={14}/></button>}</div></div>
    {view==="overview"&&<>
      <DecisionHeader {...decision} onDate={d=>update({mode:"close",date:d,selectedStock:undefined})}/>
      <div className="market-dimension-tabs" aria-label="市场总览维度"><button type="button" aria-pressed={dimension==="theme"} className={dimension==="theme"?"active":""} onClick={()=>setDimension("theme")}>题材主线</button><button type="button" aria-pressed={dimension==="industry"} className={dimension==="industry"?"active":""} onClick={()=>setDimension("industry")}>行业板块</button><button type="button" aria-pressed={dimension==="board"} className={dimension==="board"?"active":""} onClick={()=>setDimension("board")}>涨停榜单</button><button type="button" aria-pressed={dimension==="hot-money"} className={dimension==="hot-money"?"active":""} onClick={()=>setDimension("hot-money")}>游资</button><span>{dimension==="board"?"当日封板与近7日触板统计":dimension==="hot-money"?"游资名录与盘后交易明细":"题材与行业独立排名，分数不跨维度比较"}</span></div>
      {dimension==="theme"?<ThemeBrowser date={date} mode={mode} onSelect={(s,themeCode)=>{openStock({code:s.code,themeCode,selectedStock:{code:s.code,name:s.name,preClose:s.quote?.preClose}},"external",false);onSelectStock();}}/>:dimension==="industry"?<SectorBrowser date={date} code={code} mode={mode} scored={decision.data?.sectors} onSelect={s=>{openStock({code:s.code,themeCode:undefined,selectedStock:{code:s.code,name:s.name,preClose:s.quote?.preClose}},"external",false);onSelectStock();}}/>:dimension==="board"?<BoardBrowser date={date} mode={mode} overview={decision.data} renderDetails={(s,onClose)=><SelectionStockDetail key={`${date}:${s.code}`} stock={s} date={date} mode={mode} onClose={onClose}/>} />:<HotMoneyBrowser date={date} mode={mode}/>}
    </>}
    {view==="selection"&&<div className="selection-list">
      {stockOpen&&expandedSource==="external"&&stock&&<section className="selection-standalone-detail"><SelectionStockDetail key={`${date}:${code}:${navigation.themeCode??""}`} stock={stock} date={date} mode={mode} themeCode={navigation.themeCode} showPreview onClose={()=>setStockOpen(false)}/></section>}
      <FunnelBrowser
        date={date} mode={mode} limitUp={limitUp} personal={personal} personalCandles={personalCandles.data}
        expandedCode={stockOpen?code:null} expandedSource={expandedSource}
        onSelect={c=>openStock({code:c.code,themeCode:c.theme?.code,selectedStock:{code:c.code,name:c.name}},"candidate")}
        onSelectPersonal={p=>openStock({code:p.code,themeCode:undefined,selectedStock:{code:p.code,name:p.name}},"personal")}
        onLookup={s=>openStock({code:s.code,themeCode:undefined,selectedStock:{code:s.code,name:s.name}},"external")}
        renderDetails={c=><SelectionStockDetail key={`${date}:${c.code}:${c.theme?.code??""}`} stock={stock?.code===c.code?stock:{code:c.code,name:c.name}} candidate={c} date={date} mode={mode} themeCode={c.theme?.code} onClose={()=>setStockOpen(false)}/>}
        renderPersonalDetails={p=><SelectionStockDetail key={`${date}:${p.code}`} stock={{code:p.code,name:p.name}} date={date} mode={mode} onClose={()=>setStockOpen(false)}/>}
      />
    </div>}
    {view==="overview"&&decision.data&&<details className="history-details" open={decision.data.warnings.length>0}><summary>数据来源与完整性{decision.data.warnings.length?` · ${decision.data.warnings.length} 项提示`:""}</summary><p>交易日期 {date}（北京时间）。市场指标来自 Tushare A股日线与涨跌停名单；沪深成交额不含北交所。指数K线单独来自上证综指 index_daily，价格不参与全市场情绪评分。收盘排名仅用于复盘。</p><p>市场决策数据获取于 {new Date(decision.data.fetchedAt).toLocaleString("zh-CN",{timeZone:"Asia/Shanghai"})}。</p>{decision.data.warnings.map(w=><p className="amber-text" key={w}>{w}</p>)}<p><a href="https://tushare.pro/document/2?doc_id=27" target="_blank" rel="noreferrer">日线口径</a> · <a href="https://tushare.pro/document/2?doc_id=298" target="_blank" rel="noreferrer">涨跌停口径</a> · <a href="https://tushare.pro/document/1?doc_id=95" target="_blank" rel="noreferrer">指数日线口径</a></p></details>}
  </div>;
}

function SelectionStockDetail({stock,candidate,date,mode,themeCode,showPreview=false,onClose}:{stock:HistoryStock;candidate?:FunnelCandidate;date:string;mode:"close"|"live";themeCode?:string;showPreview?:boolean;onClose:()=>void}){
  return <div className="stock-detail-content" role="region" aria-label={`${stock.name}详情`}>
    <div className="selection-detail-heading"><span>{date} · {mode==="live"?"盘中监测":"历史复盘"}</span>{showPreview&&<StockChartPreview stock={stock} date={date} mode={mode} themeCode={themeCode} fetchSingle/>}<button className="text-link" onClick={onClose}>收起详情</button></div>
    {candidate&&<StockDetailCard title="为什么列入观察" subtitle="入池依据、待核对项与下一步条件" defaultOpen><CandidateExplanation candidate={candidate}/></StockDetailCard>}
    <StockResearch code={stock.code} name={stock.name} date={date} candidate={candidate}/>
    <StockDetailCard title="板块地位与核心度" subtitle="行业核心度因子与角色依据"><CoreProfile stock={stock} date={date} mode={mode}/></StockDetailCard>
    {mode==="close"&&<StockDetailCard title="历史信号检验" subtitle="按需运行所选股票与题材的历史检验"><ValidationPanel key={`${stock.code}:${themeCode??""}:${date}`} code={stock.code} date={date} themeCode={themeCode}/></StockDetailCard>}
  </div>;
}
