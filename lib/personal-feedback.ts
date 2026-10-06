import {calculate,type Ledger,type Trade,type Closed} from "./ledger.ts";

export type FeedbackBucket={label:string;count:number;wins:number;net:number;average:number;winRate:number|null};
export type FeedbackItem={id:string;date:string;name:string;code:string;issues:string[]};
export type PersonalFeedback={
  recordedTrades:number;reasonRecorded:number;planRecorded:number;disciplineRecorded:number;
  closedCycles:number;excludedOpeningCycles:number;confirmedReviews:number;tradingDays:number;
  buckets:FeedbackBucket[];pending:FeedbackItem[];sampleNote:string;
};

function bucket(label:string,items:Closed[]):FeedbackBucket{
  const net=items.reduce((sum,item)=>sum+item.pnl,0);
  return {label,count:items.length,wins:items.filter(item=>item.pnl>0).length,net,average:items.length?net/items.length:0,winRate:items.length?items.filter(item=>item.pnl>0).length/items.length*100:null};
}

export function personalFeedback(ledger:Ledger):PersonalFeedback{
  const trades=ledger.trades.filter(t=>!t.voided&&t.side!=="opening");
  const closed=calculate(ledger.trades).closed;
  const comparable=closed.filter(c=>!c.opening);
  const classified={
    "按计划盈利":comparable.filter(c=>c.discipline==="按计划"&&c.planRecorded&&c.pnl>0),
    "按计划亏损":comparable.filter(c=>c.discipline==="按计划"&&c.planRecorded&&c.pnl<0),
    "偏离计划盈利":comparable.filter(c=>c.discipline==="临时操作"&&c.pnl>0),
    "偏离计划亏损":comparable.filter(c=>c.discipline==="临时操作"&&c.pnl<0),
    "待确认":comparable.filter(c=>c.pnl===0||c.discipline==="未记录"||c.discipline==="按计划"&&!c.planRecorded),
  };
  const pending=trades.flatMap((t:Trade)=>{
    const issues=[...(!t.reason.trim()?["买卖理由未记录"]:[]),...(!t.plan.trim()?["事前计划未记录"]:[]),...(t.discipline==="未记录"?["执行自评未记录"]:[])];
    return issues.length?[{id:t.id,date:t.time.slice(0,10),name:t.name,code:t.code,issues}]:[];
  }).sort((a,b)=>b.date.localeCompare(a.date));
  const tradingDays=new Set(trades.map(t=>t.time.slice(0,10))).size;
  const confirmedReviews=Object.values(ledger.reviews).filter(r=>r.status==="confirmed"&&trades.some(t=>t.time.startsWith(r.date))).length;
  return {
    recordedTrades:trades.length,reasonRecorded:trades.filter(t=>!!t.reason.trim()).length,planRecorded:trades.filter(t=>!!t.plan.trim()).length,disciplineRecorded:trades.filter(t=>t.discipline!=="未记录").length,
    closedCycles:comparable.length,excludedOpeningCycles:closed.length-comparable.length,confirmedReviews,tradingDays,
    buckets:Object.entries(classified).map(([label,items])=>bucket(label,items)),pending,
    sampleNote:comparable.length<10?`可比较的完整交易周期仅 ${comparable.length} 个，暂不能根据分组胜率判断哪种操作更有效。`:"分组结果是历史描述，不代表相同操作未来仍有同样结果。",
  };
}
