"use client";
import {useMemo,useState} from "react";
import {useDecision} from "./decision";
import {useDesk} from "./provider";
import {chinaNow} from "@/lib/minute-engine";

type Article={time:string;title:string;content:string;channels:string;source:string};
type NewsResponse={status:string;source:string;period:string;start:string;end:string;articles:Article[];fetchedAt?:string;error?:string;note:string};
const sourceLabels:{[key:string]:string}={cls:"财联社",eastmoney:"东方财富",sina:"新浪财经"};
export function NewsPage(){
  const {ledger}=useDesk();
  const [date,setDate]=useState(()=>chinaNow().date),[source,setSource]=useState("cls"),[period,setPeriod]=useState<"premarket"|"day">("premarket"),[query,setQuery]=useState("");
  const {data,error,busy,retry}=useDecision<NewsResponse>(`/api/market/news?date=${date}&source=${source}&period=${period}`);
  const tracked=useMemo(()=>[...new Set([...ledger.watchlist.map(x=>x.name),...ledger.trades.filter(x=>!x.voided).map(x=>x.name)].filter(x=>x&&x.length>=2))], [ledger]);
  const articles=(data?.articles??[]).map(a=>({...a,matched:tracked.filter(name=>`${a.title} ${a.content}`.includes(name)).slice(0,5)})).filter(a=>!query||`${a.title} ${a.content} ${a.channels} ${a.matched.join(" ")}`.toLowerCase().includes(query.toLowerCase()));
  const manual=ledger.events.filter(e=>e.date===date).sort((a,b)=>a.title.localeCompare(b.title));
  return <section className="news-workspace">
    <div className="news-head"><div><h2>盘前新闻速览</h2><p>先过事件，再结合市场反应与个股依据自行判断。快讯不直接进入选股评分。</p></div><div className="news-controls"><label>日期 <input type="date" value={date} onChange={e=>setDate(e.target.value)}/></label><label>来源 <select value={source} onChange={e=>setSource(e.target.value)}>{Object.entries(sourceLabels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label><button className={`button ${period==="premarket"?"primary":""}`} onClick={()=>setPeriod("premarket")}>盘前窗口</button><button className={`button ${period==="day"?"primary":""}`} onClick={()=>setPeriod("day")}>全天</button><button className="button" onClick={retry}>刷新</button></div></div>
    <div className="news-status"><b>{period==="premarket"?"昨晚 18:00 → 今日 09:30":"当日 00:00 → 23:59"}</b><span>{data?`${data.start} 至 ${data.end}`:"正在确定窗口"}</span><span>{data?.status==="已读取"?`${data.articles.length} 条快讯 · ${sourceLabels[source]}`:data?.status??"读取中"}</span></div>
    <div className="news-filter"><input aria-label="搜索新闻" placeholder="搜索公司、题材、政策关键词" value={query} onChange={e=>setQuery(e.target.value)}/><span>匹配持仓和自选名称仅作线索，不表示事件真实影响。</span></div>
    {busy?<p className="history-small-empty">正在读取所选新闻窗口…</p>:error?<p className="error-banner">{error} <button className="text-link" onClick={retry}>重试</button></p>:data?.status==="未核验"?<p className="error-banner">新闻源未核验：{data.error}。当前空列表不能视为没有新闻；可切换其他来源。<button className="text-link" onClick={retry}>重试</button></p>:articles.length?<div className="news-list">{articles.map((a,i)=><article key={`${a.time}:${a.title}:${i}`}><time>{a.time}</time><div><h3>{a.title}</h3>{a.content&&<p>{a.content.length>420?`${a.content.slice(0,420)}…`:a.content}</p>}<small>{sourceLabels[a.source]??a.source}{a.channels?` · ${a.channels}`:""}{a.matched.length?` · 自选/交易名称匹配：${a.matched.join("、")}`:""}</small></div></article>)}</div>:data?.status==="已读取"?<p className="history-small-empty">所选来源与窗口未返回快讯；可切换来源或全天范围。</p>:null}
    {manual.length>0&&<div className="news-manual"><h3>个人记录的事件 · {date}</h3>{manual.map(e=><p key={e.id}>{e.url?<a href={e.url} target="_blank" rel="noreferrer">{e.title} ↗</a>:e.title} · {e.verified?"已人工核验":"待核验"}{e.note?` · ${e.note}`:""}</p>)}</div>}
    <p className="research-muted">{data?.note??"新闻需要单独的数据权限；未接通时会明确显示未核验。"} 新闻接口不提供原文链接时，不伪造链接。</p>
  </section>;
}
