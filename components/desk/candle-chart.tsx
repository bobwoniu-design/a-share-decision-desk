"use client";
import type {Candle} from "@/lib/candle-data";
import {useDecision} from "./decision";

type ChartData={label:string;source:string;dates:string[];points:Candle[];missingDates:string[];note:string};
const price=(n:number)=>n.toFixed(n>=1000?1:2);

export function CandleChart({dates,points,mini=false}:{dates:string[];points:Candle[];mini?:boolean}){
  const width=mini?132:560,height=mini?52:200,plotTop=mini?3:12,plotBottom=mini?37:145,amountTop=mini?40:155,amountBottom=mini?50:190;
  if(!points.length)return <div className="block-chart-empty">暂无可核验 K 线</div>;
  const low=Math.min(...points.map(p=>p.low)),high=Math.max(...points.map(p=>p.high)),pad=Math.max((high-low)*.08,high*.002),min=low-pad,max=high+pad;
  const y=(value:number)=>plotBottom-(value-min)/(max-min)*(plotBottom-plotTop);
  const byDate=new Map(points.map(p=>[p.date,p])),slots=dates.length,gap=width/Math.max(slots,1),body=Math.max(2,Math.min(mini?7:15,gap*.58)),maxAmount=Math.max(...points.map(p=>p.amountYi??0),1);
  return <svg className={mini?"candle-mini":"candle-main"} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${dates.length}个交易日K线，${points.length}日有行情`} preserveAspectRatio="none">
    {!mini&&<><line x1="0" x2={width} y1={plotTop} y2={plotTop} className="candle-grid"/><line x1="0" x2={width} y1={(plotTop+plotBottom)/2} y2={(plotTop+plotBottom)/2} className="candle-grid"/><line x1="0" x2={width} y1={plotBottom} y2={plotBottom} className="candle-grid"/><text x="3" y="10" className="candle-axis">{price(high)}</text><text x="3" y={plotBottom-3} className="candle-axis">{price(low)}</text></>}
    {dates.map((date,i)=>{const p=byDate.get(date),x=(i+.5)*gap;if(!p)return <line key={date} x1={x} x2={x} y1={plotTop} y2={amountBottom} className="candle-missing"/>;const up=p.close>=p.open,color=up?"#e97882":"#4cb99f",bodyTop=Math.min(y(p.open),y(p.close)),bodyHeight=Math.max(1.5,Math.abs(y(p.open)-y(p.close)));return <g key={date}><title>{date} 开 {price(p.open)} 高 {price(p.high)} 低 {price(p.low)} 收 {price(p.close)}{p.amountYi===null?"":` · 成交 ${p.amountYi.toFixed(2)} 亿`}</title><line x1={x} x2={x} y1={y(p.high)} y2={y(p.low)} stroke={color} strokeWidth={mini?1.3:1.5}/><rect x={x-body/2} y={bodyTop} width={body} height={bodyHeight} fill={up?color:"transparent"} stroke={color} strokeWidth="1"/><rect x={x-body/2} y={amountBottom-(p.amountYi??0)/maxAmount*(amountBottom-amountTop)} width={body} height={(p.amountYi??0)/maxAmount*(amountBottom-amountTop)} fill={color} opacity=".7"/></g>;})}
    {!mini&&<><text x="2" y={height-2} className="candle-axis">{dates[0].slice(5)}</text><text x={width-37} y={height-2} className="candle-axis">{dates.at(-1)?.slice(5)}</text></>}
  </svg>;
}

export function BlockChart({kind,code,name,date,mode}:{kind:"theme"|"industry";code?:string;name?:string;date:string;mode:"close"|"live"}){
  const url=`/api/market/block-chart?kind=${kind}&date=${date}&mode=${mode}&${kind==="theme"?`code=${encodeURIComponent(code??"")}`:`name=${encodeURIComponent(name??"")}`}`;
  const {data,error,busy}=useDecision<ChartData>(url);
  return <section className="block-chart-panel" aria-label="板块走势"><div className="block-chart-head"><b>{data?.label??(kind==="theme"?"东财概念指数 · 日K":"当前成员等权走势 · 日K")}</b><span>近20个交易日 · 下方为成交额</span></div>{busy?<p className="block-chart-empty" role="status">正在读取板块历史走势…</p>:error?<p className="block-chart-empty" role="alert">{error}</p>:data&&<><CandleChart dates={data.dates} points={data.points}/><p className="block-chart-note">{data.note}{data.missingDates.length?` 缺失 ${data.missingDates.length} 日。`:""}</p></>}</section>;
}
