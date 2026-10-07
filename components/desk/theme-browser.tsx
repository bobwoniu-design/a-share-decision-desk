"use client";
import { useEffect, useRef, useState } from "react";
import { Factors, PhaseTag } from "./decision";
import type { SectorMember } from "@/lib/sectors";
import type { ThemeDetail } from "@/lib/theme-data";
import type { ScoredTheme, ThemeOverview } from "@/lib/themes";

const filters=["全部","主线初筛","待梯队核验","主线候选","轮动","退潮","待数据","交易表现"] as const;
type Filter=(typeof filters)[number];
const number=(v:number|null,d=0)=>v===null?"—":v.toFixed(d);
const signed=(v:number|null,d=0)=>v===null?"—":`${v>=0?"+":""}${v.toFixed(d)}`;
const percent=(v:number|null,d=2)=>v===null?"—":`${signed(v,d)}%`;
export function ThemeBrowser({date,mode,onSelect}:{date:string;mode:"close"|"live";onSelect:(stock:SectorMember,themeCode:string)=>void}){
  const [overview,setOverview]=useState<ThemeOverview|null>(null),[error,setError]=useState(""),[loading,setLoading]=useState(true),[retry,setRetry]=useState(0);
  const [filter,setFilter]=useState<Filter>("全部"),[query,setQuery]=useState(""),[shown,setShown]=useState(60),[selected,setSelected]=useState(""),[detailOpen,setDetailOpen]=useState(false);
  const [detail,setDetail]=useState<ThemeDetail|null>(null),[detailError,setDetailError]=useState(""),[detailLoading,setDetailLoading]=useState(false),[detailRetry,setDetailRetry]=useState(0),[memberQuery,setMemberQuery]=useState(""),[memberFilter,setMemberFilter]=useState("all"),[page,setPage]=useState(0);
  const detailRef=useRef<HTMLDivElement>(null),fullRef=useRef<HTMLDivElement>(null);
  useEffect(()=>{const c=new AbortController();setOverview(null);setError("");setLoading(true);setSelected("");setFilter("全部");setQuery("");setShown(60);
    fetch(`/api/market/themes?date=${date}&mode=${mode}`,{signal:c.signal,cache:"no-store"}).then(async r=>{const d=await r.json() as ThemeOverview&{error?:string};if(!r.ok)throw new Error(d.error||"题材读取失败");return d;}).then(d=>{if(!c.signal.aborted)setOverview(d);}).catch(e=>{if(!c.signal.aborted)setError(e instanceof Error?e.message:"题材读取失败");}).finally(()=>{if(!c.signal.aborted)setLoading(false);});return()=>c.abort();
  },[date,mode,retry]);
  useEffect(()=>{if(!selected||!detailOpen)return;const c=new AbortController();setDetail(null);setDetailError("");setDetailLoading(true);setMemberQuery("");setMemberFilter("all");setPage(0);
    fetch(`/api/market/themes?view=detail&date=${date}&mode=${mode}&code=${selected}`,{signal:c.signal,cache:"no-store"}).then(async r=>{const d=await r.json() as ThemeDetail&{error?:string};if(!r.ok)throw new Error(d.error||"题材成员读取失败");return d;}).then(d=>{if(!c.signal.aborted)setDetail(d);}).catch(e=>{if(!c.signal.aborted)setDetailError(e instanceof Error?e.message:"题材成员读取失败");}).finally(()=>{if(!c.signal.aborted)setDetailLoading(false);});return()=>c.abort();
  },[selected,detailOpen,date,mode,detailRetry]);
  useEffect(()=>{if(selected)detailRef.current?.scrollIntoView({behavior:"smooth",block:"start"});},[selected]);
  useEffect(()=>{if(detailOpen)fullRef.current?.scrollIntoView({behavior:"smooth",block:"start"});},[detailOpen]);
  const themes=overview?.themes??[],visible=themes.filter(t=>(filter==="全部"||t.label===filter)&&(!query||`${t.name}${t.code}`.toLowerCase().includes(query.trim().toLowerCase())));
  const selectedTheme=themes.find(t=>t.code===selected);
  const shownThemes=visible.slice(0,shown);
  const cardRows=Array.from({length:Math.ceil(shownThemes.length/3)},(_,i)=>shownThemes.slice(i*3,i*3+3));
  const rows=(detail?.group.members??[]).filter(m=>(!memberQuery||`${m.name}${m.code}`.toLowerCase().includes(memberQuery.trim().toLowerCase()))&&(memberFilter==="all"||memberFilter==="up"&&m.limit==="U"||memberFilter==="down"&&m.quote!==null&&m.quote.pct<0||memberFilter==="missing"&&!m.quote));
  const pageIndex=Math.min(page,Math.max(0,Math.ceil(rows.length/30)-1));
  const choose=(theme:ScoredTheme)=>{setDetail(null);setDetailError("");setDetailOpen(false);setSelected(current=>current===theme.code?"":theme.code);setShown(Math.max(shown,visible.findIndex(t=>t.code===theme.code)+1));};
  const openDetail=(theme:ScoredTheme)=>{setSelected(theme.code);setDetail(null);setDetailError("");setDetailLoading(true);setDetailOpen(true);};
  return <section className="panel theme-browser">
    {loading?<p className="history-small-empty" role="status">正在读取近7个交易日的概念快照并计算初筛…</p>:error?<div className="history-small-empty" role="alert">{error}<button className="text-link" onClick={()=>setRetry(v=>v+1)}>重试</button></div>:overview&&<>
      <div className="board-toolbar"><div className="board-filter-tabs" aria-label="按题材定位筛选">{filters.map(label=><button key={label} className={filter===label?"active":""} aria-pressed={filter===label} onClick={()=>{setFilter(label);setShown(60);setSelected("");}}>{label}<span>{label==="全部"?themes.length:themes.filter(t=>t.label===label).length}</span></button>)}</div><input aria-label="搜索题材" placeholder="搜索题材名称 / 代码" value={query} onChange={e=>{setQuery(e.target.value);setShown(60);setSelected("");}}/></div>
      <div className="board-results">显示 {Math.min(shown,visible.length)} / {visible.length} 个概念 · 强度分与主线资格分别计算；点击查看逐项依据</div>
      <div className="board-rows">{cardRows.map(row=><div key={row[0].code} className="board-row">
        <div className="board-row-cards">{row.map(t=><button key={t.code} className={`board-card ${selected===t.code?"selected":""}`} aria-pressed={selected===t.code} onClick={()=>choose(t)}><span className="board-card-top"><b>{t.name}</b><em className={`board-label board-label-${t.label==="退潮"?"risk":t.label==="主线初筛"?"main":t.label==="主线候选"?"candidate":"neutral"}`}>{t.label}</em></span><span className="board-card-score"><strong>{number(t.score)}</strong><small className={(t.delta??0)<0?"down":"up"}>{t.delta===null?"较前日 —":`${t.delta>=0?"↑ ":"↓ "}${signed(t.delta)}`}</small></span><span className="board-card-meta"><span className={(t.pct??0)<0?"down":"up"}>{percent(t.pct)}</span><span>强势 {t.topDays}/5</span><span>{t.phase}</span></span></button>)}</div>
        {row.some(t=>t.code===selected)&&<>
          <div ref={detailRef} className="board-row-details">{row.map(t=><div key={t.code} className={`board-row-detail ${selected===t.code?"active":""}`}>
            <div className="board-row-detail-head"><b>{t.name}</b><span>{t.label}</span></div>
            <div className="board-row-detail-score"><strong>{number(t.score)}<small>/100</small></strong><PhaseTag phase={t.phase}/></div>
            <div className="board-row-detail-metrics"><span>当日 <b className={(t.pct??0)<0?"down":"up"}>{percent(t.pct)}</b></span><span>近5日 <b className={(t.return5??0)<0?"down":"up"}>{percent(t.return5)}</b></span><span>上涨 {t.up??"—"} / 下跌 {t.down??"—"}</span></div>
            <p>主线资格：<b>{t.qualification.status}</b></p>
            <p className="board-row-detail-note">{t.qualification.checks.find(c=>c.result!=="通过")?.detail??"已通过当前可验证条件，仍需人工判断催化与龙头地位。"}</p>
            <button className="text-link" onClick={()=>openDetail(t)}>查看完整依据与成员 →</button>
          </div>)}</div>
      {detailOpen&&selectedTheme&&<div ref={fullRef} className="board-detail theme-detail"><div className="board-detail-heading"><div><small>{selectedTheme.code} · {overview.asOfDate} · {selectedTheme.label}</small><h3>{selectedTheme.name} <PhaseTag phase={selectedTheme.phase}/></h3></div><button className="text-link" onClick={()=>setDetailOpen(false)}>收起完整详情</button></div>
        <div className="theme-score-summary"><strong>{number(selectedTheme.score)}<small>/100 强度</small></strong><span>较前日 {signed(selectedTheme.delta)} · 当日 {percent(selectedTheme.pct)} · 近5日 {percent(selectedTheme.return5)}</span><span>内部上涨 {selectedTheme.up??"—"} / 下跌 {selectedTheme.down??"—"} · 换手 {selectedTheme.turnover===null?"—":`${number(selectedTheme.turnover,2)}%`}</span></div>
        <div className="theme-qualification"><b>主线资格：{selectedTheme.qualification.status}</b><span>{selectedTheme.label} · 需逐项核对，不由强度分直接决定</span><div>{selectedTheme.qualification.checks.map(c=><p key={c.name}><strong className={c.result==="通过"?"up":c.result==="未通过"?"down":"muted"}>{c.result}</strong><b>{c.name}</b><span>{c.detail}</span></p>)}</div></div>
        <details className="engine-method"><summary>强度评分依据与近7日变化</summary><Factors factors={selectedTheme.factors}/><div className="market-cycle-history">{selectedTheme.history.map(p=><span key={p.date}><small>{p.date.slice(5)}</small><b>{percent(p.pct,1)}</b><span>{p.phase}</span></span>)}</div><p>主线初筛仍未核实催化、真实龙头地位和盘中状态，不能直接作为交易候选。阶段依据收盘规则分变化，非盘中分钟状态。</p></details>
        {detailLoading?<p className="history-small-empty" role="status">正在读取该日历史成分与成员行情…</p>:detailError?<p className="history-small-empty" role="alert">{detailError}<button className="text-link" onClick={()=>setDetailRetry(v=>v+1)}>重试成员</button></p>:detail&&<>
          <div className="theme-member-summary"><div><b>{detail.memberCount}</b><small>历史成分</small></div><div><b>{detail.group.traded}/{detail.group.total}</b><small>有行情</small></div><div><b>{detail.group.limitUp??"—"}</b><small>涨停</small></div><div><b>{detail.group.amountYi.toFixed(1)} 亿</b><small>成分成交额 · 含重叠</small></div><div><b>{detail.memberChange?`+${detail.memberChange.added} / -${detail.memberChange.removed}`:"—"}</b><small>较前日成分变化</small></div></div>
          {detail.leaderFromSource.name&&<p className="theme-leading-note">东财领涨股：{detail.leaderFromSource.name}（{detail.leaderFromSource.code}）；此字段不等同于龙头地位。</p>}
          <div className="sector-leaders">{detail.group.members.filter(m=>m.leaderRank!==null).map(m=><button key={m.code} onClick={()=>onSelect(m,detail.code)}><small>{["龙头候选","龙二候选","龙三候选"][m.leaderRank!-1]}</small><b>{m.name}</b><span className={(m.quote?.pct??0)<0?"down":"up"}>{percent(m.quote?.pct??null)} {m.height?`· ${m.height}板`:""}</span></button>)}{!detail.group.members.some(m=>m.leaderRank!==null)&&<p className="muted">梯队候选暂无足够数据</p>}</div>
          <div className="sector-filters"><input aria-label="搜索题材成员" placeholder="搜索成员名称 / 代码" value={memberQuery} onChange={e=>{setMemberQuery(e.target.value);setPage(0);}}/></div>
          <div className="sector-filter-tabs">{[["all","全部成员"],["up","涨停"],["down","下跌"],["missing","无行情"]].map(([v,label])=><button key={v} className={memberFilter===v?"active":""} aria-pressed={memberFilter===v} onClick={()=>{setMemberFilter(v);setPage(0);}}>{label}</button>)}</div>
          <div className="sector-members"><table className="history-table"><thead><tr><th>成员 / 候选梯队</th><th>涨跌幅</th><th>封板</th><th>成交额/亿</th></tr></thead><tbody>{rows.slice(pageIndex*30,pageIndex*30+30).map(m=><tr key={m.code}><td><button className="member-name" onClick={()=>onSelect(m,detail.code)}><b>{m.name}</b><small>{m.code}{m.leaderRank?` · 梯队${m.leaderRank}`:""}</small></button></td><td className={(m.quote?.pct??0)<0?"down":"up"}>{m.quote?`${signed(m.quote.pct,2)}%`:"—"}</td><td>{!m.quote?"无行情":m.limit===null?"待数据":m.limit==="U"?`${m.height}板`:m.limit==="D"?"跌停":m.limit==="Z"?"炸板":"—"}</td><td>{m.quote?(m.quote.amount/1e8).toFixed(2):"—"}</td></tr>)}</tbody></table>{!rows.length&&<p className="history-small-empty">没有符合筛选条件的成员。</p>}</div>
          <div className="sector-pagination"><span>{rows.length} 只 · 第 {pageIndex+1}/{Math.max(1,Math.ceil(rows.length/30))} 页</span><button disabled={pageIndex===0} onClick={()=>setPage(pageIndex-1)}>上一页</button><button disabled={(pageIndex+1)*30>=rows.length} onClick={()=>setPage(pageIndex+1)}>下一页</button></div>
          <details className="history-details"><summary>成员来源、覆盖与限制</summary>{detail.warnings.map(w=><p key={w}>{w}</p>)}<p>成分来自 Tushare dc_member 的 {detail.asOfDate} 快照；同一股票可属于多个题材，题材之间的成交额不能直接相加。</p></details>
        </>}
      </div>}
        </>}
      </div>)}</div>
      {!visible.length&&<p className="history-small-empty">当前筛选下没有题材。</p>}
      {shown<visible.length&&<div className="theme-more"><button className="button" onClick={()=>setShown(v=>v+60)}>再显示 60 个</button></div>}
      <details className="history-details"><summary>题材初筛口径与数据限制</summary>{overview.warnings.map(w=><p key={w}>{w}</p>)}<p>数据来自 Tushare dc_index；符合日线资格的概念会再用 dc_member 核对历史成分和涨停梯队，其余概念在展开详情时读取成员。强度分尚未验证交易收益。</p></details>
    </>}
  </section>;
}
