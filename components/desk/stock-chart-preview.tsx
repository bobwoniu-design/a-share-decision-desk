"use client";
import {useState} from "react";
import {CandleChart} from "./candle-chart";
import {StockChartTabs} from "./stock-chart-tabs";
import {useDecision} from "./decision";
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from "@/components/ui/dialog";
import type {Candle} from "@/lib/candle-data";
import type {HistoryStock} from "./history-charts";

export type StockCandleBatch={date:string;mode:"close"|"live";dates:string[];byCode:Record<string,Candle[]>};
export function StockChartPreview({stock,date,mode,themeCode,batch,fetchSingle=false}:{stock:HistoryStock;date:string;mode:"close"|"live";themeCode?:string;batch?:StockCandleBatch|null;fetchSingle?:boolean}){
  const [open,setOpen]=useState(false);
  const single=useDecision<StockCandleBatch>(fetchSingle?`/api/market/stock-candles?date=${date}&mode=${mode}&codes=${stock.code}`:null);
  const data=batch?.date===date&&batch.mode===mode?batch:single.data?.date===date&&single.data.mode===mode?single.data:null;
  const points=data?.byCode[stock.code];
  return <>
    <button type="button" className="funnel-candle-trigger" onClick={()=>setOpen(true)} aria-label={`查看${stock.name}分时和60日K线`} aria-haspopup="dialog">
      {points?.length?<CandleChart dates={data!.dates} points={points} mini/>:<span className="funnel-candle-placeholder">{single.error?"K线暂不可用":"查看K线 ↗"}</span>}
    </button>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="dialog-body funnel-candle-dialog"><DialogHeader><DialogTitle>{stock.name} · 图表</DialogTitle><DialogDescription>切换分时与60日K线；点击日K蜡烛可查看对应日期的分时。</DialogDescription></DialogHeader>{open&&<StockChartTabs key={`${stock.code}:${date}`} stock={stock} date={date} marketMode={mode} themeCode={themeCode} showZoom={false}/>}</DialogContent></Dialog>
  </>;
}
