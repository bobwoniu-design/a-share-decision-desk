export type CandidateRisk={level:"注意"|"待核验"|"一般";flags:string[];asOf:string};
export function assessCandidateRisk(input:{pct:number;amountYi:number;height:number|null;limit:string|null;limitDataReady:boolean;openTimes:number|null;asOf:string}):CandidateRisk{
  const flags:string[]=[];
  if(!input.limitDataReady)flags.push("涨跌停名单未核验");
  if(input.amountYi<1)flags.push("成交额不足1亿元，流动性偏低");
  if(input.pct>=8)flags.push("当日涨幅较大，追高风险");
  if((input.height??0)>=5)flags.push("高位连板，分歧风险");
  if(input.limit==="U")flags.push(input.openTimes===0?"收盘封板且未记录开板，实际可成交性待核验":"收盘涨停，实际可成交性待核验");
  if(input.limit==="D")flags.push("收盘跌停，流动性风险");
  // A stock with a dated daily quote is not generically labelled suspended.
  const hasRisk=input.amountYi<1||input.pct>=8||(input.height??0)>=5||input.limit==="U"||input.limit==="D";
  return {level:hasRisk?"注意":flags.length?"待核验":"一般",flags,asOf:input.asOf};
}
