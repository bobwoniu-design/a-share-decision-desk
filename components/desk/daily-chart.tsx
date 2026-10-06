"use client";
import { useState } from "react";
import type { DailyHistory } from "@/lib/market-data";
const price=(v:number|null|undefined)=>v==null?"—":v.toFixed(2);
export function DailyChart({data}:{data:DailyHistory}){
  const [metric,setMetric]=useState<"amount"|"volume">("amount"),[hover,setHover]=useState<number|null>(null);
  const points=data.dates.map(d=>data.points.find(p=>p.date===d)??null),lastIndex=points.findLastIndex(Boolean),index=hover??lastIndex,current=points[index];
  const ohlc=points.map(p=>p?{open:data.adjusted?p.adjustedOpen!:p.open,high:data.adjusted?p.adjustedHigh!:p.high,low:data.adjusted?p.adjustedLow!:p.low,close:data.adjusted?p.adjustedClose!:p.close}:null);
  const valid=ohlc.filter(p=>p!==null),min=Math.min(...valid.map(p=>p.low)),max=Math.max(...valid.map(p=>p.high)),pad=Math.max((max-min)*.06,.01),lo=min-pad,hi=max+pad;
  const left=55,right=742,width=right-left,step=width/Math.max(points.length,1),x=(i:number)=>left+(i+.5)*step,y=(v:number)=>20+(hi-v)/(hi-lo)*190;
  const values=points.map(p=>p?(metric==="amount"?p.amountYi:p.volShou/10000):null),maxValue=Math.max(1e-8,...values.filter((v):v is number=>v!==null)),barY=(v:number)=>304-v/maxValue*59;
  const ma5=points.map(p=>{if(!p)return null;if(metric==="amount")return p.amountMa5;const i=data.points.findIndex(v=>v.date===p.date);return i>=4?data.points.slice(i-4,i+1).reduce((s,v)=>s+v.volShou/10000,0)/5:null;});
  const path=(values:(number|null)[],scale:(n:number)=>number)=>values.map((v,i)=>v===null?"":`${i&&values[i-1]!==null?"L":"M"}${x(i)},${scale(v)}`).join(" ");
  const gaps:{start:number;end:number;status:string}[]=[];
  points.forEach((p,i)=>{if(p)return;const status=data.suspendedDates.includes(data.dates[i])?"停牌":"数据缺失";const previous=gaps.at(-1);if(previous&&previous.end===i-1&&previous.status===status)previous.end=i;else gaps.push({start:i,end:i,status});});
  const handleMove=(event:React.PointerEvent<SVGSVGElement>)=>{const box=event.currentTarget.getBoundingClientRect();const position=(event.clientX-box.left)/box.width*800;setHover(Math.max(0,Math.min(points.length-1,Math.floor((position-left)/step))));};
  const candle=ohlc[index];
  return <div className="daily-chart">
    <div className="kline-inspector" aria-live="polite"><b>{data.dates[index]}</b>{current&&candle?<><span>开 {price(candle.open)}</span><span>高 {price(candle.high)}</span><span>低 {price(candle.low)}</span><span>收 {price(candle.close)}</span><span>额 {current.amountYi.toFixed(2)}亿</span><span>较前5日均额 {current.amountRatio5?.toFixed(2)??"—"}倍</span></>:<span>{data.suspendedDates.includes(data.dates[index])?"全天停牌，无成交":"没有行情，未填补价格或成交额"}</span>}</div>
    <div className="kline-tools"><span>{data.adjusted?"前复权日K":"未复权日K"} <i className="ma-five"/>MA5 <i className="ma-twenty"/>MA20</span><div className="history-switch"><button aria-pressed={metric==="amount"} className={metric==="amount"?"active":""} onClick={()=>setMetric("amount")}>成交额</button><button aria-pressed={metric==="volume"} className={metric==="volume"?"active":""} onClick={()=>setMetric("volume")}>成交量</button></div></div>
    <svg viewBox="0 0 800 335" className="daily-candle-svg" role="img" tabIndex={0} aria-label="60个交易日日K线与成交柱。左右方向键逐日查看；上方显示对应日期开高低收与成交额。" onPointerMove={handleMove} onPointerLeave={()=>setHover(null)} onKeyDown={e=>{if(["ArrowLeft","ArrowRight","Home","End"].includes(e.key)){e.preventDefault();setHover(e.key==="Home"?0:e.key==="End"?points.length-1:Math.max(0,Math.min(points.length-1,index+(e.key==="ArrowRight"?1:-1))));}}}>
      {[0,1,2,3].map(i=>{const v=lo+(hi-lo)*i/3;return <g key={i}><line x1={left} x2={right} y1={y(v)} y2={y(v)} stroke="#26344b"/><text x={left-7} y={y(v)+4} textAnchor="end" fill="#91a4bf" fontSize="12">{v.toFixed(2)}</text></g>;})}
      {gaps.map(g=><g key={g.start}><rect x={left+g.start*step} y="14" width={(g.end-g.start+1)*step} height="292" fill="#b69b64" opacity=".075"/>{g.end-g.start>=2&&<text x={x((g.start+g.end)/2)} y="118" textAnchor="middle" fill="#c3ad83" fontSize="12">{g.status} {g.end-g.start+1}日</text>}<title>{data.dates[g.start]} 至 {data.dates[g.end]}：{g.status}，{g.end-g.start+1} 个交易日</title></g>)}
      {ohlc.map((p,i)=>{if(!p)return null;const color=p.close>=p.open?"#f17d86":"#57c3a5",bodyTop=y(Math.max(p.open,p.close)),bodyBottom=y(Math.min(p.open,p.close));return <g key={data.dates[i]}><line x1={x(i)} x2={x(i)} y1={y(p.high)} y2={y(p.low)} stroke={color}/><rect x={x(i)-step*.3} y={bodyTop} width={step*.6} height={Math.max(1,bodyBottom-bodyTop)} fill={color}/></g>;})}
      <path d={path(points.map(p=>p?.ma5??null),y)} fill="none" stroke="#fbbf24" strokeWidth="1.5"/><path d={path(points.map(p=>p?.ma20??null),y)} fill="none" stroke="#a78bfa" strokeWidth="1.5"/>
      <line x1={left} x2={right} y1="235" y2="235" stroke="#36445a"/><text x={left} y="231" fill="#a9bdd8" fontSize="12">{metric==="amount"?"成交额 / 亿元":"成交量 / 万手"}</text><text x={right} y="231" textAnchor="end" fill="#9ab0ce" fontSize="12">白线：5日均值</text>
      <text x={left-7} y="251" textAnchor="end" fill="#91a4bf" fontSize="12">{maxValue.toFixed(1)}</text><text x={left-7} y="307" textAnchor="end" fill="#91a4bf" fontSize="12">0</text>
      {values.map((v,i)=>v!==null&&<rect key={data.dates[i]} x={x(i)-step*.31} y={barY(v)} width={step*.62} height={304-barY(v)} fill={ohlc[i]!.close>=ohlc[i]!.open?"#f17d86":"#57c3a5"} opacity=".8"/>)}
      <path d={path(ma5,barY)} fill="none" stroke="#dce7f6" strokeWidth="1.2"/><line x1={left} x2={right} y1="305" y2="305" stroke="#36445a"/>
      {data.dates.map((d,i)=>(i%12===0||i===points.length-1)&&<text key={d} x={x(i)} y="326" textAnchor="middle" fill="#91a4bf" fontSize="12">{d.slice(5)}</text>)}
      {index>=0&&<line x1={x(index)} x2={x(index)} y1="15" y2="306" stroke="#92a6c4" strokeDasharray="3 4" opacity=".65"/>}
    </svg>
    <div className="chart-footnote"><span>红：收≥开 · 绿：收&lt;开 · 柱与K线同色</span><span>成交额反映活跃度，不等于资金净流入</span></div>
  </div>;
}
