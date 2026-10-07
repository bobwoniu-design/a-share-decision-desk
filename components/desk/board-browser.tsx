"use client";
import {useMemo,useState} from "react";
import type {BoardList} from "@/lib/board-list";
import type {DecisionOverview} from "@/lib/decision-engine";
import {MarketEvidence,useDecision} from "./decision";

export function BoardBrowser({date,mode,overview,onSelect}:{date:string;mode:"close"|"live";overview:DecisionOverview|null;onSelect:(stock:{code:string;name:string})=>void}){
  const [scope,setScope]=useState<"sealed"|"today"|"recent">("sealed"),[minHeight,setMinHeight]=useState(0),[minTouches,setMinTouches]=useState(0),[sort,setSort]=useState<"height"|"touches">("height");
  const {data,error,busy,retry}=useDecision<BoardList>(mode==="close"?`/api/market/board?date=${date}&v=2`:null);
  const visible=useMemo(()=>{
    const items=data?.items.filter(item=>(scope==="recent"||scope==="today"&&item.today||scope==="sealed"&&item.status==="涨停")&&(item.height??0)>=minHeight&&item.touches7>=minTouches)??[];
    return items.sort((a,b)=>sort==="touches"?b.touches7-a.touches7||(b.height??0)-(a.height??0): (b.height??0)-(a.height??0)||b.touches7-a.touches7);
  },[data,scope,minHeight,minTouches,sort]);
  return <section className="board-browser" aria-label="涨停榜单">
    <div className="board-browser-heading"><div><h2>涨停榜单</h2><p>按当日连板天数与近 7 个交易日触板次数筛选。触板含收盘涨停及炸板，连板仅统计当日收盘涨停。</p></div>{data&&<div className="board-counts"><b>{data.sealed}<small>收盘涨停</small></b><b>{data.broken}<small>炸板</small></b><b>{data.dates.length}<small>交易日覆盖</small></b></div>}</div>
    {mode==="live"?<p className="history-small-empty">官方涨停与炸板名单在收盘后核对。切换到“历史复盘”可查看完整榜单和近 7 日筛选。</p>:<>
      <div className="board-filters"><label>榜单范围<select value={scope} onChange={e=>setScope(e.target.value as "sealed"|"today"|"recent")}><option value="sealed">当日收盘涨停</option><option value="today">当日涨停与炸板</option><option value="recent">近7日所有触板</option></select></label><label>连板天数<select value={minHeight} onChange={e=>setMinHeight(Number(e.target.value))}>{[0,1,2,3,4,5,6,7].map(n=><option key={n} value={n}>{n===0?"全部":`${n} 板及以上`}</option>)}</select></label><label>近7日触板<select value={minTouches} onChange={e=>setMinTouches(Number(e.target.value))}>{[0,1,2,3,4,5,6,7].map(n=><option key={n} value={n}>{n===0?"全部":`${n} 次及以上`}</option>)}</select></label><label>排序<select value={sort} onChange={e=>setSort(e.target.value as "height"|"touches")}><option value="height">连板天数优先</option><option value="touches">7日触板次数优先</option></select></label><span>{data?`显示 ${visible.length} / ${data.items.length} 只`:""}</span></div>
      {busy?<p className="history-small-empty" role="status">正在核对近 7 个交易日涨停与炸板名单…</p>:error?<p className="error-banner" role="alert">{error} <button className="text-link" type="button" onClick={retry}>重新读取</button></p>:data&&<><div className="board-table-wrap"><table className="board-table"><thead><tr><th>股票 / 行业</th><th>当日状态</th><th>连板</th><th>7日触板</th><th>其中封板</th><th>当日涨幅</th><th>当日成交额</th><th>开板次数</th></tr></thead><tbody>{visible.map(item=><tr key={item.code}><td><button type="button" className="board-stock-link" onClick={()=>onSelect({code:item.code,name:item.name})}><b>{item.name}</b><small>{item.code} · {item.industry}</small></button></td><td><span className={item.status==="涨停"?"board-status-sealed":"board-status-broken"}>{item.status}</span></td><td>{item.height===null?"—":`${item.height} 板`}</td><td><b>{item.touches7} 次</b></td><td>{item.sealed7} 次</td><td className={(item.pct??0)>=0?"up":"down"}>{item.pct===null?"—":`${item.pct>=0?"+":""}${item.pct.toFixed(2)}%`}</td><td>{item.amountYi===null?"—":`${item.amountYi.toFixed(2)} 亿`}</td><td>{item.openTimes??"—"}</td></tr>)}</tbody></table>{visible.length===0&&<p className="history-small-empty">当前筛选条件下没有股票。</p>}</div><div className="board-list-footer"><span>涨停状态：Tushare 涨跌停名单 · 成交额：Tushare 日线（千元换算为亿元）· {data.dates[0]}—{data.dates.at(-1)}。未触板股票的当日行情不在本榜单中。</span><details><summary>数据核对与最强板块参照</summary><MarketEvidence data={overview}/></details></div></>}
    </>}
  </section>;
}
