import { decisionData } from "./decision-data";
import type { CoreStock, ScoredSector } from "./decision-engine";
import { auditThemeRows } from "./theme-quality";
import { themeOverview } from "./theme-data";
import type { ScoredTheme } from "./themes";
import { tushare } from "./tushare";
import {assessCandidateRisk,type CandidateRisk} from "./candidate-risk";

export type FunnelTheme={code:string;name:string;label:string;phase:string;score:number|null;rank:number|null;role:string};
export type FunnelCandidate={code:string;name:string;industry:string;industryLabel:string;industryPhase:string;theme:FunnelTheme|null;themeMatches:string[];role:string;positionScore:number|null;opportunityScore:number|null;action:string;status:"重点观察"|"条件观察"|"证据不足";height:number|null;pct:number;amountYi:number;reasons:string[];missing:string[];triggers:string[];risk:CandidateRisk;inclusionPaths:string[];basisDate:string};
export type FunnelOverview={date:string;basisDate:string;mode:"close"|"live";version:string;market:{cycle:string;score:number|null;stance:string;focus:string;avoid:string;allowNewRisk:boolean|null};screenedThemes:number;verifiedThemes:number;industryCount:number;candidateCount:number;focusCount:number;candidates:FunnelCandidate[];warnings:string[];fetchedAt:string};

type Match={theme:ScoredTheme;rank:number|null;role:string};
const priority=(theme:ScoredTheme)=>theme.qualification.status==="通过"?2:theme.label==="主线候选"?1:0;
const roleScore=(rank:number|null,role:string)=>rank===1?95:rank===2?82:rank===3?70:role==="容量中军候选"?65:null;
const scoreTheme=(theme:ScoredTheme)=>theme.qualification.status==="通过"?90:theme.label==="主线候选"?62:theme.qualification.status==="待核验"?50:35;
const scoreIndustry=(industry:ScoredSector)=>industry.qualification.status==="通过"?88:industry.label==="主线候选"?62:industry.label==="轮动"?43:25;

export async function decisionFunnel(date:string,mode:"close"|"live"):Promise<FunnelOverview>{
  const [{overview:decision,days},themes]=await Promise.all([decisionData(date,mode),themeOverview(date,mode)]);
  const day=days.at(-1)!;
  const shortlist=themes.themes.filter(t=>t.kind==="题材"&&["主线初筛","主线候选","待梯队核验"].includes(t.label)).slice(0,20);
  const warnings=["题材核对强度靠前的至多20个候选；未匹配不等于个股没有题材归属。收盘候选只能用于盘后复盘，不能回填为当时盘中已知名单。"];
  const matches=new Map<string,Match[]>(),quote=new Map(day.prices.map(p=>[p.code,p])),limits=new Map((day.limits??[]).map(r=>[String(r.ts_code),r]));
  let verifiedThemes=0;
  for(let i=0;i<shortlist.length;i+=4){
    const batch=shortlist.slice(i,i+4);
    const results=await Promise.allSettled(batch.map(t=>tushare("dc_member",{ts_code:t.code,trade_date:themes.asOfDate.replaceAll("-","")},"trade_date,ts_code,con_code,name",5000)));
    results.forEach((result,j)=>{
      const theme=batch[j];
      if(result.status!=="fulfilled"||!auditThemeRows(result.value.rows,themes.asOfDate,"member",theme.code).usable){warnings.push(`${theme.name}的历史成分不可核验，未用于交叉验证`);return;}
      verifiedThemes++;
      const members=result.value.rows.map(r=>({code:String(r.con_code),name:String(r.name??""),price:quote.get(String(r.con_code)),limit:limits.get(String(r.con_code))}));
      const leaders=members.filter(m=>m.price&&m.price.pct>0&&!/^(\*?ST|S\*?ST|退)/i.test(m.name)).sort((a,b)=>(b.limit?.limit==="U"?Number(b.limit.limit_times)||0:0)-(a.limit?.limit==="U"?Number(a.limit.limit_times)||0:0)||(b.price?.pct??0)-(a.price?.pct??0)||(b.price?.amount??0)-(a.price?.amount??0));
      const capacity=members.filter(m=>m.price).slice().sort((a,b)=>(b.price?.amount??0)-(a.price?.amount??0))[0]?.code;
      const ranks=new Map(leaders.slice(0,3).map((m,n)=>[m.code,n+1]));
      members.forEach(m=>{
        const rank=ranks.get(m.code)??null,role=rank===1?"龙头候选":rank===2?"龙二候选":rank===3?"龙三候选":m.code===capacity?"容量中军候选":"成分待定位";
        matches.set(m.code,[...(matches.get(m.code)??[]),{theme,rank,role}]);
      });
    });
  }
  const industries=new Map<string,{core:CoreStock;sector:ScoredSector}>();
  decision.sectors.forEach(sector=>sector.cores.forEach(core=>industries.set(core.code,{core,sector})));
  const included=new Set<string>();
  decision.sectors.filter(s=>s.score!==null&&s.score>=55&&!['退潮','待数据'].includes(s.label)).forEach(s=>s.cores.filter(c=>c.score!==null&&c.score>=55&&c.pct>=-2).sort((a,b)=>(b.score??0)-(a.score??0)).slice(0,5).forEach(c=>included.add(c.code)));
  [...matches].forEach(([code,all])=>{if(all.some(m=>m.rank!==null||m.role==="容量中军候选"))included.add(code);});
  const candidates=[...included].flatMap(code=>{
    const entry=industries.get(code),all=matches.get(code)??[],price=quote.get(code);
    if(!entry||!price)return [];
    const {core,sector}=entry;
    const best=all.slice().sort((a,b)=>priority(b.theme)-priority(a.theme)||(b.theme.score??0)-(a.theme.score??0)||(a.rank??9)-(b.rank??9))[0];
    const role=best?.role&&best.role!=="成分待定位"?`题材${best.role}`:core.roles.find(r=>r!=="观察成员")??"成员待定位";
    const rankScore=best?roleScore(best.rank,best.role):null;
    const positionScore=core.score===null&&rankScore===null?null:Math.round(core.score===null?rankScore!:rankScore===null?core.score:core.score*.65+rankScore*.35);
    const market=decision.market.playbook;
    const opportunityScore=best&&positionScore!==null&&decision.market.score!==null&&market.allowNewRisk!==null?Math.max(0,Math.min(100,Math.round((market.allowNewRisk?75:30)*.15+scoreTheme(best.theme)*.25+scoreIndustry(sector)*.2+positionScore*.25+(price.pct>=0&&price.pct<=7?75:price.pct>8?30:45)*.15-((core.height??0)>=5?12:0)-(price.pct>=8?8:0)))):null;
    const qualified=best?.theme.qualification.status==="通过"&&sector.qualification.status==="通过";
    const status:FunnelCandidate["status"]=opportunityScore===null?"证据不足":qualified&&market.allowNewRisk===true&&opportunityScore>=70&&positionScore!==null&&positionScore>=75?"重点观察":"条件观察";
    const action=market.allowNewRisk===null?"待市场数据":market.allowNewRisk===false?"防守观察":!best?"待题材核对":!qualified?"等主线确认":role.includes("后排")?"暂不追后排":"等分钟承接";
    const reasons=[`市场：${decision.market.cycle} · ${market.stance}`,`行业：${sector.name} ${sector.label} · ${sector.phase}`,best?`题材：${best.theme.name} ${best.theme.label} · ${best.theme.phase}`:"本轮题材成分未匹配",`地位：${role} · ${positionScore??"—"}分`,`当日涨幅 ${price.pct.toFixed(2)}% · ${core.height??"—"}板`];
    const missing=[...(best?[]:["本轮已核对题材未匹配；其他题材归属未核验"]),...(best&&best.theme.qualification.status!=="通过"?["题材主线资格未通过"]:[]),...(sector.qualification.status!=="通过"?["行业主线资格未通过"]:[]),...(market.allowNewRisk!==true?["市场环境未确认可观察新风险"]:[]),"分钟承接、VWAP及题材同步需进入个股页核对"];
    const theme=best?{code:best.theme.code,name:best.theme.name,label:best.theme.label,phase:best.theme.phase,score:best.theme.score,rank:best.rank,role:best.role}:null;
    const limit=limits.get(code),inclusionPaths=[...((sector.score??0)>=55&&(core.score??0)>=55&&price.pct>=-2?[`行业 ${sector.name}：板块分≥55、核心分≥55、涨幅≥-2%，取前5`]:[]),...(all.some(m=>m.rank!==null||m.role==="容量中军候选")?[`已核验题材：前三量价梯队或成交额第一`]:[])];
    const risk=assessCandidateRisk({pct:price.pct,amountYi:price.amount/1e8,height:core.height,limit:String(limit?.limit??"")||null,limitDataReady:day.limits!==null,openTimes:limit?.open_times==null?null:Number(limit.open_times),asOf:day.asOf??`${date} 15:00`});
    return [{code,name:core.name,industry:sector.name,industryLabel:sector.label,industryPhase:sector.phase,theme,themeMatches:all.map(m=>m.theme.name),role,positionScore,opportunityScore,action,status,height:core.height,pct:price.pct,amountYi:price.amount/1e8,reasons,missing,triggers:["市场与题材不继续转弱","个股分歧后承接并站稳VWAP","题材与行业独立样本同分钟确认"],risk,inclusionPaths,basisDate:themes.asOfDate} satisfies FunnelCandidate];
  }).sort((a,b)=>(b.opportunityScore??-1)-(a.opportunityScore??-1)||(b.positionScore??-1)-(a.positionScore??-1)||b.amountYi-a.amountYi).slice(0,40);
  if(!verifiedThemes)warnings.push("题材历史成分均未核验成功，题材交叉验证保持未知；未输出完整交易机会预评。");
  return {date,basisDate:themes.asOfDate,mode,version:"FUNNEL-0.3",market:{cycle:decision.market.cycle,score:decision.market.score,stance:decision.market.playbook.stance,focus:decision.market.playbook.focus,avoid:decision.market.playbook.avoid,allowNewRisk:decision.market.playbook.allowNewRisk},screenedThemes:shortlist.length,verifiedThemes,industryCount:decision.sectors.filter(s=>s.label==="主线初筛"||s.label==="主线候选").length,candidateCount:candidates.length,focusCount:candidates.filter(c=>c.status==="重点观察").length,candidates,warnings,fetchedAt:new Date().toISOString()};
}
