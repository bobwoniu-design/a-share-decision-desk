import type {DecisionDay,DecisionOverview,MarketDaySummary,MarketDecision} from "./decision-engine";

type Sample={date:string;score:number;nextDate:string;nextEqualWeight:number;nextUpRate:number};
const avg=(n:number[])=>n.length?n.reduce((a,b)=>a+b,0)/n.length:null;
export function marketValidation(days:DecisionDay[],overview:DecisionOverview,warmup=20){
  const history=overview.market.history,samples:Sample[]=[];
  for(let i=warmup-1;i<days.length-1;i++){
    const score=history[i]?.score,next=days[i+1];
    if(score===null||score===undefined||next.partial||next.prices.length<days[i].prices.length*.9)continue;
    samples.push({date:days[i].date,score,nextDate:next.date,nextEqualWeight:avg(next.prices.map(p=>p.pct))??0,nextUpRate:next.prices.filter(p=>p.pct>0).length/next.prices.length*100});
  }
  const bucket=(name:string,low:number,high:number)=>{const rows=samples.filter(s=>s.score>=low&&s.score<high);return {name,count:rows.length,averageNextDay:avg(rows.map(s=>s.nextEqualWeight)),positiveNextDay:rows.length?rows.filter(s=>s.nextEqualWeight>0).length/rows.length*100:null,averageNextBreadth:avg(rows.map(s=>s.nextUpRate))};};
  return {asOf:overview.date,requested:60,warmup,available:days.length,eligible:samples.length,excluded:Math.max(0,Math.min(60,days.length-warmup)-samples.length),
    buckets:[bucket("弱势 0–44",0,45),bucket("中性 45–64",45,65),bucket("强势 65–100",65,101)],
    observations:samples.slice(-60),note:"仅比较收盘规则分与下一交易日全市场等权涨幅、上涨比例。并非盘中信号回测、可成交收益或策略胜率；停牌、涨跌停和交易成本未用于构造交易。"};
}

/** A fast, clearly labelled small-sample readout from the same dated inputs as the homepage score. */
export function marketValidationFromSummaries(days:MarketDaySummary[],history:MarketDecision["history"]){
  const scores=new Map(history.map(h=>[h.date,h.score])),samples:Sample[]=[];
  for(let i=0;i<days.length-1;i++){
    const today=days[i],next=days[i+1],score=scores.get(today.date);
    if(score===null||score===undefined||today.partial||next.partial||today.total===0||next.total<today.total*.9||next.equalWeightPct===null)continue;
    samples.push({date:today.date,score,nextDate:next.date,nextEqualWeight:next.equalWeightPct,nextUpRate:next.up/next.total*100});
  }
  const bucket=(name:string,low:number,high:number)=>{const rows=samples.filter(s=>s.score>=low&&s.score<high),enough=rows.length>=3;return {name,count:rows.length,averageNextDay:enough?avg(rows.map(s=>s.nextEqualWeight)):null,positiveNextDay:enough?rows.filter(s=>s.nextEqualWeight>0).length/rows.length*100:null,averageNextBreadth:enough?avg(rows.map(s=>s.nextUpRate)):null};};
  return {requested:Math.max(0,days.length-1),available:days.length,eligible:samples.length,excluded:Math.max(0,days.length-1-samples.length),
    buckets:[bucket("弱势 0–44",0,45),bucket("中性 45–64",45,65),bucket("强势 65–100",65,101)],observations:samples,
    note:"近20日快速样本；每组不足3日不显示均值。仅比较当日收盘规则分与下一交易日全市场等权涨幅、上涨比例，不是交易策略胜率。"};
}
