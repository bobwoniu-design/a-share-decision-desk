export type CandidateRisk={level:"注意"|"待核验"|"一般";flags:string[];asOf:string};
export function assessCandidateRisk(input:{pct:number;amountYi:number;height:number|null;limit:string|null;openTimes:number|null;asOf:string}):CandidateRisk{
  const flags:string[]=[];
  if(input.amountYi<1)flags.push("成交额不足1亿元，流动性偏低");
  if(input.pct>=8)flags.push("当日涨幅较大，追高风险");
  if((input.height??0)>=5)flags.push("高位连板，分歧风险");
  if(input.limit==="U")flags.push(input.openTimes===0?"收盘封板且未记录开板，实际可成交性待核验":"收盘涨停，实际可成交性待核验");
  if(input.limit==="D")flags.push("收盘跌停，流动性风险");
  // A daily snapshot cannot establish intraday availability or an actual fill.
  flags.push("停复牌与实际可成交性需人工核验");
  return {level:flags.length>1?"注意":"待核验",flags,asOf:input.asOf};
}
