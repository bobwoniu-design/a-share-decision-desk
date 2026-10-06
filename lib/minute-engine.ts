import type { Bar } from "./market-data";

export const ENGINE_VERSION = "P0.2";
export const PHASES = ["一致", "分歧", "承接", "转强", "加速", "转弱"] as const;
export type Phase = typeof PHASES[number] | "观察" | "待数据";
export type Check = { label:string; pass:boolean|null; detail:string };
export type Transition = { time:string; from:Phase; to:Phase; reason:string };
export type MinuteFrame = {
  time:string; phase:Phase; since:string; signal:string; quality:boolean; missing:number;
  scores:Record<typeof PHASES[number],number>; checks:Check[];
  vwap:number|null; above:number; drawdown:number; volumeRatio:number|null;
  higherLow:boolean; breakout:boolean; turnover:number|null; turnoverAcceleration:number|null;
  supportLow:number|null; invalidated:boolean; confirmed:boolean; sync:boolean|null; themeSync:boolean|null;
};
export type PeerSeries = {code:string;name:string;preClose:number;bars:Bar[];error?:string};
export type SectorMinute = {time:string;phase:Phase;aboveRatio:number|null;upRatio:number|null;returnPct:number|null;coverage:number;total:number;strong:boolean|null;weak:boolean|null;reason:string};
export type MinuteContext = {preClose?:number;floatShares?:number;upLimit?:number;mainlineCore?:boolean|null;themeAllowed?:boolean|null;marketAllowed?:boolean|null;sector?:SectorMinute[];theme?:SectorMinute[]};
const mean=(a:number[])=>a.length?a.reduce((s,v)=>s+v,0)/a.length:0;
const min=(a:Bar[])=>Math.min(...a.map(b=>b.low));
const max=(a:Bar[])=>Math.max(...a.map(b=>b.high));
const clamp=(v:number)=>Math.round(Math.max(0,Math.min(100,v)));
export function tradingMinute(time:string){
  const [h,m]=time.split(":").map(Number),t=h*60+m;
  if(t>=570&&t<=690)return t-570;
  if(t>=781&&t<=900)return t-660;
  return null;
}
export function chinaNow(now=new Date()) {const date=new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Shanghai",year:"numeric",month:"2-digit",day:"2-digit"}).format(now);const time=new Intl.DateTimeFormat("en-GB",{timeZone:"Asia/Shanghai",hour:"2-digit",minute:"2-digit",hourCycle:"h23"}).format(now);return {date,time};}
export function liveSession(time:string){return time>="09:30"&&time<="11:32"||time>="13:00"&&time<="15:02";}
export function minuteFresh(date:string,last:string|undefined,now=new Date()){
  const current=chinaNow(now);if(date!==current.date||!last)return false;
  const expected=current.time>"11:30"&&current.time<"13:01"?120:current.time>"15:00"?240:tradingMinute(current.time);
  const actual=tradingMinute(last);return expected!==null&&actual!==null&&actual<=expected&&expected-actual<=2;
}

// Deterministic prefix processing: no frame depends on bars after its own timestamp.
export function minuteEngine(input:Bar[],context:MinuteContext={}){
  const bars=input.filter(b=>tradingMinute(b.time)!==null);
  if(new Set(bars.map(b=>b.time)).size!==bars.length||bars.some((b,i)=>i>0&&b.time<=bars[i-1].time))throw new Error("分钟顺序或唯一性错误");
  const frames:MinuteFrame[]=[],transitions:Transition[]=[],sector=new Map((context.sector??[]).map(p=>[p.time,p])),theme=new Map((context.theme??[]).map(p=>[p.time,p]));
  let phase:Phase="观察",since=bars[0]?.time??"",amount=0,volume=0,above=0,below=0,missing=0;
  let divergence=false,supportLow:number|null=null,invalidated=false,confirmed=false,peak=0,proposed:Phase="观察",streak=0;
  for(let i=0;i<bars.length;i++){
    const b=bars[i],t=tradingMinute(b.time)!;
    missing+=i?Math.max(0,t-tradingMinute(bars[i-1].time)!-1):Math.max(0,t-1);
    amount+=b.amount;volume+=b.vol;const vwap=volume>0?amount/volume:null;
    // Official zero-volume bars still contain an observed reference price (e.g. closing auction).
    // They can maintain a price condition, but never create an actionable condition on their own.
    above=vwap!==null&&b.close>vwap*(1+1e-8)?above+1:0;below=vwap!==null&&b.close<vwap*(1-1e-8)?below+1:0;
    const recent=bars.slice(Math.max(0,i-4),i+1),previous=bars.slice(Math.max(0,i-9),Math.max(0,i-4));
    const baseline=bars.slice(Math.max(0,i-19),Math.max(0,i-4));
    const recentMean=mean(recent.map(p=>p.vol)),baseMean=mean(baseline.map(p=>p.vol));
    const ratio=i>=19&&baseMean>0?recentMean/baseMean:null;
    const higherLow=previous.length===5&&min(recent)>min(previous)*1.0005;
    const lowerLow=previous.length===5&&min(recent)<min(previous)*.9995;
    const lowerHigh=previous.length===5&&max(recent)<max(previous)*.9995;
    const priorHigh=i>=10?max(bars.slice(i-10,i)):null,breakout=priorHigh!==null&&b.close>priorHigh*1.0002;
    const drawdown=peak>0?Math.max(0,(peak-b.close)/peak*100):0;peak=Math.max(peak,b.high);
    const amplitude=context.preClose?(peak-Math.min(...bars.slice(0,i+1).map(p=>p.low)))/context.preClose*100:0;
    const rd=recent.filter(p=>p.close<p.open),pd=previous.filter(p=>p.close<p.open);
    const drying=rd.length>0&&pd.length>0&&mean(rd.map(p=>p.vol))<mean(pd.map(p=>p.vol))*.8;
    const rebound=previous.length===5?(b.close/min(previous)-1)*100:0;
    const broken=!!context.upLimit&&peak>=context.upLimit-.005&&b.close<context.upLimit-.005;
    const turnover=context.floatShares&&context.floatShares>0?volume/context.floatShares*100:null;
    const turnoverAcceleration=turnover!==null&&ratio!==null?ratio:null;
    const peer=sector.get(b.time),sync=peer?.strong??null,weakSector=peer?.weak??null;
    const themePeer=theme.get(b.time),themeSync=themePeer?.strong??null,weakTheme=themePeer?.weak??null;
    const quality=i>=19&&missing===0&&vwap!==null;
    const div=drawdown>=2&&(ratio!==null&&ratio>=1.3||amplitude>=3||broken);
    if(div)divergence=true;
    const supported=divergence&&higherLow&&(drying||rebound>=.6)&&b.close>=min(recent)*1.002;
    const confirm=supported&&above>=3;
    const strength=confirm&&breakout&&ratio!==null&&ratio>=1.3&&b.close>b.open&&sync===true;
    const slope=i>=6?(b.close/bars[i-3].close-1)*100:0,priorSlope=i>=6?(bars[i-3].close/bars[i-6].close-1)*100:0;
    const accelerate=["转强","加速"].includes(phase)&&above>=3&&breakout&&ratio!==null&&ratio>=1.6&&slope>=.5&&slope>Math.max(.1,priorSlope)*1.5&&sync===true;
    const weak=below>=3&&lowerLow&&lowerHigh&&(ratio!==null&&ratio>=1.2||weakSector===true||weakTheme===true);
    if(supportLow!==null&&b.close<supportLow*.998&&quality)invalidated=true;
    const scores={
      一致:clamp((above>=3?35:0)+(higherLow?20:0)+(drawdown<1?25:0)+(sync===true?20:0)),
      分歧:clamp(drawdown/2*40+(ratio!==null&&ratio>=1.3?20:0)+(amplitude>=3?20:0)+(broken?20:0)),
      承接:clamp((divergence?20:0)+(higherLow?35:0)+(drying?25:0)+(rebound>=.6?20:0)),
      转强:clamp((above>=3?20:0)+(higherLow?20:0)+(breakout?20:0)+(ratio!==null&&ratio>=1.3?20:0)+(sync===true?20:0)),
      加速:clamp((breakout?20:0)+(slope>=.5?30:0)+(ratio!==null&&ratio>=1.6?30:0)+(sync===true?20:0)),
      转弱:clamp((below>=3?25:0)+(lowerLow?25:0)+(lowerHigh?20:0)+(ratio!==null&&ratio>=1.2?15:0)+(weakSector===true?15:0))
    };
    let target:Phase=phase,reason="条件持续";
    if(!quality){target=i<19&&missing===0?"观察":"待数据";reason=missing?`缺少 ${missing} 根分钟，暂停信号`:"等待20根有效分钟与有效成交";}
    else if(invalidated){target="转弱";reason="跌破承接低点0.2%，原承接逻辑失效";}
    else if(weak){target="转弱";reason="均价下方连续3根，高低点下移，量能或板块转弱";}
    else if(accelerate){target="加速";reason="突破前高、3分钟斜率增加、放量且板块同步";}
    else if(strength){target="转强";reason="站稳VWAP、低点抬高、放量突破且板块同步";}
    else if(supported){target="承接";reason="分歧后低点抬高，缩量下跌或反弹增强";}
    else if(div){target="分歧";reason=`有序回撤${drawdown.toFixed(2)}%，伴随放量、振幅扩张或炸板`;}
    else if(!divergence&&(above>=3||!!context.upLimit&&b.close>=context.upLimit-.005)&&drawdown<1){target="一致";reason="持续位于均价上方或封于涨停，回撤小于1%";}
    else if(["待数据","观察","一致"].includes(phase)){target="观察";reason="方向条件尚未满足";}
    // Positive upgrades need two consecutive evaluations; data/risk downgrades are immediate.
    streak=target===proposed?streak+1:1;proposed=target;
    if(target!==phase&&(["转弱","待数据","分歧","观察"].includes(target)||streak>=2)){
      transitions.push({time:b.time,from:phase,to:target,reason});phase=target;since=b.time;
      if(target==="承接"&&supportLow===null)supportLow=Math.min(min(previous),min(recent));
    }
    confirmed=quality&&!invalidated&&confirm&&["承接","转强","加速"].includes(phase);
    const checks:Check[]=[
      {label:"市场环境允许观察",pass:context.marketAllowed??null,detail:"前日市场观察策略允许；实时模式再核对当前市场"},
      {label:"行业核心",pass:context.mainlineCore??null,detail:"前一交易日行业主线资格初筛通过且核心度≥65"},
      {label:"题材归属与资格",pass:context.themeAllowed??null,detail:"前一交易日题材主线资格初筛通过，且个股属于当时成分"},
      {label:"分歧已出现",pass:quality?divergence:null,detail:`前高回撤 ${drawdown.toFixed(2)}%`},
      {label:"承接结构",pass:quality?supported:null,detail:drying?"下跌缩量且低点抬高":`低点${higherLow?"抬高":"未抬高"} · 反弹${rebound.toFixed(2)}%`},
      {label:"站稳 VWAP",pass:quality?above>=3:null,detail:`连续 ${above} 根在均价上方`},
      {label:"上涨放量",pass:quality&&ratio!==null?ratio>=1.3&&b.close>b.open:null,detail:ratio===null?"样本不足":`近5分钟 / 前15分钟均量 ${ratio.toFixed(2)}倍`},
      {label:"行业同步",pass:sync,detail:peer?.reason??"尚未取得同分钟行业独立样本"},
      {label:"题材同步",pass:themeSync,detail:themePeer?.reason??"尚未取得同分钟题材独立样本"},
      {label:"突破前高",pass:quality?breakout:null,detail:priorHigh===null?"等待10根分钟":`此前10分钟高点 ${priorHigh.toFixed(3)}`}
    ];
    const eligible=quality&&b.vol>0&&context.marketAllowed===true&&context.mainlineCore===true&&context.themeAllowed===true;
    let signal="观察";
    if(!quality)signal="数据不足 · 暂停条件提示";
    else if(invalidated)signal="逻辑失效";
    else if(phase==="转弱")signal="风险：转弱";
    else if(eligible&&["转强","加速"].includes(phase)&&sync===true&&themeSync===true&&confirmed&&breakout&&ratio!==null&&ratio>=1.3&&b.close>b.open)signal="第三笔条件出现：转强";
    else if(eligible&&confirmed&&sync===true&&themeSync===true)signal="第二笔条件出现：确认";
    else if(eligible&&phase==="承接"&&supported&&weakSector===false&&weakTheme===false)signal="第一笔条件出现：承接";
    else if(["承接","转强","加速"].includes(phase))signal="价格结构出现 · 决策链条件未齐";
    frames.push({time:b.time,phase,since,signal,quality,missing,scores,checks,vwap,above,drawdown,volumeRatio:ratio,higherLow,breakout,turnover,turnoverAcceleration,supportLow,invalidated,confirmed,sync,themeSync});
  }
  return {frames,transitions,current:frames.at(-1)??null};
}

// Representative cohort chosen before the session; exact timestamps only, never forward-fill.
export function sectorMinuteEngine(peers:PeerSeries[],times:string[]){
  const prepared=peers.map(p=>({p,frames:new Map(minuteEngine(p.bars,{preClose:p.preClose}).frames.map(f=>[f.time,f])),bars:new Map(p.bars.map(b=>[b.time,b]))}));
  const frames:SectorMinute[]=[],transitions:Transition[]=[];let phase:Phase="观察",divergence=false,proposed:Phase="观察",streak=0;
  for(const time of times){
    const valid=prepared.filter(p=>p.frames.get(time)?.quality&&p.bars.has(time));
    const enough=peers.length>=3&&valid.length>=Math.max(3,Math.ceil(peers.length*.8));
    const above=valid.length?valid.filter(p=>p.frames.get(time)!.above>=3).length/valid.length:null;
    const up=valid.length?valid.filter(p=>p.bars.get(time)!.close>p.p.preClose).length/valid.length:null;
    const ret=valid.length?mean(valid.map(p=>(p.bars.get(time)!.close/p.p.preClose-1)*100)):null;
    const draw=valid.length?mean(valid.map(p=>p.frames.get(time)!.drawdown)):0;
    const supports=valid.filter(p=>p.frames.get(time)!.higherLow).length/Math.max(1,valid.length);
    const weak=valid.filter(p=>p.frames.get(time)!.scores.转弱>=65).length/Math.max(1,valid.length);
    const breaks=valid.filter(p=>p.frames.get(time)!.breakout&&(p.frames.get(time)!.volumeRatio??0)>=1.3).length/Math.max(1,valid.length);
    if(enough&&(draw>=1.5||(above!==null&&above<.4)))divergence=true;
    let target:Phase="观察";
    if(!enough)target="待数据";
    else if(weak>=.6)target="转弱";
    else if(["转强","加速"].includes(phase)&&breaks>=.6&&above!>=.8)target="加速";
    else if(divergence&&above!>=.6&&supports>=.6&&breaks>=.4)target="转强";
    else if(divergence&&supports>=.6&&above!>=.4)target="承接";
    else if(divergence&&(above!<.4||draw>=1.5))target="分歧";
    else if(above!>=.7&&up!>=.7)target="一致";
    streak=target===proposed?streak+1:1;proposed=target;
    const reason=`同分钟 ${valid.length}/${peers.length} 只；VWAP上方${above===null?"—":Math.round(above*100)+"%"}，低点抬高${Math.round(supports*100)}%`;
    if(target!==phase&&(["待数据","转弱","分歧"].includes(target)||streak>=2)){transitions.push({time,from:phase,to:target,reason});phase=target;}
    frames.push({time,phase,aboveRatio:above,upRatio:up,returnPct:ret,coverage:valid.length,total:peers.length,strong:enough?above!>=.6&&supports>=.6&&!["转弱","分歧"].includes(phase):null,weak:enough?weak>=.6||phase==="转弱":null,reason});
  }
  return {frames,transitions,current:frames.at(-1)??null};
}
