"use client";
import {useState} from "react";
import {useDecision} from "./decision";
import {StockDetailCard} from "./stock-detail-card";
import type {FunnelCandidate} from "@/lib/funnel";

type Profile={company:{name:string;introduction:string;mainBusiness:string;businessScope:string;website:string|null}|null;period:string|null;segments:{name:string;sales:number|null;profit:number|null}[];companyStatus:{ok:boolean;error?:string};businessStatus:{ok:boolean;error?:string};note:string};
type Event={date:string;time:string|null;title:string;detail:string;category:string;url:string|null;source:string};
type Events={events:Event[];status:{announcements:string;forecasts:string;suspensions:string};errors:string[];note:string};
type Report={date:string;title:string;institution:string;author:string;abstract:string;url:string|null};
type Reports={status:string;error:string|null;reports:Report[];note:string};
type News={status:string;error?:string;articles:{time:string;title:string;content:string;source:string}[];scanned?:number;note:string};
type ResearchSection="business"|"checks"|"events"|"news"|"reports";
const money=(n:number|null)=>n===null?"未提供":`${(n/1e8).toFixed(2)} 亿`;
function SourceState({busy,error,empty,retry}:{busy:boolean;error:string;empty:string;retry:()=>void}){return busy?<p className="research-muted">正在读取…</p>:error?<p className="amber-text">{error} <button className="text-link" onClick={retry}>重试</button></p>:<p className="research-muted">{empty}</p>;}

export function StockResearch({code,name,date,candidate}:{code:string;name:string;date:string;candidate?:FunnelCandidate}){
  const [opened,setOpened]=useState<Record<ResearchSection,boolean>>({business:false,checks:false,events:false,news:false,reports:false});
  const setOpen=(section:ResearchSection)=>(open:boolean)=>setOpened(previous=>({...previous,[section]:open}));
  const base=`/api/market/research?code=${code}&date=${date}`;
  const profile=useDecision<Profile>(opened.business||opened.checks?`${base}&section=profile`:null);
  const events=useDecision<Events>(opened.events||opened.checks?`${base}&section=events`:null);
  const reports=useDecision<Reports>(opened.reports?`${base}&section=reports`:null);
  const news=useDecision<News>(opened.news&&name.length>=2&&name!==code?`/api/market/news?date=${date}&source=cls&period=recent&keyword=${encodeURIComponent(name)}`:null);
  const p=profile.data,e=events.data,r=reports.data;
  const theme=candidate?.theme?.name;
  const businessText=[p?.company?.mainBusiness,p?.company?.businessScope,...(p?.segments.map(s=>s.name)??[])].filter(Boolean).join(" ");
  const themeTextMatch=theme&&businessText.includes(theme);
  const riskEvents=e?.events.filter(x=>x.category.startsWith("风险")||x.category==="停复牌")??[];
  const checks=[
    {name:"题材归属",value:candidate?.theme?`${candidate.theme.name} · 已核对成分归属`:(candidate?.industry?`行业 ${candidate.industry} · 题材待核验`:"题材与行业归属待核验"),ok:!!candidate?.theme},
    {name:"主营关联",value:themeTextMatch?"公司业务文字命中题材名称；实际收入贡献仍待人工判断":p?.companyStatus.ok?"已有主营资料，题材与业务关联待人工核验":"公司主营资料不可用，待人工核验",ok:false},
    {name:"板块同步",value:candidate?.theme?"请对照分时图中个股、行业和题材的同分钟阶段":"题材分钟归属未知；请核对行业与个股分时阶段",ok:false},
    {name:"近期事件",value:e?.status.announcements==="已核验"?`${e.events.length} 条事件线索；影响和时效待人工判断`:"公告、业绩或风险事件待核验",ok:false},
    {name:"可成交性",value:riskEvents.length?`发现 ${riskEvents.length} 条风险或停复牌线索；需核对当日盘口和委托`:(e?.status.suspensions==="已读取"?"未发现所选区间的停复牌记录；盘口与实际成交仍待核验":"停复牌和盘中可成交性待核验"),ok:false}
  ];
  return <div className="stock-research" aria-label="公司资料与事件核验">
    <StockDetailCard title="主营业务与收入构成" subtitle={`所选日 ${date} · 公司资料按需读取`} onVisibilityChange={setOpen("business")}>
      {p?<>
        {p.company?<div className="research-columns"><div><b>主营业务</b><p className="research-business-lead">{p.company.mainBusiness||p.company.businessScope||"未提供主营描述"}</p>{p.company.introduction&&<p className="research-business-description">{p.company.introduction.slice(0,340)}{p.company.introduction.length>340?"…":""}</p>}{p.company.website&&<a href={p.company.website} target="_blank" rel="noreferrer">公司官网 ↗</a>}</div><div><b>主营构成 {p.period??"报告期未知"}</b>{p.segments.length?p.segments.slice(0,6).map((s,i)=><p key={`${s.name}:${i}`}>{s.name} · 收入 {money(s.sales)}</p>):<p>暂无可用产品收入构成</p>}</div></div>:<p className="amber-text">公司介绍未核验：{p.companyStatus.error??"暂无资料"}</p>}
        {!p.businessStatus.ok&&<p className="amber-text">主营构成未核验：{p.businessStatus.error}</p>}
        <p className="research-muted">{p.note} {theme?`「${theme}」成分归属不等于公司主营受益。`:"当前没有已核对题材归属。"}</p>
      </>:<SourceState busy={profile.busy} error={profile.error} empty="公司资料尚无结果" retry={profile.retry}/>}
    </StockDetailCard>
    <StockDetailCard title="核对清单" subtitle="规则证据与人工判断分开" onVisibilityChange={setOpen("checks")}>
      <div className="research-checks">{checks.map(c=><div key={c.name}><b>{c.ok?"✓":"○"} {c.name}</b><span>{c.value}</span></div>)}</div>
    </StockDetailCard>
    <StockDetailCard title="公告与风险时间线" subtitle="近 90 日 · 原文优先" onVisibilityChange={setOpen("events")}>
      {e?<><p className="research-muted">公告 {e.status.announcements} · 业绩预告 {e.status.forecasts} · 停复牌 {e.status.suspensions}</p>{e.events.length?<div className="research-timeline">{e.events.map((x,i)=><div key={`${x.date}:${x.title}:${i}`}><time>{x.date} {x.time??"时间未提供"}</time><span className={x.category==="风险"||x.category==="停复牌"?"amber-text":""}>{x.category}</span><b>{x.url?<a href={x.url} target="_blank" rel="noreferrer">{x.title} ↗</a>:x.title}</b>{x.detail&&<small>{x.detail.slice(0,240)}</small>}<small>{x.source}</small></div>)}</div>:<p className="research-muted">该区间没有返回事件；请结合数据状态核对。</p>}{e.errors.map((x,i)=><p key={i} className="amber-text">{x}</p>)}<p className="research-muted">{e.note}</p></>:<SourceState busy={events.busy} error={events.error} empty="事件资料尚无结果" retry={events.retry}/>}
    </StockDetailCard>
    <StockDetailCard title="近期快讯与政策线索" subtitle="近 3 日 · 公司名称文本匹配" onVisibilityChange={setOpen("news")}>
      {news.data?(news.data.status==="未核验"?<p className="amber-text">快讯未核验：{news.data.error}</p>:news.data.articles.length?<div className="research-timeline">{news.data.articles.slice(0,12).map((x,i)=><div key={`${x.time}:${x.title}:${i}`}><time>{x.time}</time><span>快讯</span><b>{x.title}</b>{x.content&&<small>{x.content.slice(0,240)}{x.content.length>240?"…":""}</small>}<small>财联社 · 文本匹配</small></div>)}</div>:<p className="research-muted">已检索 {news.data.scanned??0} 条快讯，未匹配公司名称；题材和政策相关报道仍需人工查看新闻页。</p>):<SourceState busy={news.busy} error={news.error} empty="公司名称不可用，暂未筛选近期快讯" retry={news.retry}/>}
      <p className="research-muted">{news.data?.note??"快讯不参与核心度或买卖评分。"} 政策可通过新闻页关键词单独检索，并与日K、分时的市场反应对照。</p>
    </StockDetailCard>
    <StockDetailCard title="机构研报" subtitle="近 90 日 · 仅供人工研读" onVisibilityChange={setOpen("reports")}>
      {r?<>{r.status==="未核验"?<p className="amber-text">研报未核验：{r.error}</p>:r.reports.length?<div className="research-timeline research-report-list">{r.reports.map((x,i)=><div key={`${x.date}:${x.title}:${i}`}><time>{x.date}</time><b>{x.url?<a href={x.url} target="_blank" rel="noreferrer">{x.title} ↗</a>:x.title}</b><small>{[x.institution,x.author].filter(Boolean).join(" · ")||"机构未提供"}</small>{x.abstract&&<p>{x.abstract.slice(0,300)}{x.abstract.length>300?"…":""}</p>}</div>)}</div>:<p className="research-muted">区间内未返回研报。</p>}<p className="research-muted">{r.note}</p></>:<SourceState busy={reports.busy} error={reports.error} empty="研报资料尚无结果" retry={reports.retry}/>}
    </StockDetailCard>
  </div>;
}
