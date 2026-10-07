"use client";
import {useEffect,useRef,useState} from "react";
import {CandleChart} from "./candle-chart";
import {useDecision} from "./decision";
import {Dialog,DialogContent,DialogDescription,DialogHeader,DialogTitle} from "@/components/ui/dialog";
import type {Candle} from "@/lib/candle-data";
import type {BlockMinutePoint} from "@/lib/block-minute";

type Daily={label:string;dates:string[];points:Candle[];note:string};
type Minute={label:string;date:string;basisDate:string;points:BlockMinutePoint[];samples:{code:string;name:string}[];note:string};
export function BlockChartPreview({kind,code,name,date,mode}:{kind:"theme"|"industry";code?:string;name:string;date:string;mode:"close"|"live"}){
  const [near,setNear]=useState(false),[open,setOpen]=useState(false),[tab,setTab]=useState<"daily"|"minute">("daily");
  const anchor=useRef<HTMLDivElement>(null);
  useEffect(()=>{const element=anchor.current;if(!element)return;if(typeof IntersectionObserver==="undefined"){queueMicrotask(()=>setNear(true));return;}const observer=new IntersectionObserver(entries=>{if(entries.some(entry=>entry.isIntersecting)){setNear(true);observer.disconnect();}},{rootMargin:"180px"});observer.observe(element);return()=>observer.disconnect();},[]);
  const base=`/api/market/block-chart?kind=${kind}&date=${date}&mode=${mode}&${kind==="theme"?`code=${encodeURIComponent(code??"")}`:`name=${encodeURIComponent(name)}`}`;
  const daily=useDecision<Daily>(near||open?base:null);
  const minute=useDecision<Minute>(open&&tab==="minute"?`${base}&view=minute`:null,open&&mode==="live"&&tab==="minute");
  return <div ref={anchor} className="board-card-chart">
    <span>近20日日K</span>
    <button type="button" className="board-chart-trigger" onClick={()=>{setNear(true);setOpen(true);}} aria-label={`查看${name}日线和分时图`} aria-haspopup="dialog">
      {daily.data?.points.length?<CandleChart dates={daily.data.dates} points={daily.data.points} mini/>:<span className="funnel-candle-placeholder">{daily.error?"K线暂不可用":near?"K线读取中…":"查看K线 ↗"}</span>}
    </button>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="dialog-body block-chart-dialog"><DialogHeader><DialogTitle>{name} · 行情图表</DialogTitle><DialogDescription>日线与分时采用各自标明的数据口径；成员等权分时不是官方板块指数。</DialogDescription></DialogHeader>
      <div className="stock-chart-toolbar"><div className="stock-chart-periods" role="tablist" aria-label={`${name}图表周期`}><button type="button" role="tab" aria-selected={tab==="daily"} className={tab==="daily"?"active":""} onClick={()=>setTab("daily")}>日K · 20日</button><button type="button" role="tab" aria-selected={tab==="minute"} className={tab==="minute"?"active":""} onClick={()=>setTab("minute")}>分时</button></div><span>{date}</span></div>
      {tab==="daily"?(daily.busy?<p className="history-small-empty">正在读取日线…</p>:daily.error?<p className="history-small-empty" role="alert">{daily.error} <button className="text-link" onClick={daily.retry}>重试</button></p>:daily.data?<><div className="block-chart-head"><b>{daily.data.label}</b></div><CandleChart dates={daily.data.dates} points={daily.data.points}/><p className="block-chart-note">{daily.data.note}</p></>:null):(minute.busy?<p className="history-small-empty">正在读取代表成员的分钟行情…</p>:minute.error?<p className="history-small-empty" role="alert">{minute.error} <button className="text-link" onClick={minute.retry}>重试</button></p>:minute.data?<><div className="block-chart-head"><b>{minute.data.label}</b><span>{minute.data.samples.length}只样本 · 基准 {minute.data.basisDate}</span></div><BlockMinutePlot points={minute.data.points}/><p className="block-chart-note">{minute.data.note}</p></>:null)}
    </DialogContent></Dialog>
  </div>;
}

function BlockMinutePlot({points}:{points:BlockMinutePoint[]}){
  const values=points.flatMap(point=>point.level===null?[]:[point.level]);
  if(!values.length)return <p className="history-small-empty">没有覆盖足够的同分钟行情。</p>;
  const low=Math.min(100,...values),high=Math.max(100,...values),padding=Math.max((high-low)*.12,.25),min=low-padding,max=high+padding;
  const x=(index:number)=>45+index/Math.max(1,points.length-1)*820;
  const y=(value:number)=>20+(max-value)/(max-min)*245;
  const path=points.map((point,index)=>point.level===null?"":`${index&&points[index-1].level!==null?"L":"M"}${x(index).toFixed(1)},${y(point.level).toFixed(1)}`).join(" ");
  return <svg className="block-minute-plot" viewBox="0 0 900 310" role="img" aria-label={`板块代表成员等权分时，${points.filter(point=>point.level!==null).length}个有效分钟`}>
    {[min,100,max].map((value,index)=><g key={index}><line x1="45" x2="865" y1={y(value)} y2={y(value)} stroke="#2d435e" strokeDasharray={index===1?"4 4":undefined}/><text x="39" y={y(value)+4} textAnchor="end" fill="#9db4d2" fontSize="12">{value.toFixed(1)}</text></g>)}
    <path d={path} fill="none" stroke="#8abaff" strokeWidth="2.4" strokeLinejoin="round"/>
    <text x="45" y="300" fill="#9db4d2" fontSize="12">{points[0].time}</text><text x="865" y="300" fill="#9db4d2" fontSize="12" textAnchor="end">{points.at(-1)?.time}</text>
  </svg>;
}
