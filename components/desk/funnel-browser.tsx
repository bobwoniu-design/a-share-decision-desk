"use client";
import {Fragment,useEffect,useState,type ReactNode} from "react";
import {Panel} from "./workspace";
import {useDecision} from "./decision";
import {CandleChart} from "./candle-chart";
import {StockChartTabs} from "./stock-chart-tabs";
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from "@/components/ui/dialog";
import type {Candle} from "@/lib/candle-data";
import type {FunnelCandidate,FunnelOverview} from "@/lib/funnel";
import {FunnelMinuteMonitor,FunnelValidationPanel} from "./funnel-extras";

const filters=["全部","重点观察","条件观察","证据不足"] as const;
const show=(n:number|null)=>n===null?"—":String(n);
type StockCandles={date:string;mode:"close"|"live";asOf:string;dates:string[];byCode:Record<string,Candle[]>};
export function FunnelBrowser({date,mode,expandedCode,onSelect,renderDetails}:{date:string;mode:"close"|"live";expandedCode:string|null;onSelect:(candidate:FunnelCandidate)=>void;renderDetails:(candidate:FunnelCandidate)=>ReactNode}){
  const {data,error,busy,retry}=useDecision<FunnelOverview>(`/api/market/decision?view=funnel&date=${date}&mode=${mode}`,mode==="live");
  useEffect(()=>{if(!data||mode!=="close")return;const controller=new AbortController();void fetch(`/api/market/decision?view=basis&date=${date}&mode=close`,{signal:controller.signal,cache:"no-store"}).catch(()=>undefined);return()=>controller.abort();},[data,date,mode]);
  const [filter,setFilter]=useState<(typeof filters)[number]>("全部");
  const [chartStock,setChartStock]=useState<FunnelCandidate|null>(null);
  const candidates=data?.candidates??[],visible=candidates.filter(c=>filter==="全部"||c.status===filter);
  const candleUrl=candidates.length?`/api/market/stock-candles?date=${date}&mode=${mode}&codes=${candidates.map(c=>c.code).join(",")}`:null;
  const candles=useDecision<StockCandles>(candleUrl);
  const candleData=candles.data?.date===date&&candles.data.mode===mode?candles.data:null;
  return <Panel title="交易候选池" extra={<span className="muted">{mode==="live"?"盘中快照 · 分钟条件需点开核对":"收盘观察 · 不回填盘中"}</span>} className="funnel-browser">
    {busy?<p className="history-small-empty" role="status">正在交叉核对市场、行业、题材和候选股…</p>:error?<p className="history-small-empty" role="alert">{error}<button className="text-link" onClick={retry}>重试</button></p>:data&&<>
      <div className="funnel-summary"><span><b>{data.verifiedThemes}/{data.screenedThemes}</b><small>题材成分已核对</small></span><span><b>{data.industryCount}</b><small>行业初筛或候选</small></span><span><b>{data.candidateCount}</b><small>交易观察候选</small></span><span><b>{data.focusCount}</b><small>重点观察</small></span></div>
      <div className="funnel-context"><b>{data.market.stance}</b><span>{data.market.focus}</span><small>题材、行业和个股角色均为规则候选；机会分不是胜率，也不是买入指令。</small></div>
      <FunnelMinuteMonitor candidates={candidates} date={date} mode={mode}/>
      <div className="board-filter-tabs funnel-filters">{filters.map(f=><button key={f} className={filter===f?"active":""} aria-pressed={filter===f} onClick={()=>setFilter(f)}>{f}<span>{f==="全部"?candidates.length:candidates.filter(c=>c.status===f).length}</span></button>)}</div>
      {visible.length?<div className="funnel-table-wrap"><table className="history-table funnel-table"><thead><tr><th>股票 / 近20日日K</th><th>题材 × 行业</th><th>角色</th><th>地位</th><th>机会预评</th><th>风险</th><th>当前判断</th><th>详情</th></tr></thead><tbody>{visible.map(c=>{const points=candleData?.byCode[c.code];return <Fragment key={c.code}><tr className={expandedCode===c.code?"selected":""}><td><div className="funnel-stock-cell"><button className="member-name" aria-expanded={expandedCode===c.code} onClick={()=>onSelect(c)}><b>{c.name}</b><small>{c.code} · {c.height?`${c.height}板`:`${c.pct>=0?"+":""}${c.pct.toFixed(2)}%`}</small></button>{points?.length?<button type="button" className="funnel-candle-trigger" onClick={()=>setChartStock(c)} aria-label={`查看${c.name}近60个交易日日K`} aria-haspopup="dialog"><CandleChart dates={candleData!.dates} points={points} mini/></button>:<span className="funnel-candle-placeholder">{candles.error?"K线不可用":candles.busy?"K线读取中…":"暂无K线"}</span>}</div></td><td><b>{c.theme?.name??"题材待核"}</b><small>{c.theme?.phase??"—"} × {c.industry} · {c.industryPhase}</small></td><td>{c.role}</td><td>{show(c.positionScore)}</td><td>{show(c.opportunityScore)}</td><td><span className="amber-text">{c.risk.level}</span><small>{c.risk.flags[0]??"未触发预设风险"}</small></td><td><span className={`funnel-status ${c.status==="重点观察"?"focus":""}`}>{c.status}</span><small>{c.action}</small></td><td><button className="text-link" aria-expanded={expandedCode===c.code} onClick={()=>onSelect(c)}>{expandedCode===c.code?"收起":"展开"}</button></td></tr>{expandedCode===c.code&&<tr className="selection-expanded-row"><td colSpan={8}>{renderDetails(c)}</td></tr>}</Fragment>;})}</tbody></table>{candles.error&&<p className="history-small-empty">候选股K线暂不可用：{candles.error} <button type="button" className="text-link" onClick={candles.retry}>重试K线</button></p>}</div>:<p className="history-small-empty">当前筛选下没有候选；不会为凑数量降低条件。</p>}
      {mode==="close"&&<FunnelValidationPanel date={date}/>}
      <Dialog open={chartStock!==null} onOpenChange={open=>{if(!open)setChartStock(null);}}><DialogContent className="dialog-body funnel-candle-dialog"><DialogHeader><DialogTitle>{chartStock?.name} · 图表</DialogTitle><DialogDescription>分时与日K使用与个股详情一致的行情口径；日K只展示已完成的交易日。</DialogDescription></DialogHeader>{chartStock&&<StockChartTabs key={`${chartStock.code}:${date}`} stock={{code:chartStock.code,name:chartStock.name}} date={date} marketMode={mode} themeCode={chartStock.theme?.code} showZoom={false}/>}</DialogContent></Dialog>
      <details className="history-details"><summary>候选池口径与局限</summary>{data.warnings.map(w=><p key={w}>{w}</p>)}<p>地位分结合行业核心度与题材内的量价排序候选；机会预评结合市场、题材、行业与当日价格风险。只输出观察优先级，盘中买点需打开个股分钟图核对。</p></details>
    </>}
  </Panel>;
}

export function CandidateExplanation({candidate}:{candidate:FunnelCandidate}){
  return <div className="funnel-explain"><div><b>为什么列入观察</b><span>{candidate.theme?`${candidate.theme.name} / ${candidate.theme.role}`:"本轮题材未匹配"} · {candidate.industry} / {candidate.industryLabel} · 题材基准 {candidate.basisDate}</span></div><p><b>入池路径：</b>{candidate.inclusionPaths.join("；")||"规则路径待核验"}</p><div className="funnel-explain-grid"><section><small>已有依据</small>{candidate.reasons.map(r=><p key={r}>{r}</p>)}</section><section><small>尚未满足 / 待核对</small>{candidate.missing.map(r=><p key={r}>{r}</p>)}</section><section><small>下一步观察条件</small>{candidate.triggers.map(r=><p key={r}>{r}</p>)}</section></div><p className="amber-text"><b>交易风险：</b>{candidate.risk.flags.join("；")||"未触发预设风险"} · 截至 {candidate.risk.asOf}</p><small>日线报价表明所选日有交易；盘中临停、盘口挂单和实际成交未由本项验证。</small>{candidate.themeMatches.length>1&&<small>同时匹配已核对题材：{candidate.themeMatches.join("、")}</small>}</div>;
}
