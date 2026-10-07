"use client";

import {useState} from "react";
import type {HotMoneyPerson,HotMoneyTrade} from "@/lib/hot-money";
import {useDecision} from "./decision";

type RosterResponse={items:HotMoneyPerson[];fetchedAt:string;source:string};
type TradesResponse={date:string;requestedDate:string;items:HotMoneyTrade[];fetchedAt:string;source:string};
const PAGE_SIZE=40;
const money=(value:number|null)=>value===null?"—":`${value>=0?"+":"−"}${(Math.abs(value)/10000).toLocaleString("zh-CN",{maximumFractionDigits:1})} 万`;

export function HotMoneyBrowser({date,mode}:{date:string;mode:"close"|"live"}){
  const [section,setSection]=useState<"trades"|"roster">("trades");
  const [query,setQuery]=useState("");
  const [page,setPage]=useState(0);
  const [openName,setOpenName]=useState<string|null>(null);
  const roster=useDecision<RosterResponse>(section==="roster"?`/api/market/hot-money?kind=roster&date=${date}&mode=${mode}`:null);
  const trades=useDecision<TradesResponse>(section==="trades"||section==="roster"&&openName?`/api/market/hot-money?kind=trades&date=${date}&mode=${mode}`:null);
  const keyword=query.trim().toLocaleLowerCase();
  const items=section==="roster"?(roster.data?.items??[]).filter(item=>!keyword||`${item.name} ${item.description} ${item.organizations}`.toLocaleLowerCase().includes(keyword)):(trades.data?.items??[]).filter(item=>!keyword||`${item.hotMoneyName} ${item.stockName} ${item.code} ${item.organizations} ${item.tag}`.toLocaleLowerCase().includes(keyword));
  const pages=Math.max(1,Math.ceil(items.length/PAGE_SIZE)),pageIndex=Math.min(page,pages-1),visible=items.slice(pageIndex*PAGE_SIZE,(pageIndex+1)*PAGE_SIZE);
  const active=section==="roster"?roster:trades;
  return <section className="hot-money-browser" aria-label="游资名录与交易明细">
    <div className="hot-money-heading"><div><h2>游资观察</h2><p>名录中的名称与营业部为数据源归类，交易明细是盘后披露记录；席位关联不等于确认实际交易人。</p></div><span>{section==="trades"&&trades.data?`明细日期 ${trades.data.date}`:section==="roster"&&roster.data?`名录 ${roster.data.items.length} 条`:""}</span></div>
    <div className="hot-money-controls"><div className="hot-money-subtabs" aria-label="游资内容"><button type="button" aria-pressed={section==="trades"} className={section==="trades"?"active":""} onClick={()=>{setSection("trades");setPage(0);setQuery("");}}>交易明细</button><button type="button" aria-pressed={section==="roster"} className={section==="roster"?"active":""} onClick={()=>{setSection("roster");setPage(0);setQuery("");}}>游资名录</button></div><input type="search" aria-label={section==="trades"?"搜索游资、股票或营业部":"搜索游资或关联营业部"} placeholder={section==="trades"?"搜索游资、股票或营业部":"搜索游资或营业部"} value={query} onChange={e=>{setQuery(e.target.value);setPage(0);}}/></div>
    {section==="trades"&&mode==="live"&&<p className="hot-money-note">盘中显示前一交易日明细；当日记录待数据源发布后，切换到“历史复盘”查看。</p>}
    {active.busy&&<p className="history-small-empty" role="status">正在读取{section==="trades"?"游资交易明细":"游资名录"}…</p>}
    {active.error&&<p className="history-small-empty" role="alert">{active.error}。{section==="trades"?"该接口要求 Tushare 账号具有 10000 积分权限。":"该接口要求 Tushare 账号具有 5000 积分权限。"}<button className="text-link" type="button" onClick={active.retry}>重试</button></p>}
    {!active.busy&&!active.error&&section==="trades"&&trades.data&&<><div className="hot-money-table-wrap"><table className="hot-money-table"><thead><tr><th>游资</th><th>股票</th><th>关联营业部 / 机构</th><th>买入</th><th>卖出</th><th>净买卖</th><th>标签</th></tr></thead><tbody>{(visible as HotMoneyTrade[]).map((item,index)=><tr key={`${item.date}:${item.code}:${item.hotMoneyName}:${index}`}><td><b>{item.hotMoneyName}</b></td><td><b>{item.stockName}</b><small>{item.code}</small></td><td className="hot-money-org">{item.organizations||"—"}</td><td>{money(item.buyAmount)}</td><td>{money(item.sellAmount)}</td><td className={item.netAmount===null?"":item.netAmount>=0?"up":"down"}>{money(item.netAmount)}</td><td>{item.tag||"—"}</td></tr>)}</tbody></table></div>{!items.length&&<p className="history-small-empty">{keyword?"没有匹配的交易明细。":"所选日期未返回游资交易明细；可能尚未发布、无记录或数据覆盖不足。"}</p>}</>}
    {!active.busy&&!active.error&&section==="roster"&&roster.data&&<><div className="hot-money-roster">{(visible as HotMoneyPerson[]).map(item=>{
      const expanded=openName===item.name;
      const records=expanded?(trades.data?.items??[]).filter(trade=>trade.hotMoneyName===item.name):[];
      return <article className={expanded?"expanded":""} key={item.name}>
        <button type="button" className="hot-money-roster-card" aria-expanded={expanded} onClick={()=>setOpenName(expanded?null:item.name)}><b>{item.name}</b><span>{item.description||"点击查看关联营业部与当日交易"}</span></button>
        {expanded&&<div className="hot-money-roster-detail">
          {item.description&&<p>{item.description}</p>}
          <p><strong>关联营业部 / 机构</strong>{item.organizations||"未列出"}</p>
          <h3>交易记录 · {trades.data?.date??(mode==="live"?"前一交易日":date)}</h3>
          {trades.busy?<p role="status">正在读取交易记录…</p>:trades.error?<p role="alert">{trades.error}。交易明细接口要求 Tushare 账号具有 10000 积分权限。<button className="text-link" type="button" onClick={trades.retry}>重试</button></p>:trades.data&&records.length?<div className="hot-money-table-wrap"><table className="hot-money-table"><thead><tr><th>股票</th><th>关联营业部 / 机构</th><th>买入</th><th>卖出</th><th>净买卖</th><th>标签</th></tr></thead><tbody>{records.map((trade,index)=><tr key={`${trade.code}:${index}`}><td><b>{trade.stockName}</b><small>{trade.code}</small></td><td className="hot-money-org">{trade.organizations||"—"}</td><td>{money(trade.buyAmount)}</td><td>{money(trade.sellAmount)}</td><td className={trade.netAmount===null?"":trade.netAmount>=0?"up":"down"}>{money(trade.netAmount)}</td><td>{trade.tag||"—"}</td></tr>)}</tbody></table></div>:trades.data?<p>该日期没有以“{item.name}”披露的交易记录。</p>:null}
        </div>}
      </article>;
    })}</div>{!items.length&&<p className="history-small-empty">{keyword?"没有匹配的游资。":"名录暂未返回记录。"}</p>}</>}
    {!active.busy&&!active.error&&items.length>PAGE_SIZE&&<div className="hot-money-pagination"><span>第 {pageIndex+1}/{pages} 页 · 共 {items.length} 条</span><button type="button" disabled={pageIndex===0} onClick={()=>setPage(pageIndex-1)}>上一页</button><button type="button" disabled={pageIndex>=pages-1} onClick={()=>setPage(pageIndex+1)}>下一页</button></div>}
    <p className="hot-money-source">数据来源：Tushare <a href="https://tushare.pro/document/2?doc_id=311" target="_blank" rel="noreferrer">hm_list</a> / <a href="https://tushare.pro/document/2?doc_id=312" target="_blank" rel="noreferrer">hm_detail</a>。金额按来源的“元”换算为“万元”；仅展示已披露数据，不作为盘中实时买卖信号。</p>
  </section>;
}
