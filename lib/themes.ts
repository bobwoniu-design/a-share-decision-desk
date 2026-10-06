import type { Row } from "./market-data";
import type { Factor } from "./decision-engine";
import type { Phase } from "./minute-engine";

export type ThemeDay={date:string;rows:Row[]};
export type ThemePoint={date:string;pct:number|null;score:number|null;phase:Phase};
export type ThemeCheck={name:string;result:"通过"|"未通过"|"待核验";detail:string};
export type ThemeQualification={status:"通过"|"未通过"|"待核验";checks:ThemeCheck[];limitUp:number|null;maxHeight:number|null;memberCoverage:string|null};
export type ScoredTheme={code:string;name:string;kind:"题材"|"交易表现";score:number|null;delta:number|null;rank:number;label:string;phase:Phase;pct:number|null;return5:number|null;turnover:number|null;breadth:number|null;up:number|null;down:number|null;leading:string;leadingCode:string;topDays:number;relativeStrength:number|null;qualification:ThemeQualification;factors:Factor[];history:ThemePoint[]};
export type ThemeOverview={date:string;asOfDate:string;mode:"close"|"live";source:string;version:string;themes:ScoredTheme[];warnings:string[];fetchedAt:string};

const fmt=(n:number|null,digits=1)=>n===null?"缺失":n.toFixed(digits);
const value=(row:Row|undefined,field:string)=>{const v=row?.[field];if(v===null||v===undefined||v==="")return null;const n=Number(v);return Number.isFinite(n)?n:null;};
const percentile=(values:number[],v:number|null)=>v===null||!values.length?null:100*(values.filter(x=>x<v).length+values.filter(x=>x===v).length*.5)/values.length;
export const performanceBasket=(name:string)=>/^昨日(?:涨停|首板|连板|打[一二三四五六七八九十\d]+板)/.test(name)||name==="反转股";
// Match the decision engine's 80% known-weight gate; missing factors never become zero.
const weightedScore=(factors:Factor[])=>{const known=factors.filter(f=>f.score!==null&&Number.isFinite(f.score)),weight=known.reduce((s,f)=>s+f.weight,0),total=factors.reduce((s,f)=>s+f.weight,0);return !total||weight/total<.8?null:Math.round(known.reduce((s,f)=>s+Math.max(0,Math.min(100,f.score!))*f.weight,0)/weight);};
function check(name:string,ok:boolean|null,detail:string):ThemeCheck{return {name,result:ok===null?"待核验":ok?"通过":"未通过",detail};}
function qualify(t:Pick<ScoredTheme,"kind"|"pct"|"return5"|"topDays"|"breadth"|"relativeStrength">&{complete:boolean}):ThemeQualification{
  if(t.kind==="交易表现")return {status:"未通过",checks:[],limitUp:null,maxHeight:null,memberCoverage:null};
  const checks=[
    check("当日相对强度",t.pct===null||t.relativeStrength===null?null:t.pct>0&&t.relativeStrength>=80,`涨幅 ${fmt(t.pct,2)}% · 同源分位 ${fmt(t.relativeStrength,0)}，要求前20%且上涨`),
    check("持续性",t.complete?t.topDays>=3:null,`近5日强势 ${t.complete?t.topDays:"缺失"}/5，要求至少3日`),
    check("五日累计",t.return5===null?null:t.return5>0,`复合涨幅 ${fmt(t.return5,2)}%，要求大于0`),
    check("内部广度",t.breadth===null?null:t.breadth>=55,`上涨占比 ${fmt(t.breadth,0)}%，要求至少55%`),
    check("成分涨停梯队",null,"待核对所选日历史成分与涨停名单；要求至少2只涨停且最高至少2板")
  ];
  return {status:checks.some(c=>c.result==="未通过")?"未通过":"待核验",checks,limitUp:null,maxHeight:null,memberCoverage:null};
}
export function withThemeLadder(t:ScoredTheme,evidence:{limitUp:number;maxHeight:number;traded:number;members:number}|null):ScoredTheme{
  if(t.kind!=="题材"||t.qualification.status==="未通过")return t;
  const coverage=evidence&&evidence.members>0?evidence.traded/evidence.members:null;
  const ladder=check("成分涨停梯队",coverage===null||coverage<.8?null:evidence!.limitUp>=2&&evidence!.maxHeight>=2,
    evidence?`涨停 ${evidence.limitUp} 只 · 最高 ${evidence.maxHeight} 板 · 行情覆盖 ${evidence.traded}/${evidence.members}${(coverage??0)<.8?"，覆盖不足80%":""}`:"历史成分或涨停名单不可用，保持待核验");
  const checks=[...t.qualification.checks.slice(0,-1),ladder];
  const status:ThemeQualification["status"]=checks.some(c=>c.result==="未通过")?"未通过":checks.every(c=>c.result==="通过")?"通过":"待核验";
  const qualification:ThemeQualification={status,checks,limitUp:evidence?.limitUp??null,maxHeight:evidence?.maxHeight??null,memberCoverage:evidence?`${evidence.traded}/${evidence.members}`:null};
  return {...t,qualification,label:status==="通过"?"主线初筛":status==="待核验"?"待梯队核验":themeLabel({...t,qualification})};
}
function themeLabel(t:Pick<ScoredTheme,"kind"|"score"|"phase"|"qualification"|"pct"|"topDays"|"return5">):string{
  if(t.kind==="交易表现")return "交易表现";
  if(t.score===null)return "待数据";
  if(t.phase==="转弱"||t.score<40)return "退潮";
  if(t.qualification.status==="通过")return "主线初筛";
  if(t.qualification.status==="待核验")return "待梯队核验";
  const passed=t.qualification.checks.filter(c=>c.result==="通过").length;
  return passed>=3&&t.pct!==null&&t.pct>0?"主线候选":"轮动";
}
function phaseFor(score:number|null,old:number|null,prior:Phase):Phase{
  if(score===null)return "待数据";
  if(old===null)return score>=65?"一致":score>=45?"观察":"分歧";
  const delta=score-old;
  if(score<35||delta<=-15)return "转弱";
  if(delta<=-7)return "分歧";
  if(["分歧","转弱"].includes(prior)&&delta>=3)return "承接";
  if(prior==="承接"&&score>=65&&delta>=3)return "转强";
  if(["转强","一致","加速"].includes(prior)&&score>=80&&delta>=4)return "加速";
  return score>=65?"一致":score>=45?"观察":"分歧";
}

export function scoreThemeDays(days:ThemeDay[]):ScoredTheme[]{
  if(days.length<7||days.some((d,i)=>i>0&&d.date<=days[i-1].date))throw new Error("题材评分至少需要按交易日排序的7个快照");
  const maps=days.map(d=>new Map(d.rows.map(r=>[String(r.ts_code),r])));
  const thresholds=days.map(d=>{
    const p=d.rows.filter(r=>!performanceBasket(String(r.name))).map(r=>value(r,"pct_change")).filter((n):n is number=>n!==null).sort((a,b)=>b-a);
    return p[Math.max(0,Math.ceil(p.length*.2)-1)]??Infinity;
  });
  const state=new Map<string,Omit<ScoredTheme,"rank"|"label">>();
  for(let i=0;i<days.length;i++){
    const rows=days[i].rows;
    const comparable=rows.filter(r=>!performanceBasket(String(r.name)));
    const pcts=comparable.map(r=>value(r,"pct_change")).filter((n):n is number=>n!==null);
    const turns=comparable.map(r=>value(r,"turnover_rate")).filter((n):n is number=>n!==null&&n>=0);
    const returns=new Map<string,number>();
    if(i>=4)for(const r of rows){const code=String(r.ts_code),recent=maps.slice(i-4,i+1).map(m=>value(m.get(code),"pct_change"));if(recent.every((n):n is number=>n!==null))returns.set(code,(recent.reduce((p,n)=>p*(1+n/100),1)-1)*100);}
    const returnValues=comparable.flatMap(r=>{const v=returns.get(String(r.ts_code));return v===undefined?[]:[v];});
    for(const r of rows){
      const code=String(r.ts_code),pct=value(r,"pct_change"),turnover=value(r,"turnover_rate"),up=value(r,"up_num"),down=value(r,"down_num");
      const breadth=up!==null&&down!==null&&up+down>0?up/(up+down)*100:null;
      const recent=i>=4?maps.slice(i-4,i+1).map(m=>value(m.get(code),"pct_change")):[];
      const complete=recent.length===5&&recent.every((n):n is number=>n!==null);
      const positiveDays=complete?recent.filter(n=>n!==null&&n>0).length:0;
      const topDays=complete?recent.filter((n,j)=>n!==null&&n>0&&n>=thresholds[i-4+j]).length:0;
      const return5=returns.get(code)??null;
      const factors:Factor[]=[
        {name:"当日相对强度",weight:30,score:percentile(pcts,pct),detail:`概念日涨幅 ${fmt(pct,2)}% · 相对全部概念排名`},
        {name:"五日持续",weight:25,score:complete?positiveDays/5*50+topDays/5*50:null,detail:`上涨 ${positiveDays}/5 日 · 涨幅前20% ${topDays}/5 日`},
        {name:"五日累计",weight:20,score:percentile(returnValues,return5),detail:`复合涨幅 ${fmt(return5,2)}% · 相对全部概念排名`},
        {name:"内部广度",weight:15,score:breadth,detail:`上涨 ${up??"—"} / 下跌 ${down??"—"}`},
        {name:"换手活跃",weight:10,score:turnover!==null&&turnover>=0?percentile(turns,turnover):null,detail:`概念换手率 ${fmt(turnover,2)}% · 相对全部概念排名`}
      ];
      const old=state.get(code),score=i>=5&&complete?weightedScore(factors):null;
      const delta=score!==null&&old?.score!=null?score-old.score:null;
      const phase=phaseFor(score,old?.score??null,old?.phase??"观察");
      const kind=performanceBasket(String(r.name))?"交易表现":"题材",relativeStrength=percentile(pcts,pct);
      const qualification=qualify({kind,pct,return5,topDays,breadth,relativeStrength,complete});
      state.set(code,{code,name:String(r.name),kind,score,delta,phase,pct,return5,turnover,breadth,up,down,leading:String(r.leading??""),leadingCode:String(r.leading_code??""),topDays,relativeStrength,qualification,factors,history:[...(old?.history??[]),{date:days[i].date,pct,score,phase}]});
    }
  }
  const current=days.at(-1)!;
  const scored=current.rows.map(r=>{
    const s=state.get(String(r.ts_code))!;
    const label=themeLabel(s);
    return {...s,rank:0,label};
  }).sort((a,b)=>(a.kind===b.kind?0:a.kind==="题材"?-1:1)||(b.score??-1)-(a.score??-1)||(b.pct??-Infinity)-(a.pct??-Infinity)||a.code.localeCompare(b.code));
  scored.forEach((s,i)=>s.rank=i+1);
  return scored;
}
