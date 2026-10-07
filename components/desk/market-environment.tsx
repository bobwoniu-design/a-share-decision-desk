"use client";
import {useMemo,useState} from "react";
import {useDecision} from "./decision";
import {marketValidationFromSummaries} from "@/lib/market-validation";
import type {DecisionOverview} from "@/lib/decision-engine";
import type {MarketIndexHistory} from "@/lib/tushare";

const fmt=(value:number|null|undefined,digits=0)=>value==null?"—":value.toLocaleString("zh-CN",{minimumFractionDigits:digits,maximumFractionDigits:digits});
const signed=(value:number|null|undefined,digits=2)=>value==null?"—":`${value>=0?"+":""}${fmt(value,digits)}%`;

export function MarketEnvironment({date,data,onDate}:{date:string;data:DecisionOverview|null;onDate:(date:string)=>void}){
  const [windowDays,setWindowDays]=useState<7|20>(20),[selected,setSelected]=useState<string|null>(null),[hover,setHover]=useState<string|null>(null);
  const index=useDecision<MarketIndexHistory>(`/api/market/index-history?date=${date}`);
  const scoreMap=useMemo(()=>new Map(data?.market.history.map(h=>[h.date,h])??[]),[data]);
  const dayMap=useMemo(()=>new Map(data?.marketDays.map(d=>[d.date,d])??[]),[data]);
  const dates=(data?.marketDays.map(d=>d.date)??index.data?.dates??[]).slice(-windowDays);
  const activeDate=hover&&dates.includes(hover)?hover:selected&&dates.includes(selected)?selected:dates.at(-1)??date;
  const activeDay=dayMap.get(activeDate),activeScore=scoreMap.get(activeDate);
  const validation=useMemo(()=>data?marketValidationFromSummaries(data.marketDays,data.market.history):null,[data]);
  const candles=index.data?.dates.filter(d=>dates.includes(d)).map(d=>index.data!.points.find(p=>p.date===d)??null)??[];
  const valid=candles.filter(p=>p!==null),lowest=valid.length?Math.min(...valid.map(p=>p.low)):0,highest=valid.length?Math.max(...valid.map(p=>p.high)):1;
  const padding=Math.max((highest-lowest)*.07,1),low=lowest-padding,high=highest+padding;
  const left=66,right=1010,width=right-left,step=width/Math.max(1,candles.length),x=(i:number)=>left+(i+.5)*step,y=(n:number)=>18+(high-n)/(high-low)*205,scoreY=(n:number)=>332-n/100*74;
  const scorePoints=index.data?.dates.filter(d=>dates.includes(d)).map(d=>scoreMap.get(d)?.score??null)??[];
  const scorePath=scorePoints.map((s,i)=>s===null?"":`${i&&scorePoints[i-1]!==null?"L":"M"}${x(i)},${scoreY(s)}`).join(" ");
  const indexPoint=index.data?.points.find(p=>p.date===activeDate);
  const cards:[string,string,string][]=[
    ["上涨 / 下跌",activeDay?`${fmt(activeDay.up)} / ${fmt(activeDay.down)}`:"—",activeDay?`平盘 ${fmt(activeDay.flat)} · 有行情 ${fmt(activeDay.total)} 只`:"等待市场数据"],
    ["涨停 / 跌停",activeDay?.limitUp!=null&&activeDay.limitDown!=null?`${activeDay.limitUp} / ${activeDay.limitDown}`:"—","不含 ST 的官方榜单"],
    ["连板高度",activeDay?.height!=null?`${activeDay.height} 板`:"—","当日收盘最大连板数"],
    ["炸板率",activeDay?.brokenRate!=null?`${fmt(activeDay.brokenRate,1)}%`:"—","炸板 ÷ 触板股票数"],
    ["昨日涨停溢价",signed(activeDay?.premium),"昨日涨停股票今日等权涨幅"],
    ["沪深A股成交额",activeDay?`${fmt(activeDay.amountYi,1)} 亿`:"—","股票成交额合计，不含北交所"]
  ];
  const activeIndex=index.data?.dates.findIndex(d=>d===activeDate)??-1;
  const onChartMove=(event:React.PointerEvent<SVGSVGElement>)=>{if(!index.data||!candles.length)return;const box=event.currentTarget.getBoundingClientRect(),point=(event.clientX-box.left)/box.width*1040;
    const i=Math.max(0,Math.min(candles.length-1,Math.floor((point-left)/step)));setHover(index.data.dates.filter(d=>dates.includes(d))[i]);};
  return <section className="market-environment" aria-label="市场环境、指数K线与历史检验">
    <div className="environment-heading"><div><b>市场环境 · 指数K线与情绪</b><small>上证综指 000001.SH · 指数价格与全市场情绪采用不同口径</small></div><div className="history-switch">{([7,20] as const).map(n=><button type="button" key={n} className={windowDays===n?"active":""} aria-pressed={windowDays===n} onClick={()=>{setWindowDays(n);setHover(null);setSelected(null);}}>近 {n} 个交易日</button>)}</div></div>
    <div className="environment-summary"><div className="environment-score"><small>{activeDate} · {activeDate===date?"所选交易日":"历史交易日"}</small><strong>情绪 {fmt(activeScore?.score)}<em>/100</em></strong><span>{activeScore?.cycle??"待数据"} · {activeScore?.phase??"待数据"}</span>{activeDate!==date&&<button type="button" className="text-link" onClick={()=>onDate(activeDate)}>切换工作台至此日</button>}</div><div className="environment-metrics">{cards.map(([label,value,note])=><div key={label}><small>{label}</small><b>{value}</b><span>{note}</span></div>)}</div></div>
    <div className="environment-chart-head"><div><b>上证综指 日K</b><span>{indexPoint?`${fmt(indexPoint.close,2)} 点 · ${signed(indexPoint.pct)}`:"将鼠标移到K线上查看当日"}</span></div><small>{indexPoint?`开 ${fmt(indexPoint.open,2)} · 高 ${fmt(indexPoint.high,2)} · 低 ${fmt(indexPoint.low,2)} · 收 ${fmt(indexPoint.close,2)}`:"红涨绿跌 · 下方蓝线为市场情绪评分"}</small></div>
    {index.busy?<p className="history-small-empty" role="status">正在读取一次上证综指日线，指标和评分已可查看…</p>:index.error?<p className="history-small-empty" role="alert">指数K线暂不可用：{index.error} <button type="button" className="text-link" onClick={index.retry}>重试</button>。上方市场指标和检验仍可使用。</p>:index.data&&candles.length>0&&<svg className="environment-candle-svg" viewBox="0 0 1040 382" role="img" tabIndex={0} aria-label="上证综指日K线及市场情绪评分。左右方向键逐日查看，上方指标卡随日期变化。" onPointerMove={onChartMove} onPointerLeave={()=>setHover(null)} onClick={()=>{if(hover)setSelected(hover);}} onKeyDown={e=>{if(!["ArrowLeft","ArrowRight","Home","End"].includes(e.key))return;e.preventDefault();const all=index.data!.dates.filter(d=>dates.includes(d)),current=all.indexOf(activeDate),next=e.key==="Home"?0:e.key==="End"?all.length-1:Math.max(0,Math.min(all.length-1,current+(e.key==="ArrowRight"?1:-1)));setSelected(all[next]);setHover(null);}}>
      {[0,1,2,3].map(i=>{const n=low+(high-low)*i/3;return <g key={i}><line x1={left} x2={right} y1={y(n)} y2={y(n)} stroke="#2c3c54"/><text x={left-8} y={y(n)+4} textAnchor="end" fill="#8fa7c8" fontSize="12">{fmt(n,0)}</text></g>;})}
      {candles.map((p,i)=>p?<g key={p.date}><line x1={x(i)} x2={x(i)} y1={y(p.high)} y2={y(p.low)} stroke={p.close>=p.open?"#f17d86":"#57c3a5"} strokeWidth="1.5"/><rect x={x(i)-step*.27} y={y(Math.max(p.open,p.close))} width={step*.54} height={Math.max(2,y(Math.min(p.open,p.close))-y(Math.max(p.open,p.close)))} fill={p.close>=p.open?"#f17d86":"#57c3a5"}/></g>:<g key={index.data!.dates.filter(d=>dates.includes(d))[i]}><rect x={left+i*step} y="18" width={step} height="242" fill="#b69b64" opacity=".08"/><title>指数行情缺失，未连接K线</title></g>)}
      <line x1={left} x2={right} y1="258" y2="258" stroke="#3b506b"/><text x={left} y="277" fill="#a8c5ec" fontSize="12">市场情绪分 / 100</text>
      {[0,50,100].map(n=><g key={n}><line x1={left} x2={right} y1={scoreY(n)} y2={scoreY(n)} stroke="#26374e"/><text x={left-8} y={scoreY(n)+4} textAnchor="end" fill="#8fa7c8" fontSize="11">{n}</text></g>)}
      <path d={scorePath} fill="none" stroke="#87b6ff" strokeWidth="2.2"/>{scorePoints.map((s,i)=>s!==null&&<circle key={i} cx={x(i)} cy={scoreY(s)} r="2.8" fill="#a9cdff"/>)}
      {index.data.dates.filter(d=>dates.includes(d)).map((d,i)=>(i%Math.max(1,Math.ceil(candles.length/7))===0||i===candles.length-1)&&<text key={d} x={x(i)} y="369" textAnchor="middle" fill="#91a9c8" fontSize="11">{d.slice(5)}</text>)}
      {activeIndex>=0&&dates.includes(activeDate)&&<line x1={x(index.data.dates.filter(d=>dates.includes(d)).indexOf(activeDate))} x2={x(index.data.dates.filter(d=>dates.includes(d)).indexOf(activeDate))} y1="16" y2="340" stroke="#bacde7" strokeDasharray="4 5" opacity=".7"/>}
    </svg>}
    <p className="environment-caption">K线为上证综指真实开高低收；蓝线为独立的全市场规则评分。指向日期可查看对应指标，点击K线可固定日期。缺失数据不补值、不跨缺口连线。</p>
    <div className="environment-validation"><div className="environment-validation-title"><b>市场环境历史检验</b><span>复用上方已载入的近20日数据，无需再读取80日全市场行情</span></div>{validation?<><p>可比样本 {validation.eligible}/{validation.requested} 日；排除 {validation.excluded} 日。仅比较当日收盘评分与下一交易日市场表现。</p><div className="environment-buckets">{validation.buckets.map(b=><div key={b.name}><b>{b.name}</b><small>{b.count} 日</small><span>次日等权涨幅 {signed(b.averageNextDay)}</span><span>次日正收益日占比 {b.positiveNextDay==null?"样本不足":`${fmt(b.positiveNextDay,1)}%`}</span><span>次日上涨股票占比 {b.averageNextBreadth==null?"样本不足":`${fmt(b.averageNextBreadth,1)}%`}</span></div>)}</div><small>{validation.note}</small></>:<p>市场数据载入后显示检验结果。</p>}</div>
  </section>;
}
