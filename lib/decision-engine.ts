import type { Row } from "./market-data";
import type { SectorGroup } from "./sectors";
import type { Phase } from "./minute-engine";

export type Price = {code:string;close:number;preClose:number;pct:number;amount:number};
export type DecisionDay={date:string;prices:Price[];groups:SectorGroup[];limits:Row[]|null;partial?:boolean;asOf?:string};
export type Factor={name:string;score:number|null;weight:number;detail:string};
export type CoreStock={code:string;name:string;sector:string;score:number|null;delta:number|null;roles:string[];factors:Factor[];pct:number;close:number;preClose:number;height:number|null;amountYi:number;return5:number|null};
export type IndustryCheck={name:string;result:"通过"|"未通过"|"待核验";detail:string};
export type IndustryQualification={status:"通过"|"未通过"|"待核验";checks:IndustryCheck[]};
export type ScoredSector={name:string;score:number|null;delta:number|null;rank:number;phase:Phase;label:string;qualification:IndustryQualification;factors:Factor[];history:{date:string;score:number|null;phase:Phase}[];cores:CoreStock[];coverage:number;total:number;averagePct:number|null;amountYi:number;topDays:number};
export type MarketDecision={score:number|null;delta:number|null;cycle:string;previousCycle:string|null;phase:Phase;earning:string;risk:string;posture:string;factors:Factor[];promotion:{value:number|null;advanced:number;total:number};highPremium:{value:number|null;matched:number;total:number};history:{date:string;score:number|null;cycle:string;phase:Phase}[]};
export type DecisionOverview={date:string;asOf:string;mode:"close"|"live";market:MarketDecision;sectors:ScoredSector[];cores:CoreStock[];warnings:string[];fetchedAt:string;version:string;dates:string[]};
const clamp=(n:number)=>Math.max(0,Math.min(100,n));
const norm=(n:number,min:number,max:number)=>clamp((n-min)/(max-min)*100);
const mean=(v:number[])=>v.length?v.reduce((s,n)=>s+n,0)/v.length:0;
const fmt=(v:number|null,n=1)=>v===null?"缺失":v.toFixed(n);
const qualificationCheck=(name:string,passed:boolean|null,detail:string):IndustryCheck=>({name,result:passed===null?"待核验":passed?"通过":"未通过",detail});
function industryQualification(g:SectorGroup,day:DecisionDay,topDays:number,complete:boolean,relativeRank:number|null,relativeTotal:number):IndustryQualification{
  const highs=g.members.filter(m=>m.limit==="U").map(m=>m.height).filter((h):h is number=>h!==null&&Number.isInteger(h)&&h>=1);
  const maxHeight=Math.max(0,...highs),tiers=new Set(highs).size;
  const checks=[
    qualificationCheck("行情覆盖",g.total?g.traded>=3&&g.traded/g.total>=.8:null,`有行情 ${g.traded}/${g.total}，要求至少3只且覆盖80%`),
    qualificationCheck("当日相对强度",relativeRank===null||g.averagePct===null?null:g.averagePct>0&&relativeRank<=Math.ceil(relativeTotal*.2),`等权涨幅 ${fmt(g.averagePct,2)}% · 同源第${relativeRank??"—"}/${relativeTotal}，要求前20%且上涨`),
    qualificationCheck("持续性",complete?topDays>=3:null,`前5日涨幅前十 ${complete?topDays:"缺失"}/5，要求至少3日`),
    qualificationCheck("内部广度",g.traded?g.up/g.traded>=.55:null,`上涨 ${g.up}/${g.traded}，要求至少55%`),
    qualificationCheck("涨停梯队",day.partial||g.limitUp===null?null:g.limitUp>=2&&maxHeight>=2&&tiers>=2,day.partial?"盘中封板为估算，收盘名单核实前不确认资格":g.limitUp===null?"官方涨停名单缺失":"涨停 "+g.limitUp+` 只 · 最高 ${maxHeight} 板 · ${tiers} 层，要求至少2只、最高2板且形成2层`)
  ];
  return {status:checks.some(c=>c.result==="未通过")?"未通过":checks.every(c=>c.result==="通过")?"通过":"待核验",checks};
}
function industryLabel(score:number|null,phase:Phase,qualification:IndustryQualification,g:SectorGroup){
  if(score===null)return "待数据";
  if(phase==="转弱"||score<40)return "退潮";
  if(qualification.status==="通过")return "主线初筛";
  if(qualification.status==="待核验")return "待梯队核验";
  return qualification.checks.filter(c=>c.result==="通过").length>=3&&(g.averagePct??0)>0?"主线候选":"轮动";
}
export function weightedScore(factors:Factor[],minimum=.8){const known=factors.filter(f=>f.score!==null&&Number.isFinite(f.score)),weight=known.reduce((s,f)=>s+f.weight,0),total=factors.reduce((s,f)=>s+f.weight,0);return !total||weight/total<minimum?null:Math.round(known.reduce((s,f)=>s+clamp(f.score!)*f.weight,0)/weight);}
function phaseFor(score:number|null,prev:number|null,prior:Phase):Phase{
  if(score===null)return "待数据";const delta=prev===null?0:score-prev;
  if(score<35||delta<=-15)return "转弱";
  if(prev!==null&&delta<=-7)return "分歧";
  if(["转弱","分歧"].includes(prior)&&delta>=3)return "承接";
  if(prior==="承接"&&score>=65&&delta>=3)return "转强";
  if(["转强","一致","加速"].includes(prior)&&score>=80&&delta>=4)return "加速";
  return score>=65?"一致":score>=45?"观察":"分歧";
}
function marketFactors(day:DecisionDay,previous:DecisionDay|undefined,past:DecisionDay[]){
  const list=day.limits,up=list?.filter(r=>r.limit==="U"),down=list?.filter(r=>r.limit==="D"),broken=list?.filter(r=>r.limit==="Z");
  const yesterday=previous?.limits?.filter(r=>r.limit==="U"),prices=new Map(day.prices.map(p=>[p.code,p]));
  const matched=yesterday?.map(r=>prices.get(String(r.ts_code))).filter((p):p is Price=>!!p)??[];
  const premium=yesterday?.length&&matched.length/yesterday.length>=.9?mean(matched.map(p=>p.pct)):null;
  const advanced=yesterday&&up?up.filter(r=>Number(r.limit_times)>=2&&yesterday.some(p=>p.ts_code===r.ts_code)).length:0;
  const promotion={value:yesterday?.length&&list!==null?advanced/yesterday.length*100:null,advanced,total:yesterday?.length??0};
  const highs=yesterday?.filter(r=>Number(r.limit_times)>=3)??[],highMatched=highs.map(r=>prices.get(String(r.ts_code))).filter((p):p is Price=>!!p);
  const highPremium={value:highs.length&&highMatched.length/highs.length>=.9?mean(highMatched.map(p=>p.pct)):null,matched:highMatched.length,total:highs.length};
  const br=up&&broken&&up.length+broken.length?broken.length/(up.length+broken.length)*100:null;
  const amount=day.prices.reduce((s,p)=>s+p.amount,0),avg=past.length>=5?mean(past.slice(-5).map(d=>d.prices.reduce((s,p)=>s+p.amount,0))):null;
  const amountRatio=avg&&avg>0&&!day.partial?amount/avg:null;
  const factors:Factor[]=[
    {name:"赚钱广度",weight:25,score:day.prices.length?day.prices.filter(p=>p.pct>0).length/day.prices.length*100:null,detail:`上涨 ${day.prices.filter(p=>p.pct>0).length}/${day.prices.length}`},
    {name:"涨跌停平衡",weight:15,score:up&&down?up.length/(up.length+down.length+10)*100:null,detail:`涨停${up?.length??"—"} / 跌停${down?.length??"—"}`},
    {name:"封板稳定",weight:10,score:br===null?null:100-br,detail:`炸板率 ${fmt(br)}%`},
    {name:"昨日涨停溢价",weight:15,score:premium===null?null:norm(premium,-3,5),detail:`${fmt(premium,2)}% · ${matched.length}/${yesterday?.length??0} 只`},
    {name:"连板晋级",weight:15,score:promotion.value,detail:`昨日涨停今天再封板 ${advanced}/${promotion.total}`},
    {name:"空间高度",weight:10,score:up?norm(Math.max(0,...up.map(r=>Number(r.limit_times)||0)),1,8):null,detail:`最高 ${up?Math.max(0,...up.map(r=>Number(r.limit_times)||0)):"—"} 板`},
    {name:"成交活跃",weight:10,score:amountRatio===null?null:norm(amountRatio,.6,1.5),detail:day.partial?"盘中总额不与完整日比较，不计此项":`较前5日均额 ${fmt(amountRatio,2)}倍`}
  ];
  return {factors,promotion,highPremium,br,premium};
}
function stockReturn(history:Map<string,Price>[],code:string,n:number){
  const rows=history.slice(-n);if(rows.length!==n)return null;
  const p=rows.map(d=>d.get(code));if(p.some(p=>!p))return null;
  // Chained daily pct is adjusted for each day's official pre-close (avoids split jumps).
  return (p.reduce((a,p)=>a*(1+p!.pct/100),1)-1)*100;
}
function sectorFactors(g:SectorGroup,day:DecisionDay,past:DecisionDay[],topHistory:Map<string,number>[]){
  const histories=past.slice(-5).map(d=>({day:d,g:d.groups.find(h=>h.name===g.name)}));
  const previous=histories.at(-1)?.g,avg=histories.length===5&&histories.every(h=>h.g)?mean(histories.map(h=>h.g!.amountYi)):null;
  const ratio=avg&&avg>0&&!day.partial?g.amountYi/avg:null;
  const total=day.groups.reduce((s,h)=>s+h.amountYi,0),share=total>0?g.amountYi/total:0;
  const oldShares=histories.map(h=>h.g?h.g.amountYi/Math.max(.001,h.day.groups.reduce((s,a)=>s+a.amountYi,0)):null);
  const oldShare=oldShares.length===5&&oldShares.every(v=>v!==null)?mean(oldShares as number[]):null;
  const shareRatio=oldShare&&oldShare>0?share/oldShare:null;
  const rel=g.averagePct===null?null:g.averagePct-mean(day.prices.map(p=>p.pct));
  const topDays=topHistory.slice(-5).filter(r=>(r.get(g.name)??999)<=10).length;
  const positiveDays=histories.filter(h=>h.g?.averagePct!==null&&h.g?.averagePct!==undefined&&h.g.averagePct>mean(h.day.prices.map(p=>p.pct))).length;
  const leaderHigh=g.members.filter(m=>m.limit==="U").map(m=>m.height??0),tiers=new Set(leaderHigh);
  const touched=(g.limitUp??0)+(g.broken??0),seal=touched?(g.limitUp??0)/touched*100:null;
  const prevLeaders=previous?.members.filter(m=>m.leaderRank!==null)??[],held=prevLeaders.map(m=>g.members.find(x=>x.code===m.code)?.quote).filter(p=>!!p);
  const retention=prevLeaders.length&&held.length===prevLeaders.length?held.filter(p=>p!.pct>=0).length/held.length*100:null;
  const factors:Factor[]=[
    {name:"持续性",weight:25,score:histories.length===5&&histories.every(h=>h.g)?(positiveDays/5*60+topDays/5*40):null,detail:`前5日强于市场 ${positiveDays}/5 · 相对涨幅前十 ${topDays}/5`},
    {name:"相对强度",weight:25,score:rel===null?null:.6*norm(rel,-2,3)+.4*g.up/Math.max(1,g.traded)*100,detail:`超额涨幅 ${fmt(rel,2)}% · 上涨 ${g.up}/${g.traded}`},
    {name:"成交活跃",weight:20,score:shareRatio===null?null:day.partial?norm(shareRatio,.6,1.8):ratio===null?null:.5*norm(ratio,.6,1.8)+.5*norm(shareRatio,.6,1.8),detail:`全市场成交占比 ${(share*100).toFixed(2)}% · 占比较前5日 ${fmt(shareRatio,2)}倍${day.partial?"（盘中）":` · 均额${fmt(ratio,2)}倍`}`},
    {name:"梯队",weight:15,score:g.limitUp===null?null:.45*norm(Math.max(0,...leaderHigh),0,5)+.3*norm(tiers.size,0,3)+.25*norm(g.limitUp/Math.max(1,g.traded)*100,0,8),detail:`最高${Math.max(0,...leaderHigh)}板 · ${tiers.size}层 · ${g.limitUp??"—"}涨停`},
    {name:"抗分歧",weight:15,score:retention===null&&seal===null?null:retention===null?seal:seal===null?retention:retention*.6+seal*.4,detail:`昨日梯队非负 ${fmt(retention)}% · 封板率 ${fmt(seal)}%`}
  ];return {factors,topDays,complete:histories.length===5&&histories.every(h=>h.g)&&topHistory.length>=5};
}
function coreScores(g:SectorGroup,history:Map<string,Price>[],sectorScore:number|null,previous:CoreStock[]):CoreStock[]{
  const eligible=g.members.filter(m=>m.quote&&!/^(\*?ST|S\*?ST|退)/i.test(m.name));
  const amounts=eligible.map(m=>m.quote!.amount).sort((a,b)=>a-b);
  const maximum=Math.max(1,...eligible.map(m=>m.height??0));
  const result=eligible.map(m=>{
    const q=m.quote!,r5=stockReturn(history,m.code,5),valid=history.slice(-5).map(d=>d.get(m.code));
    const consistency=valid.length===5&&valid.every(p=>!!p)?valid.filter(p=>p!.pct>0).length/5*100:null;
    const liquidity=amounts.length>1?amounts.filter(a=>a<q.amount).length/(amounts.length-1)*100:50;
    const relative=g.averagePct===null?null:q.pct-g.averagePct;
    const factors:Factor[]=[{name:"板块地位",weight:25,score:sectorScore,detail:`板块综合 ${fmt(sectorScore,0)}`},{name:"梯队地位",weight:20,score:m.height===null?null:(m.height/maximum*100),detail:`${m.height??"—"}板 / 板块最高${maximum}板`},{name:"成交占位",weight:20,score:liquidity,detail:`板块成交 ${(q.amount/Math.max(1,g.amountYi*1e8)*100).toFixed(1)}%`},{name:"相对强势",weight:20,score:relative===null?null:norm(relative,-3,7),detail:`相对板块 ${fmt(relative,2)}%`},{name:"趋势持续",weight:15,score:r5===null||consistency===null?null:norm(r5,-5,20)*.6+consistency*.4,detail:`5日累计 ${fmt(r5,2)}%`}];
    const score=weightedScore(factors),old=previous.find(p=>p.code===m.code)?.score;
    return {code:m.code,name:m.name,sector:g.name,score,delta:score!==null&&old!=null?score-old:null,roles:[] as string[],factors,pct:q.pct,close:q.close,preClose:q.preClose,height:m.height,amountYi:q.amount/1e8,return5:r5};
  }).sort((a,b)=>(b.score??-1)-(a.score??-1)||b.amountYi-a.amountYi||a.code.localeCompare(b.code));
  const rising=result.filter(p=>p.pct>0&&p.score!==null),leader=rising.filter(p=>(p.height??0)>=2).sort((a,b)=>(b.height??0)-(a.height??0)||(b.score??0)-(a.score??0))[0];
  const capacity=result.filter(p=>p.score!==null&&p.pct>=0).slice().sort((a,b)=>b.amountYi-a.amountYi)[0];
  const trend=rising.filter(p=>p.return5!==null&&p.return5>0).sort((a,b)=>(b.return5??0)-(a.return5??0))[0];
  const elastic=rising.filter(p=>/^(30|68|92|83|87)/.test(p.code)).sort((a,b)=>b.pct-a.pct)[0];
  if(leader)leader.roles.push("龙头候选");if(capacity)capacity.roles.push("容量中军候选");if(trend)trend.roles.push("趋势核心候选");if(elastic)elastic.roles.push("弹性核心候选");
  const catchup=rising.find(p=>!p.roles.length&&sectorScore!==null&&sectorScore>=65&&p.return5!==null&&p.return5<(trend?.return5??0)&&p.pct>(g.averagePct??0));if(catchup)catchup.roles.push("补涨候选");
  result.forEach(p=>{if(!p.roles.length)p.roles.push("观察成员");});return result;
}
export function buildDecision(days:DecisionDay[],warnings:string[]=[]):DecisionOverview{
  if(!days.length)throw new Error("缺少市场输入");
  if(days.some((d,i)=>i>0&&d.date<=days[i-1].date))throw new Error("市场输入必须按交易日递增且唯一");
  let sectors:ScoredSector[]=[],market:MarketDecision|null=null;
  const priceHistory=days.map(d=>new Map(d.prices.map(p=>[p.code,p])));
  const marketHistory:MarketDecision["history"]=[],rankHistory:Map<string,number>[]=[];
  for(let i=0;i<days.length;i++){
    const day=days[i],past=days.slice(0,i),mf=marketFactors(day,days[i-1],past),score:number|null=weightedScore(mf.factors);
    const lastMarket=market as MarketDecision|null;
    const prev:number|null=lastMarket?.score??null,delta:number|null=score!==null&&prev!==null?score-prev:null;
    const phase=phaseFor(score,prev,lastMarket?.phase??"观察");
    const cycle=score===null?"待数据":score<30?"冰点":delta!==null&&delta<=-10?"退潮":score>=80?"高潮":delta!==null&&delta>=8&&prev!==null&&prev<55?"修复":score>=60?"发酵":delta!==null&&delta<0?"分歧":"修复";
    const high=mf.highPremium.value,risk=mf.highPremium.total>0&&high===null||mf.br===null?"待数据":(high!==null&&high<0)||(mf.br??0)>40?"高":(high!==null&&high<2)||(mf.br??0)>25?"中":"低";
    marketHistory.push({date:day.date,score,cycle,phase});
    market={score,delta,cycle,previousCycle:lastMarket?.cycle??null,phase,earning:score===null?"待数据":score>=65?"偏强":score>=45?"分化":"偏弱",risk,posture:score===null?"数据不足，暂停条件提示":score<45||risk==="高"?"防守观察，优先核查持仓失效条件":score>=80?"情绪偏热，等待分歧后的结构确认":"聚焦高分板块核心，等待分钟条件",factors:mf.factors,promotion:mf.promotion,highPremium:mf.highPremium,history:[...marketHistory]};
    const ranked=day.groups.filter(g=>g.name!=="未分类"&&g.traded>=3).slice().sort((a,b)=>(b.averagePct??-999)-(a.averagePct??-999)||(b.limitUp??0)-(a.limitUp??0));
    const currentRanks=new Map(ranked.map((g,j)=>[g.name,j+1]));
    const next=day.groups.map(g=>{
      const old=sectors.find(s=>s.name===g.name),sf=sectorFactors(g,day,past,rankHistory),sc=g.name!=="未分类"&&g.traded>=3&&g.traded/g.total>=.8?weightedScore(sf.factors):null,ph=phaseFor(sc,old?.score??null,old?.phase??"观察");
      const qualification=industryQualification(g,day,sf.topDays,sf.complete,currentRanks.get(g.name)??null,ranked.length);
      return {name:g.name,score:sc,delta:sc!==null&&old?.score!=null?sc-old.score:null,rank:0,phase:ph,label:industryLabel(sc,ph,qualification,g),qualification,factors:sf.factors,history:[...(old?.history??[]),{date:day.date,score:sc,phase:ph}],cores:i>=days.length-2?coreScores(g,priceHistory.slice(0,i+1),sc,old?.cores??[]):[],coverage:g.traded,total:g.total,averagePct:g.averagePct,amountYi:g.amountYi,topDays:sf.topDays};
    }).sort((a,b)=>(b.score??-1)-(a.score??-1)||b.amountYi-a.amountYi||a.name.localeCompare(b.name));
    next.forEach((s,j)=>s.rank=j+1);sectors=next;
    rankHistory.push(new Map(ranked.map((g,j)=>[g.name,j+1])));
  }
  const final=days.at(-1)!;
  const cores=sectors.filter(s=>s.score!==null&&s.score>=65).flatMap(s=>s.cores.filter(c=>c.score!==null&&c.score>=65&&c.pct>0).slice(0,3)).sort((a,b)=>(b.score??0)-(a.score??0)||b.amountYi-a.amountYi).slice(0,10);
  return {date:final.date,asOf:final.asOf??`${final.date} 15:00`,mode:final.partial?"live":"close",market:market!,sectors,cores,warnings,fetchedAt:new Date().toISOString(),version:"P0.2",dates:days.map(d=>d.date)};
}
