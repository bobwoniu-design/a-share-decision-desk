"use client";
import {useState} from "react";
import {Dialog,DialogContent,DialogDescription,DialogHeader,DialogTitle} from "@/components/ui/dialog";
import {InstrumentHistory,type HistoryStock} from "./history-charts";
import {MinuteDecision} from "./decision";

type ChartMode="minute"|"daily";
export function StockChartTabs({stock,date,marketMode="close",themeCode,initialMode="daily",showZoom=true}:{stock:HistoryStock;date:string;marketMode?:"close"|"live";themeCode?:string;initialMode?:ChartMode;showZoom?:boolean}){
  const [chartMode,setChartMode]=useState<ChartMode>(initialMode),[minuteDate,setMinuteDate]=useState(date),[zoomOpen,setZoomOpen]=useState(false);
  const minuteLive=marketMode==="live"&&minuteDate===date;
  const chooseDay=(day:string)=>{setMinuteDate(day);setChartMode("minute");};
  const chart=(modal:boolean)=><InstrumentHistory
    key={`${stock.code}:${chartMode}:${modal?"modal":"inline"}`}
    fixedMode={chartMode} stock={stock} date={date} live={chartMode==="minute"?minuteLive:marketMode==="live"}
    selectedMinuteDate={minuteDate} onMinuteDateChange={setMinuteDate} onDailyDateSelect={chooseDay}
    minutes={(s,d,showChart)=><MinuteDecision key={`${s?.code}:${d}:${minuteLive}:${themeCode??""}:${modal}`} stock={s} date={d} showChart={showChart} mode={minuteLive?"live":"close"} themeCode={themeCode} chartFirst allowChartDialog={false} compact={modal}/>}
  />;
  const tabs=<div className="stock-chart-toolbar"><div className="stock-chart-periods" role="tablist" aria-label={`${stock.name}图表周期`}><button type="button" role="tab" aria-selected={chartMode==="minute"} className={chartMode==="minute"?"active":""} onClick={()=>setChartMode("minute")}>分时</button><button type="button" role="tab" aria-selected={chartMode==="daily"} className={chartMode==="daily"?"active":""} onClick={()=>setChartMode("daily")}>日K · 60日</button></div><span>{chartMode==="minute"?`${minuteDate} · ${minuteLive?"盘中":"历史回放"}`:`截至 ${date} · 日线`}</span>{showZoom&&<button type="button" className="stock-chart-zoom" onClick={()=>setZoomOpen(true)} aria-haspopup="dialog" aria-expanded={zoomOpen}>放大图表 ↗</button>}</div>;
  return <section className="stock-chart-tabs" aria-label={`${stock.name}行情图表`}>
    {tabs}
    {chart(false)}
    {showZoom&&<Dialog open={zoomOpen} onOpenChange={setZoomOpen}><DialogContent className="dialog-body stock-chart-dialog"><DialogHeader><DialogTitle>{stock.name} · {stock.code}</DialogTitle><DialogDescription>分时与日K共用所选日期。点击日K蜡烛会切换到该日分时；数据缺失时不补画行情。</DialogDescription></DialogHeader>{zoomOpen&&<div className="stock-chart-modal-body"><div className="stock-chart-toolbar"><div className="stock-chart-periods" role="tablist" aria-label="弹窗图表周期"><button type="button" role="tab" aria-selected={chartMode==="minute"} className={chartMode==="minute"?"active":""} onClick={()=>setChartMode("minute")}>分时</button><button type="button" role="tab" aria-selected={chartMode==="daily"} className={chartMode==="daily"?"active":""} onClick={()=>setChartMode("daily")}>日K · 60日</button></div><span>{chartMode==="minute"?minuteDate:`截至 ${date}`}</span></div>{chart(true)}</div>}</DialogContent></Dialog>}
  </section>;
}
