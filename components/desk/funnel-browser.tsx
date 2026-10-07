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
import {WatchlistToggle} from "./watchlist-toggle";
import {LimitUpTag,type LimitUpStatus} from "./limit-up-tag";
import {StockChartPreview,type StockCandleBatch} from "./stock-chart-preview";
import {useDesk} from "./provider";

const filters=["全部","重点观察","条件观察","证据不足"] as const;
const show=(n:number|null)=>n===null?"—":String(n);
type StockCandles={date:string;mode:"close"|"live";asOf:string;dates:string[];byCode:Record<string,Candle[]>};
export type PersonalSelection={code:string;name:string;kind:string};
type LimitUpFilter="all"|"listed"|"unlisted";
export function FunnelBrowser({date,mode,expandedCode,expandedSource,onSelect,onSelectPersonal,onLookup,renderDetails,renderPersonalDetails,limitUp,personal,personalCandles}:{date:string;mode:"close"|"live";expandedCode:string|null;expandedSource:"candidate"|"personal"|"external";onSelect:(candidate:FunnelCandidate)=>void;onSelectPersonal:(stock:PersonalSelection)=>void;onLookup:(stock:PersonalSelection)=>void;renderDetails:(candidate:FunnelCandidate)=>ReactNode;renderPersonalDetails:(stock:PersonalSelection)=>ReactNode;limitUp:LimitUpStatus;personal:PersonalSelection[];personalCandles:StockCandleBatch|null}){
  const {ledger,loading:ledgerLoading,busy:ledgerBusy,save}=useDesk();
  const {data,error,busy,retry}=useDecision<FunnelOverview>(`/api/market/decision?view=funnel&date=${date}&mode=${mode}`,mode==="live");
  useEffect(()=>{if(!data||mode!=="close")return;const controller=new AbortController();void fetch(`/api/market/decision?view=basis&date=${date}&mode=close`,{signal:controller.signal,cache:"no-store"}).catch(()=>undefined);return()=>controller.abort();},[data,date,mode]);
  const [filter,setFilter]=useState<(typeof filters)[number]>("全部");
  const [personalOnly,setPersonalOnly]=useState(false);
  const [limitFilter,setLimitFilter]=useState<LimitUpFilter>("all");
  const [query,setQuery]=useState("");
  const [lookupBusy,setLookupBusy]=useState(false);
  const [lookupMessage,setLookupMessage]=useState("");
  const [chartStock,setChartStock]=useState<FunnelCandidate|null>(null);
  const candidates=data?.candidates??[];
  const candidateCodes=new Set(candidates.map(c=>c.code));
  const personalCodes=new Set(personal.map(p=>p.code));
  const personalOnlyRows=personal.filter(p=>!candidateCodes.has(p.code));
  const datedLimit=limitUp.data?.date===date?limitUp.data:null;
  const limitReady=mode==="close"&&!!datedLimit;
  const candidateVisible=(personalOnly?candidates.filter(c=>personalCodes.has(c.code)):candidates.filter(c=>filter==="全部"||c.status===filter))
    .filter(c=>limitFilter==="all"||limitReady&&(limitFilter==="listed"?!!datedLimit?.byCode[c.code]:!datedLimit?.byCode[c.code]));
  const personalVisible=(personalOnly||filter==="全部"?personalOnlyRows:[])
    .filter(p=>limitFilter==="all"||limitReady&&(limitFilter==="listed"?!!datedLimit?.byCode[p.code]:!datedLimit?.byCode[p.code]));
  const visibleCount=candidateVisible.length+personalVisible.length;
  const candleUrl=candidates.length?`/api/market/stock-candles?date=${date}&mode=${mode}&codes=${candidates.map(c=>c.code).join(",")}`:null;
  const candles=useDecision<StockCandles>(candleUrl);
  const candleData=candles.data?.date===date&&candles.data.mode===mode?candles.data:null;
  async function submitCode(action:"watch"|"view"){
    if(lookupBusy||action==="watch"&&(ledgerLoading||ledgerBusy))return;
    setLookupMessage("");
    const input=query.trim().toUpperCase();
    if(!/^\d{6}(?:\.(?:SH|SZ|BJ))?$/.test(input)){setLookupMessage("请输入六位股票代码，可附加 .SH、.SZ 或 .BJ");return;}
    setLookupBusy(true);
    try{
      const response=await fetch(`/api/market/stock-lookup?code=${encodeURIComponent(input)}`,{cache:"no-store"});
      const result=await response.json() as {code?:string;name?:string;error?:string};
      if(!response.ok||!result.code||!result.name)throw new Error(result.error??"股票代码查询失败");
      const stock={code:result.code,name:result.name,kind:"自选"};
      if(action==="view"){onLookup(stock);return;}
      if(ledger.watchlist.some(item=>item.code===stock.code)){
        setPersonalOnly(true);setLookupMessage(`${stock.name}已在自选中`);return;
      }
      if(await save("watch",{code:stock.code,name:stock.name})){
        setPersonalOnly(true);setLimitFilter("all");setQuery("");setLookupMessage(`已加入自选：${stock.name}（${stock.code}）`);
      }
    }catch(error){setLookupMessage(error instanceof Error?error.message:"股票代码查询失败，请稍后重试");}
    finally{setLookupBusy(false);}
  }
  return <Panel title="选股列表" extra={<span className="muted">{mode==="live"?"盘中快照 · 涨停榜待收盘核对":"收盘观察 · 按所选日期核对收盘涨停"}</span>} className="funnel-browser">
    {busy&&<p className="history-small-empty" role="status">正在交叉核对市场、行业、题材和候选股…</p>}
    {error&&<p className="history-small-empty" role="alert">候选池暂不可用：{error}<button className="text-link" onClick={retry}>重试</button></p>}
    {data&&<FunnelMinuteMonitor candidates={candidates} date={date} mode={mode}/>}
    <div className="board-filter-tabs funnel-filters">
      {filters.map(f=><button key={f} className={!personalOnly&&filter===f?"active":""} aria-pressed={!personalOnly&&filter===f} onClick={()=>{setFilter(f);setPersonalOnly(false);}}>{f}<span>{f==="全部"?candidates.length+personalOnlyRows.length:candidates.filter(c=>c.status===f).length}</span></button>)}
      <button className={personalOnly?"active":""} aria-pressed={personalOnly} onClick={()=>setPersonalOnly(true)}>自选 / 持仓<span>{personal.length}</span></button>
      {data&&<span className="funnel-market-note"><b>{data.market.stance}</b><span>{data.market.focus}</span></span>}
    </div>
    <div className="funnel-secondary-filters">
      <label>涨停榜 <select aria-label="涨停榜筛选" value={limitFilter} onChange={e=>setLimitFilter(e.target.value as LimitUpFilter)}><option value="all">全部</option><option value="listed">当日涨停</option><option value="unlisted">当日未涨停</option></select></label>
      <form onSubmit={e=>{e.preventDefault();void submitCode("watch");}}><input aria-label="输入股票代码" placeholder="代码，如 600519" maxLength={9} required value={query} onChange={e=>{setQuery(e.target.value.toUpperCase());setLookupMessage("");}}/><button className="button primary" type="submit" disabled={lookupBusy||ledgerLoading||ledgerBusy}>{lookupBusy?"查询中…":"加入自选"}</button><button className="button" type="button" disabled={lookupBusy} onClick={()=>{void submitCode("view");}}>查看股票</button></form>
    </div>
    {lookupMessage&&<p className="funnel-lookup-message" role="status">{lookupMessage}</p>}
    {limitFilter!=="all"&&!limitReady&&<p className="history-small-empty" role="status">{mode==="live"?"盘中尚无收盘涨停名单，收盘后选择历史复盘再筛选。":limitUp.busy?"正在核对所选日期的收盘涨停名单…":<>涨停榜名单待核验，暂不显示筛选结果。<button type="button" className="text-link" onClick={limitUp.retry}>重试</button></>}</p>}
    {visibleCount>0?<div className="funnel-table-wrap"><table className="history-table funnel-table"><thead><tr><th>股票 / 近20日日K</th><th>选股策略</th><th>题材 × 行业</th><th>角色</th><th>地位</th><th>机会预评</th><th>风险</th><th>当前判断</th><th>涨停榜</th><th>自选</th><th>详情</th></tr></thead><tbody>
      {candidateVisible.map(c=>{const points=candleData?.byCode[c.code],expanded=expandedCode===c.code&&expandedSource==="candidate";return <Fragment key={c.code}><tr className={expanded?"selected":""}><td><div className="funnel-stock-cell"><button className="member-name" aria-expanded={expanded} onClick={()=>onSelect(c)}><b>{c.name}</b><small>{c.code} · {c.height?`${c.height}板`:`${c.pct>=0?"+":""}${c.pct.toFixed(2)}%`}</small></button>{points?.length?<button type="button" className="funnel-candle-trigger" onClick={()=>setChartStock(c)} aria-label={`查看${c.name}近60个交易日日K`} aria-haspopup="dialog"><CandleChart dates={candleData!.dates} points={points} mini/></button>:<span className="funnel-candle-placeholder">{candles.error?"K线不可用":candles.busy?"K线读取中…":"暂无K线"}</span>}</div></td><td>{c.selectionStrategy}</td><td><b>{c.theme?.name??"题材待核"}</b><small>{c.theme?.phase??"—"} × {c.industry} · {c.industryPhase}</small></td><td>{c.role}</td><td>{show(c.positionScore)}</td><td>{show(c.opportunityScore)}</td><td><span className="amber-text">{c.risk.level}</span><small>{c.risk.flags[0]??"未触发预设风险"}</small></td><td><span className={`funnel-status ${c.status==="重点观察"?"focus":""}`}>{c.status}</span><small>{c.action}</small></td><td><LimitUpTag code={c.code} date={date} mode={mode} status={limitUp}/></td><td><WatchlistToggle code={c.code} name={c.name}/></td><td><button className="text-link" aria-expanded={expanded} onClick={()=>onSelect(c)}>{expanded?"收起":"展开"}</button></td></tr>{expanded&&<tr className="selection-expanded-row"><td colSpan={11}>{renderDetails(c)}</td></tr>}</Fragment>;})}
      {personalVisible.map(p=>{const expanded=expandedCode===p.code&&expandedSource==="personal",index=personal.findIndex(item=>item.code===p.code);return <Fragment key={p.code}><tr className={expanded?"selected":""}><td><div className="funnel-stock-cell"><button className="member-name" aria-expanded={expanded} onClick={()=>onSelectPersonal(p)}><b>{p.name}</b><small>{p.code}</small></button><StockChartPreview stock={p} date={date} mode={mode} batch={personalCandles} fetchSingle={index>=40}/></div></td><td>个人自选／持仓</td><td>—</td><td>{p.kind}</td><td>—</td><td>—</td><td>—</td><td><span className="funnel-status">个人关注</span></td><td><LimitUpTag code={p.code} date={date} mode={mode} status={limitUp}/></td><td><WatchlistToggle code={p.code} name={p.name}/></td><td><button className="text-link" aria-expanded={expanded} onClick={()=>onSelectPersonal(p)}>{expanded?"收起":"展开"}</button></td></tr>{expanded&&<tr className="selection-expanded-row"><td colSpan={11}>{renderPersonalDetails(p)}</td></tr>}</Fragment>;})}
    </tbody></table>{candles.error&&<p className="history-small-empty">候选股K线暂不可用：{candles.error} <button type="button" className="text-link" onClick={candles.retry}>重试K线</button></p>}</div>:limitFilter==="all"||limitReady?<p className="history-small-empty">当前筛选下没有股票。</p>:null}
    {mode==="close"&&data&&<FunnelValidationPanel date={date}/>}
    <Dialog open={chartStock!==null} onOpenChange={open=>{if(!open)setChartStock(null);}}><DialogContent className="dialog-body funnel-candle-dialog"><DialogHeader><DialogTitle>{chartStock?.name} · 图表</DialogTitle><DialogDescription>分时与日K使用与个股详情一致的行情口径；日K只展示已完成的交易日。</DialogDescription></DialogHeader>{chartStock&&<StockChartTabs key={`${chartStock.code}:${date}`} stock={{code:chartStock.code,name:chartStock.name}} date={date} marketMode={mode} themeCode={chartStock.theme?.code} showZoom={false}/>}</DialogContent></Dialog>
    {data&&<details className="history-details"><summary>候选池口径与局限</summary>{data.warnings.map(w=><p key={w}>{w}</p>)}<p>地位分结合行业核心度与题材内的量价排序候选；机会预评结合市场、题材、行业与当日价格风险。只输出观察优先级，盘中买点需打开个股分钟图核对。</p></details>}
  </Panel>;
}

export function CandidateExplanation({candidate}:{candidate:FunnelCandidate}){
  return <div className="funnel-explain"><div><span>{candidate.theme?`${candidate.theme.name} / ${candidate.theme.role}`:"本轮题材未匹配"} · {candidate.industry} / {candidate.industryLabel} · 题材基准 {candidate.basisDate}</span></div><p><b>选股策略：</b>{candidate.selectionStrategy}</p><p><b>入池路径：</b>{candidate.inclusionPaths.join("；")||"规则路径待核验"}</p><div className="funnel-explain-grid"><section><small>已有依据</small>{candidate.reasons.map(r=><p key={r}>{r}</p>)}</section><section><small>尚未满足 / 待核对</small>{candidate.missing.map(r=><p key={r}>{r}</p>)}</section><section><small>下一步观察条件</small>{candidate.triggers.map(r=><p key={r}>{r}</p>)}</section></div><p className="amber-text"><b>交易风险：</b>{candidate.risk.flags.join("；")||"未触发预设风险"} · 截至 {candidate.risk.asOf}</p><small>日线报价表明所选日有交易；盘中临停、盘口挂单和实际成交未由本项验证。</small>{candidate.themeMatches.length>1&&<small>同时匹配已核对题材：{candidate.themeMatches.join("、")}</small>}</div>;
}
