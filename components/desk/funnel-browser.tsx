"use client";
import {useEffect,useState} from "react";
import {Panel} from "./workspace";
import {useDecision} from "./decision";
import type {FunnelCandidate,FunnelOverview} from "@/lib/funnel";

const filters=["全部","重点观察","条件观察","证据不足"] as const;
const show=(n:number|null)=>n===null?"—":String(n);
export function FunnelBrowser({date,mode,selectedCode,onSelect}:{date:string;mode:"close"|"live";selectedCode:string;onSelect:(candidate:FunnelCandidate)=>void}){
  const {data,error,busy,retry}=useDecision<FunnelOverview>(`/api/market/decision?view=funnel&date=${date}&mode=${mode}`,mode==="live");
  useEffect(()=>{if(!data||mode!=="close")return;const controller=new AbortController();void fetch(`/api/market/decision?view=basis&date=${date}&mode=close`,{signal:controller.signal,cache:"no-store"}).catch(()=>undefined);return()=>controller.abort();},[data,date,mode]);
  const [filter,setFilter]=useState<(typeof filters)[number]>("全部");
  const candidates=data?.candidates??[],visible=candidates.filter(c=>filter==="全部"||c.status===filter);
  return <Panel title="交易候选池" extra={<span className="muted">{mode==="live"?"盘中快照 · 分钟条件需点开核对":"收盘观察 · 不回填盘中"}</span>} className="funnel-browser">
    {busy?<p className="history-small-empty" role="status">正在交叉核对市场、行业、题材和候选股…</p>:error?<p className="history-small-empty" role="alert">{error}<button className="text-link" onClick={retry}>重试</button></p>:data&&<>
      <div className="funnel-summary"><span><b>{data.verifiedThemes}/{data.screenedThemes}</b><small>题材成分已核对</small></span><span><b>{data.industryCount}</b><small>行业初筛或候选</small></span><span><b>{data.candidateCount}</b><small>交易观察候选</small></span><span><b>{data.focusCount}</b><small>重点观察</small></span></div>
      <div className="funnel-context"><b>{data.market.stance}</b><span>{data.market.focus}</span><small>题材、行业和个股角色均为规则候选；机会分不是胜率，也不是买入指令。</small></div>
      <div className="board-filter-tabs funnel-filters">{filters.map(f=><button key={f} className={filter===f?"active":""} aria-pressed={filter===f} onClick={()=>setFilter(f)}>{f}<span>{f==="全部"?candidates.length:candidates.filter(c=>c.status===f).length}</span></button>)}</div>
      {visible.length?<div className="funnel-table-wrap"><table className="history-table funnel-table"><thead><tr><th>股票 / 模式</th><th>题材 × 行业</th><th>角色</th><th>地位</th><th>机会预评</th><th>当前判断</th></tr></thead><tbody>{visible.map(c=><tr key={c.code} className={selectedCode===c.code?"selected":""}><td><button className="member-name" onClick={()=>onSelect(c)}><b>{c.name}</b><small>{c.code} · {c.height?`${c.height}板`:`${c.pct>=0?"+":""}${c.pct.toFixed(2)}%`}</small></button></td><td><b>{c.theme?.name??"题材待核"}</b><small>{c.theme?.phase??"—"} × {c.industry} · {c.industryPhase}</small></td><td>{c.role}</td><td>{show(c.positionScore)}</td><td>{show(c.opportunityScore)}</td><td><span className={`funnel-status ${c.status==="重点观察"?"focus":""}`}>{c.status}</span><small>{c.action}</small></td></tr>)}</tbody></table></div>:<p className="history-small-empty">当前筛选下没有候选；不会为凑数量降低条件。</p>}
      <details className="history-details"><summary>候选池口径与局限</summary>{data.warnings.map(w=><p key={w}>{w}</p>)}<p>地位分结合行业核心度与题材内的量价排序候选；机会预评结合市场、题材、行业与当日价格风险。只输出观察优先级，盘中买点需打开个股分钟图核对。</p></details>
    </>}
  </Panel>;
}

export function CandidateExplanation({candidate}:{candidate:FunnelCandidate}){
  return <div className="funnel-explain"><div><b>{candidate.name} · 为什么列入观察</b><span>{candidate.theme?`${candidate.theme.name} / ${candidate.theme.role}`:"题材归属待补充"} · {candidate.industry} / {candidate.industryLabel}</span></div><div className="funnel-explain-grid"><section><small>已有依据</small>{candidate.reasons.map(r=><p key={r}>{r}</p>)}</section><section><small>尚未满足 / 待核对</small>{candidate.missing.map(r=><p key={r}>{r}</p>)}</section><section><small>下一步观察条件</small>{candidate.triggers.map(r=><p key={r}>{r}</p>)}</section></div>{candidate.themeMatches.length>1&&<small>同时匹配已核对题材：{candidate.themeMatches.join("、")}</small>}</div>;
}
