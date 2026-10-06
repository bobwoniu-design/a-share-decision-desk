import type {Row} from "./market-data";

export type BoardSector={code:string;name:string;rank:number;limitUp:number;connected:number;days:number;upStat:string;pct:number|null};
export type BoardEvidence={
  date:string;limitRows:number;ladderRows:number;sectorRows:number;
  ladder:{code:string;name:string;height:number}[];
  sectors:BoardSector[];
  discrepancies:{missingInLadder:number;extraInLadder:number;heightMismatch:number};
  seal:{known:number;neverOpened:number;opened:number;orderAmountKnown:number;firstTimeKnown:number};
  warnings:string[];
};
const number=(v:unknown)=>v===null||v===undefined||v===""?null:Number.isFinite(Number(v))?Number(v):null;
function validRows(rows:Row[],date:string,label:string){
  const key=date.replaceAll("-",""),seen=new Set<string>();
  for(const row of rows){
    const code=String(row.ts_code??"");
    if(String(row.trade_date)!==key||!code||seen.has(code))throw new Error(`${label}日期、代码或去重校验失败`);
    seen.add(code);
  }
}
export function boardEvidence(date:string,limits:Row[],steps:Row[]|null,sectors:Row[]|null):BoardEvidence{
  validRows(limits,date,"涨跌停列表");
  if(steps)validRows(steps,date,"连板天梯");
  if(sectors)validRows(sectors,date,"最强板块");
  const warnings:string[]=[];
  const expected=new Map(limits.filter(r=>r.limit==="U"&&(number(r.limit_times)??0)>=2).map(r=>[String(r.ts_code),number(r.limit_times)!]));
  const ladder=steps?.map(r=>({code:String(r.ts_code),name:String(r.name??r.ts_code),height:number(r.nums)??0}))??[];
  if(steps&&ladder.some(r=>!Number.isInteger(r.height)||r.height<2))throw new Error("连板天梯含无效板数");
  const found=new Map(ladder.map(r=>[r.code,r.height]));
  const missingInLadder=steps?[...expected.keys()].filter(c=>!found.has(c)).length:0;
  const extraInLadder=steps?[...found.keys()].filter(c=>!expected.has(c)).length:0;
  const heightMismatch=steps?[...found].filter(([c,h])=>expected.has(c)&&expected.get(c)!==h).length:0;
  if(!steps)warnings.push("连板天梯不可用，交叉核验保持未知");
  else if(missingInLadder||extraInLadder||heightMismatch)warnings.push("连板天梯与涨跌停列表不一致，不能确认完整梯队");
  if(!sectors)warnings.push("同花顺最强板块榜不可用，第三方板块参照保持未知");
  const ranked=sectors?.map(r=>({code:String(r.ts_code),name:String(r.name??r.ts_code),rank:number(r.rank)??999,
    limitUp:number(r.up_nums)??0,connected:number(r.cons_nums)??0,days:number(r.days)??0,upStat:String(r.up_stat??""),pct:number(r.pct_chg)})).sort((a,b)=>a.rank-b.rank)??[];
  if(ranked.some(r=>r.rank<1||r.limitUp<0||r.connected<0||r.days<0))throw new Error("最强板块榜数字校验失败");
  const up=limits.filter(r=>r.limit==="U");
  const known=up.filter(r=>number(r.open_times)!==null);
  const seal={known:known.length,neverOpened:known.filter(r=>number(r.open_times)===0).length,opened:known.filter(r=>(number(r.open_times)??0)>0).length,
    orderAmountKnown:up.filter(r=>number(r.fd_amount)!==null).length,firstTimeKnown:up.filter(r=>r.first_time!==null&&r.first_time!==undefined&&r.first_time!=="").length};
  if(up.length&&known.length/up.length<.9)warnings.push("封板开板次数覆盖不足90%，封板质量仅作参考");
  return {date,limitRows:limits.length,ladderRows:steps?.length??0,sectorRows:sectors?.length??0,ladder,sectors:ranked,
    discrepancies:{missingInLadder,extraInLadder,heightMismatch},seal,warnings};
}
