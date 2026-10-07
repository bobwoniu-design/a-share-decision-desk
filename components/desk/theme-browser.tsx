"use client";
import { useCallback, useEffect, useState } from "react";
import { memberRoles } from "@/lib/member-roles";
import { BlockChartPreview } from "./block-chart-preview";
import { QualificationScoreCards } from "./qualification-score-cards";
import type { SectorMember } from "@/lib/sectors";
import type { ThemeDetail } from "@/lib/theme-data";
import type { ScoredTheme, ThemeOverview } from "@/lib/themes";

const filters=["全部","主线初筛","待梯队核验","主线候选","轮动","退潮","待数据","交易表现"] as const;
type Filter=(typeof filters)[number];
type ThemeMemberSummary={traded:number;total:number;limitUp:number|null;amountYi:number};
const number=(v:number|null,d=0)=>v===null?"—":v.toFixed(d);
const signed=(v:number|null,d=0)=>v===null?"—":`${v>=0?"+":""}${v.toFixed(d)}`;
const percent=(v:number|null,d=2)=>v===null?"—":`${signed(v,d)}%`;

export function ThemeBrowser({date,mode,onSelect}:{date:string;mode:"close"|"live";onSelect:(stock:SectorMember,themeCode:string)=>void}){
  const [overview,setOverview]=useState<ThemeOverview|null>(null),[error,setError]=useState(""),[loading,setLoading]=useState(true),[retry,setRetry]=useState(0);
  const [filter,setFilter]=useState<Filter>("全部"),[query,setQuery]=useState(""),[shown,setShown]=useState(60),[expanded,setExpanded]=useState<string[]>([]);
  const [memberSummaries,setMemberSummaries]=useState<Record<string,ThemeMemberSummary>>({});
  const handleMemberSummary=useCallback((key:string,summary:ThemeMemberSummary)=>setMemberSummaries(current=>({...current,[key]:summary})),[]);
  useEffect(()=>{const c=new AbortController();setOverview(null);setError("");setLoading(true);setExpanded([]);setFilter("全部");setQuery("");setShown(60);
    fetch(`/api/market/themes?date=${date}&mode=${mode}`,{signal:c.signal,cache:"no-store"}).then(async r=>{const d=await r.json() as ThemeOverview&{error?:string};if(!r.ok)throw new Error(d.error||"题材读取失败");return d;}).then(d=>{if(!c.signal.aborted)setOverview(d);}).catch(e=>{if(!c.signal.aborted)setError(e instanceof Error?e.message:"题材读取失败");}).finally(()=>{if(!c.signal.aborted)setLoading(false);});return()=>c.abort();
  },[date,mode,retry]);
  const themes=overview?.themes??[];
  const visible=themes.filter(t=>(filter==="全部"||t.label===filter)&&(!query||`${t.name}${t.code}`.toLowerCase().includes(query.trim().toLowerCase())));
  const shownThemes=visible.slice(0,shown);
  const cardRows=Array.from({length:Math.ceil(shownThemes.length/3)},(_,i)=>shownThemes.slice(i*3,i*3+3));
  const toggleRow=(row:ScoredTheme[])=>{const codes=row.map(t=>t.code);setExpanded(current=>current.includes(codes[0])?current.filter(c=>!codes.includes(c)):[...new Set([...current,...codes])]);};
  return <section className="panel theme-browser">
    {loading?<p className="history-small-empty" role="status">正在读取近7个交易日的概念快照并计算初筛…</p>:error?<div className="history-small-empty" role="alert">{error}<button className="text-link" onClick={()=>setRetry(v=>v+1)}>重试</button></div>:overview&&<>
      <div className="board-toolbar"><div className="board-filter-tabs" aria-label="按题材定位筛选">{filters.map(label=><button key={label} className={filter===label?"active":""} aria-pressed={filter===label} onClick={()=>{setFilter(label);setShown(60);setExpanded([]);}}>{label}<span>{label==="全部"?themes.length:themes.filter(t=>t.label===label).length}</span></button>)}</div><input aria-label="搜索题材" placeholder="搜索题材名称 / 代码" value={query} onChange={e=>{setQuery(e.target.value);setShown(60);setExpanded([]);}}/></div>
      <div className="board-results">显示 {Math.min(shown,visible.length)} / {visible.length} 个概念 · 点击任一卡片，同时展开本排板块详情</div>
      <div className="board-rows">{cardRows.map(row=><div key={row[0].code} className="board-row"><div className="board-row-cards">
        {row.map(t=>{const summary=memberSummaries[`${date}:${mode}:${t.code}`],isExpanded=expanded.includes(t.code);return <div key={t.code} className="board-column"><div className={`board-card-shell ${isExpanded?"selected":""}`}><button className="board-card" aria-expanded={isExpanded} onClick={()=>toggleRow(row)}><span className="board-card-top"><b>{t.name}</b><em className={`board-label board-label-${t.label==="退潮"?"risk":t.label==="主线初筛"?"main":t.label==="主线候选"?"candidate":"neutral"}`}>{t.label}</em></span><span className="board-card-score"><strong>{number(t.score)}<small>/100</small></strong><small className={(t.delta??0)<0?"down":"up"}>{t.delta===null?"较前日 —":`${t.delta>=0?"↑ ":"↓ "}${signed(t.delta)}`}</small></span><span className="board-card-meta"><span className={(t.pct??0)<0?"down":"up"}>{percent(t.pct)}</span><span>强势 {t.topDays}/5</span><span>{t.phase}</span></span><span className="board-card-foot">近5日 {percent(t.return5)} · 主线资格 {t.qualification.status} · 上涨 {t.up??"—"} / 下跌 {t.down??"—"} · 换手 {t.turnover===null?"—":`${number(t.turnover,2)}%`}</span>{isExpanded&&<span className="board-card-stats"><span><b>{summary?`${summary.traded}/${summary.total}`:"—"}</b><small>有行情/成分</small></span><span><b>{summary?.limitUp??"—"}</b><small>成分涨停</small></span><span title="同一股票可属于多个题材，题材成交额不能直接相加"><b>{summary?`${summary.amountYi.toFixed(1)}亿`:"—"}</b><small>成分成交额</small></span></span>}</button><BlockChartPreview kind="theme" code={t.code} name={t.name} date={date} mode={mode}/></div>
          {isExpanded&&<ThemeDetailView theme={t} date={date} mode={mode} summaryKey={`${date}:${mode}:${t.code}`} onSummary={handleMemberSummary} onSelect={onSelect}/>}
        </div>;})}
      </div></div>)}</div>
      {!visible.length&&<p className="history-small-empty">当前筛选下没有题材。</p>}
      {shown<visible.length&&<div className="theme-more"><button className="button" onClick={()=>setShown(v=>v+60)}>再显示 60 个</button></div>}
      <details className="history-details"><summary>题材初筛口径与数据限制</summary>{overview.warnings.map(w=><p key={w}>{w}</p>)}<p>数据来自 Tushare dc_index；符合日线资格的概念会再用 dc_member 核对历史成分和涨停梯队，其余概念在展开详情时读取成员。强度分尚未验证交易收益。</p></details>
    </>}
  </section>;
}

function ThemeDetailView({theme,date,mode,summaryKey,onSummary,onSelect}:{theme:ScoredTheme;date:string;mode:"close"|"live";summaryKey:string;onSummary:(key:string,summary:ThemeMemberSummary)=>void;onSelect:(stock:SectorMember,themeCode:string)=>void}){
  const [detail,setDetail]=useState<ThemeDetail|null>(null),[error,setError]=useState(""),[loading,setLoading]=useState(true),[retry,setRetry]=useState(0);
  const [query,setQuery]=useState(""),[filter,setFilter]=useState("all"),[page,setPage]=useState(0);
  useEffect(()=>{const c=new AbortController();setDetail(null);setError("");setLoading(true);
    fetch(`/api/market/themes?view=detail&date=${date}&mode=${mode}&code=${theme.code}`,{signal:c.signal,cache:"no-store"}).then(async r=>{const d=await r.json() as ThemeDetail&{error?:string};if(!r.ok)throw new Error(d.error||"题材成员读取失败");return d;}).then(d=>{if(!c.signal.aborted){setDetail(d);onSummary(summaryKey,{traded:d.group.traded,total:d.group.total,limitUp:d.group.limitUp,amountYi:d.group.amountYi});}}).catch(e=>{if(!c.signal.aborted)setError(e instanceof Error?e.message:"题材成员读取失败");}).finally(()=>{if(!c.signal.aborted)setLoading(false);});return()=>c.abort();
  },[theme.code,date,mode,retry,summaryKey,onSummary]);
  const rows=(detail?.group.members??[]).filter(m=>(!query||`${m.name}${m.code}`.toLowerCase().includes(query.trim().toLowerCase()))&&(filter==="all"||filter==="up"&&m.limit==="U"||filter==="down"&&m.quote!==null&&m.quote.pct<0||filter==="missing"&&!m.quote));
  const pageIndex=Math.min(page,Math.max(0,Math.ceil(rows.length/30)-1));
  return <div className="board-detail theme-detail">
    <div className="theme-qualification"><b>主线资格（题材口径）：{theme.qualification.status}</b><span>东财概念指数及所选日历史成分；题材强度分与行业强度分不直接比较。成分涨停梯队只作资格门槛，不计入强度分。</span><QualificationScoreCards checks={theme.qualification.checks} factors={theme.factors} aliases={{"持续性":"五日持续"}}/></div>
    <details className="engine-method" open><summary>近7日变化与阶段说明</summary><div className="market-cycle-history">{theme.history.map(p=><span key={p.date}><small>{p.date.slice(5)}</small><b>{percent(p.pct,1)}</b><span>{p.phase}</span></span>)}</div><p>阶段依据收盘规则分变化，非盘中分钟状态；主线初筛仍需核实催化和真实龙头地位。</p></details>
    {loading?<p className="history-small-empty" role="status">正在读取历史成分与成员行情…</p>:error?<p className="history-small-empty" role="alert">{error}<button className="text-link" onClick={()=>setRetry(v=>v+1)}>重试成员</button></p>:detail&&<>
      <div className="sector-filters"><input aria-label={`搜索${theme.name}成员`} placeholder="搜索成员名称 / 代码" value={query} onChange={e=>{setQuery(e.target.value);setPage(0);}}/></div>
      <div className="sector-filter-tabs">{[["all","全部成员"],["up","涨停"],["down","下跌"],["missing","无行情"]].map(([v,label])=><button key={v} className={filter===v?"active":""} aria-pressed={filter===v} onClick={()=>{setFilter(v);setPage(0);}}>{label}</button>)}</div>
      <div className="sector-members"><table className="history-table"><thead><tr><th>成员 / 角色候选</th><th>涨跌幅</th><th>成交额/亿</th></tr></thead><tbody>{rows.slice(pageIndex*30,pageIndex*30+30).map(m=><tr key={m.code}><td><button className="member-name" onClick={()=>onSelect(m,detail.code)}><b>{m.name}</b><small>{m.code} · {!m.quote?"无行情":m.limit==="U"?`${m.height}板`:m.limit==="D"?"跌停":m.limit==="Z"?"炸板":"未封板"}</small></button><div className="member-role-tags">{memberRoles(detail.group,m).map(role=><span key={role.label} title={role.reason}>{role.label}</span>)}</div></td><td className={(m.quote?.pct??0)<0?"down":"up"}>{m.quote?`${signed(m.quote.pct,2)}%`:"—"}</td><td>{m.quote?(m.quote.amount/1e8).toFixed(2):"—"}</td></tr>)}</tbody></table>{!rows.length&&<p className="history-small-empty">没有符合筛选条件的成员。</p>}</div>
      <div className="sector-pagination"><span>{rows.length} 只 · 第 {pageIndex+1}/{Math.max(1,Math.ceil(rows.length/30))} 页</span><button disabled={pageIndex===0} onClick={()=>setPage(pageIndex-1)}>上一页</button><button disabled={(pageIndex+1)*30>=rows.length} onClick={()=>setPage(pageIndex+1)}>下一页</button></div>
      <details className="history-details"><summary>角色判定与数据限制</summary><p>“龙头候选”要求当日板块排序第一且至少2连板；未达到连板条件时只标“领涨候选”。“容量中军候选”要求成交额板块第一、占比至少10%、当日不下跌。标签是规则候选，不代表真实市场地位。</p><p>“补涨候选”需要比较至少5日的个股表现与板块核心先后关系；本题材成员详情没有完整的个股历史序列，因此暂不自动标注补涨。</p>{detail.warnings.map(w=><p key={w}>{w}</p>)}<p>成分来自 Tushare dc_member 的 {detail.asOfDate} 快照；同一股票可属于多个题材，题材成交额不能直接相加。东财领涨股 {detail.leaderFromSource.name||"未知"} 不等于龙头。</p></details>
    </>}
  </div>;
}
