"use client";
import { useEffect, useRef, useState } from "react";
import { Panel } from "./workspace";
import {SectorDecision} from "./decision";
import {chinaNow,liveSession} from "@/lib/minute-engine";
import type {ScoredSector} from "@/lib/decision-engine";
import type { SectorMember, SectorOverview } from "@/lib/sectors";
const pct=(v:number|null)=>v===null?"—":`${v>=0?"+":""}${v.toFixed(2)}%`;
const boardFilters=["全部","主线初筛","待梯队核验","主线候选","轮动","退潮","待数据"] as const;
type BoardFilter=(typeof boardFilters)[number];
export function SectorBrowser({date,code,onSelect,scored,focus,mode="close"}:{date:string;code:string;onSelect:(stock:SectorMember)=>void;scored?:ScoredSector[];focus?:{name:string;serial:number};mode?:"close"|"live"}){
  const [data,setData]=useState<SectorOverview|null>(null),[error,setError]=useState(""),[loading,setLoading]=useState(true),[retry,setRetry]=useState(0),[name,setName]=useState(""),[boardFilter,setBoardFilter]=useState<BoardFilter>("全部"),[boardQuery,setBoardQuery]=useState(""),[query,setQuery]=useState(""),[sort,setSort]=useState("leader"),[filter,setFilter]=useState("all"),[page,setPage]=useState(0);
  const detailRef=useRef<HTMLDivElement>(null);
  const handledFocus=useRef(0);
  useEffect(()=>{const c=new AbortController();setLoading(true);setData(null);setError("");
    fetch(mode==="live"?`/api/market/decision?view=groups&date=${date}&mode=live`:`/api/market/context?view=sectors&date=${date}`,{signal:c.signal,cache:"no-store"}).then(async r=>{const d=await r.json() as SectorOverview & {error?:string};if(!r.ok)throw new Error(d.error||"板块读取失败");return d;}).then(d=>{if(!c.signal.aborted)setData(d);}).catch(e=>{if(!c.signal.aborted)setError(e.message);}).finally(()=>{if(!c.signal.aborted)setLoading(false);});return()=>c.abort();
  },[date,retry,mode]);
  useEffect(()=>{if(mode!=="live"||/40204|IP数量|权限|访问频次/.test(error))return;const timer=setInterval(()=>{if(document.visibilityState==="visible"&&liveSession(chinaNow().time))setRetry(n=>n+1);},60000);return()=>clearInterval(timer);},[mode,error]);
  useEffect(()=>{setName("");setBoardFilter("全部");setBoardQuery("");},[date,mode]);
  useEffect(()=>{if(focus?.name&&focus.serial!==handledFocus.current&&data?.groups.some(g=>g.name===focus.name)){handledFocus.current=focus.serial;setBoardFilter("全部");setBoardQuery("");setName(focus.name);setPage(0);setQuery("");}},[focus,data]);
  useEffect(()=>{if(name)detailRef.current?.scrollIntoView({behavior:"smooth",block:"start"});},[name]);
  const scoreByName=new Map(scored?.map(s=>[s.name,s])??[]);
  const labelFor=(boardName:string)=>scoreByName.get(boardName)?.label??"待数据";
  const ordered=data?.groups.slice().sort((a,b)=>(scoreByName.get(a.name)?.rank??999)-(scoreByName.get(b.name)?.rank??999)||a.name.localeCompare(b.name,"zh-CN"))??[];
  const visible=ordered.filter(g=>(boardFilter==="全部"||labelFor(g.name)===boardFilter)&&(!boardQuery||g.name.includes(boardQuery.trim())));
  const counts=new Map(boardFilters.map(label=>[label,label==="全部"?ordered.length:ordered.filter(g=>labelFor(g.name)===label).length]));
  const group=data?.groups.find(g=>g.name===name);
  const leaders=group?.members.filter(m=>m.leaderRank!==null)??[];
  const capacity=group?.members.filter(m=>m.quote).slice().sort((a,b)=>b.quote!.amount-a.quote!.amount)[0];
  const rows=(group?.members??[]).filter(m=>(!query||`${m.code}${m.name}`.toLowerCase().includes(query.toLowerCase()))&&(filter==="all"||filter==="up"&&m.limit==="U"||filter==="down"&&m.quote!==null&&m.quote.pct<0||filter==="missing"&&!m.quote)).slice();
  if(sort==="amount")rows.sort((a,b)=>(b.quote?.amount??-1)-(a.quote?.amount??-1));
  if(sort==="rise")rows.sort((a,b)=>(b.quote?.pct??-Infinity)-(a.quote?.pct??-Infinity));
  if(sort==="fall")rows.sort((a,b)=>(a.quote?.pct??Infinity)-(b.quote?.pct??Infinity));
  const pageIndex=Math.min(page,Math.max(0,Math.ceil(rows.length/30)-1)),pageRows=rows.slice(pageIndex*30,pageIndex*30+30);
  const switchGroup=(value:string)=>{setName(value);setPage(0);setQuery("");setFilter("all");};
  return <Panel title="行业板块全景" extra={<span className="muted">{data?.groups.length??"—"} 个行业</span>} className="sector-browser">
    {loading?<p className="history-small-empty" role="status">正在读取全市场行业成员…</p>:error?<p className="history-small-empty" role="alert">{error}<button className="text-link" onClick={()=>setRetry(n=>n+1)}>重试</button></p>:data&&<>
      <div className="board-toolbar"><div className="board-filter-tabs" aria-label="按行业定位筛选">{boardFilters.map(label=><button key={label} aria-pressed={boardFilter===label} className={boardFilter===label?"active":""} onClick={()=>{setBoardFilter(label);setName("");}}>{label}<span>{counts.get(label)}</span></button>)}</div><input aria-label="搜索行业板块" placeholder="搜索行业" value={boardQuery} onChange={e=>{setBoardQuery(e.target.value);setName("");}}/></div>
      <div className="board-results">显示 {visible.length} / {ordered.length} 个行业 · 按强度分排序；主线资格另行核对</div>
      <div className="board-card-grid">{visible.map(g=>{const s=scoreByName.get(g.name);return <button key={g.name} className={`board-card ${group?.name===g.name?"selected":""}`} aria-pressed={group?.name===g.name} onClick={()=>switchGroup(g.name)}><span className="board-card-top"><b>{g.name}</b><em className={`board-label board-label-${s?.label==="退潮"?"risk":s?.label==="主线初筛"?"main":s?.label==="主线候选"?"candidate":"neutral"}`}>{labelFor(g.name)}</em></span><span className="board-card-score"><strong>{s?.score??"—"}</strong><small className={(s?.delta??0)<0?"down":"up"}>{s?.delta==null?"较前日 —":`${s.delta>=0?"↑ +":"↓ "}${s.delta.toFixed(0)}`}</small></span><span className="board-card-meta"><span className={(g.averagePct??0)<0?"down":"up"}>{pct(g.averagePct)}</span><span>涨停 {g.limitUp??"—"}</span><span>{g.total} 只</span></span></button>;})}</div>
      {!visible.length&&<p className="history-small-empty">当前筛选下没有行业板块。</p>}
      {group&&<div className="board-detail" ref={detailRef}><div className="board-detail-heading"><div><small>行业板块详情</small><h3>{group.name}</h3></div><button className="text-link" onClick={()=>setName("")}>收起详情</button></div>
      <SectorDecision sector={scored?.find(s=>s.name===group.name)} onSelect={s=>{const m=group.members.find(m=>m.code===s.code);if(m)onSelect(m);}}/>
      <div className="sector-overview"><div><b className={(group.averagePct??0)<0?"down":"up"}>{pct(group.averagePct)}</b><small>等权平均涨幅</small></div><div><b><em className="up">{group.up}</em> / <em className="down">{group.down}</em> / {group.flat}</b><small>涨 / 跌 / 平</small></div><div><b>{group.amountYi.toFixed(1)} 亿</b><small>板块成交额</small></div></div>
      <div className="sector-breadth" aria-label={`上涨${group.up}，下跌${group.down}，平盘${group.flat}，无行情${group.total-group.traded}`}><i style={{width:`${group.up/group.total*100}%`,background:"#ed7580"}}/><i style={{width:`${group.flat/group.total*100}%`,background:"#75859c"}}/><i style={{width:`${group.down/group.total*100}%`,background:"#48b79c"}}/></div>
      <div className="sector-meta"><span>涨停 {group.limitUp??"—"} · 跌停 {group.limitDown??"—"} · 炸板 {group.broken??"—"}</span><span>有行情 {group.traded}/{group.total}</span></div>
      <div className="sector-leaders">{leaders.map(m=><button key={m.code} className={code===m.code?"selected":""} onClick={()=>onSelect(m)}><small>{["龙头候选","龙二候选","龙三候选"][m.leaderRank!-1]}</small><b>{m.name}</b><span className="up">{pct(m.quote!.pct)} {m.height?`· ${m.height}板`:""}</span></button>)}{!leaders.length&&<p className="muted">暂无符合规则的领涨候选</p>}</div>
      <div className="sector-meta">{capacity&&<button className="text-link" onClick={()=>onSelect(capacity)}>成交额第一：{capacity.name} · {(capacity.quote!.amount/1e8).toFixed(2)} 亿</button>}</div>
      <div className="sector-filters"><input aria-label="搜索板块成员" placeholder="搜索成员名称 / 代码" value={query} onChange={e=>{setQuery(e.target.value);setPage(0);}}/><select aria-label="成员排序" value={sort} onChange={e=>{setSort(e.target.value);setPage(0);}}><option value="leader">梯队优先</option><option value="rise">涨幅从高到低</option><option value="fall">跌幅优先</option><option value="amount">成交额从高到低</option></select></div>
      <div className="sector-filter-tabs">{[["all","全部成员"],["up","涨停"],["down","下跌"],["missing","无行情"]].map(([v,label])=><button key={v} aria-pressed={filter===v} className={filter===v?"active":""} onClick={()=>{setFilter(v);setPage(0);}}>{label}</button>)}</div>
      <div className="sector-members"><table className="history-table"><thead><tr><th>股票 / 梯队</th><th>涨跌幅</th><th>涨跌停</th><th>成交额/亿</th></tr></thead><tbody>{pageRows.map(m=><tr key={m.code} className={code===m.code?"selected":""}><td><button onClick={()=>onSelect(m)} className="member-name"><b>{m.name}</b><small>{m.code}{m.leaderRank?` · 梯队${m.leaderRank}`:""}</small></button></td><td className={(m.quote?.pct??0)<0?"down":"up"}>{pct(m.quote?.pct??null)}</td><td>{!m.quote?"无行情":m.limit===null?"未获取":m.limit==="U"?`${m.height}板`:m.limit==="D"?"跌停":m.limit==="Z"?"炸板":"—"}</td><td>{m.quote?(m.quote.amount/1e8).toFixed(2):"—"}</td></tr>)}</tbody></table>{!rows.length&&<p className="history-small-empty">没有符合筛选条件的成员。</p>}</div>
      <div className="sector-pagination"><span>{rows.length} 只 · 第 {pageIndex+1}/{Math.max(1,Math.ceil(rows.length/30))} 页</span><button disabled={pageIndex===0} onClick={()=>setPage(pageIndex-1)}>上一页</button><button disabled={(pageIndex+1)*30>=rows.length} onClick={()=>setPage(pageIndex+1)}>下一页</button></div>
      <details className="history-details"><summary>梯队与板块口径</summary><p>使用 Tushare 当前股票行业分类，覆盖所选日已上市的分类内股票；不受20只观察池限制。历史行业变更尚未还原，当前视图不是概念题材板块。</p><p>主线初筛单独要求覆盖、当日相对强度、近5日持续、上涨广度及涨停梯队；阈值为待回测的规则，不代表交易机会。盘中封板为估算，收盘官方名单核实前保持待核验。</p><p>龙头、龙二、龙三仅为当日收盘候选：在上涨且非ST股票中按连板高度、当日涨幅、成交额依次排序。名单不完整时不生成候选。成交额第一单列，最终角色由你判断。</p><p>平均涨幅为有行情成员等权均值；无行情不记为平盘。涨跌停名单不含ST，成交额代表买卖双方成交总额。</p>{data!.warnings.map(w=><p key={w} className="amber-text">{w}</p>)}</details>
      </div>}
    </>}
  </Panel>;
}
