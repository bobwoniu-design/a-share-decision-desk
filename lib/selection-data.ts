import {tushare,marketDates} from "./tushare";
import {decisionFunnel,type FunnelOverview} from "./funnel";
import {decisionMinutes} from "./decision-data";
import {derivedCache} from "./derived-cache";
import {chinaNow,minuteEngine,sectorMinuteEngine} from "./minute-engine";
import {addCandidates,discoverySession,selectionStage,summarizeChecks,type SelectionItem,type SelectionEvidence,type SelectionCheck} from "./selection";
import {readSelection,updateSelection} from "./selection-store";
import {newsRiskReasons,newsRiskCheck} from "./selection-news";

const isoDate=(s:string)=>`${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}`;
export async function selectionCalendar(){
  const today=chinaNow().date,start=new Date(`${today}T00:00:00Z`),end=new Date(start);
  start.setUTCDate(start.getUTCDate()-45);end.setUTCDate(end.getUTCDate()+45);
  const p=await tushare("trade_cal",{exchange:"SSE",start_date:start.toISOString().slice(0,10).replaceAll("-",""),end_date:end.toISOString().slice(0,10).replaceAll("-","")},"cal_date,is_open",6000,3600000);
  const dates=[...new Set(p.rows.filter(r=>Number(r.is_open)===1&&/^\d{8}$/.test(String(r.cal_date))).map(r=>isoDate(String(r.cal_date))))].sort();
  const previous=dates.filter(d=>d<today).at(-1),next=dates.find(d=>d>today),latest=dates.filter(d=>d<=today).at(-1);
  if(!previous||!next||!latest)throw new Error("交易日历不完整，无法确定候选所属交易日");
  return {today,previous,next,latest,isTradingDay:dates.includes(today)};
}
export async function selectionFunnel(date:string,mode:"close"|"live"):Promise<FunnelOverview>{
  return derivedCache(`funnel:v3:${date}:${mode}`,mode==="live"?45000:date===chinaNow().date?60000:7*86400000,()=>decisionFunnel(date,mode),false,v=>v.screenedThemes===0||v.verifiedThemes>0);
}
export async function syncSelection(db:D1Database,owner:string,view:"today"|"next"){
  const calendar=await selectionCalendar(),now=chinaNow();
  const date=view==="today"?calendar.today:calendar.next,basis=view==="today"?calendar.previous:calendar.latest;
  if(view==="today"&&!calendar.isTradingDay)return {...await readSelection(db,owner,date),...calendar};
  const saved=await readSelection(db,owner,date),warnings:string[]=[];
  let prepared:FunnelOverview|null=null,live:FunnelOverview|null=null;
  if(!saved.day.preparedAt){
    if(basis===calendar.today&&now.time<"15:10")warnings.push("今日收盘数据尚未就绪，下个交易日计划等待收盘后生成。");
    else try{
      prepared=await selectionFunnel(basis,"close");
      if(!prepared.candidates.length||prepared.verifiedThemes===0)throw new Error("收盘候选或题材证据不完整，计划暂不定稿");
    }catch(e){prepared=null;warnings.push(e instanceof Error?e.message:"收盘候选生成失败");}
  }
  if(view==="today"&&discoverySession(now.time)){
    try{live=await selectionFunnel(date,"live");}catch(e){warnings.push(e instanceof Error?e.message:"盘中候选读取失败");}
  }
  const stamp=new Date().toISOString();
  // A slow fetch finishing after the session must not create an after-hours discovery.
  if(live&&(!discoverySession(chinaNow().time)||chinaNow().date!==date)){live=null;warnings.push("采集完成时已不在当日交易时段，未追加盘中候选。");}
  const result=await updateSelection(db,owner,date,day=>{
    day.basisDate=basis;
    if(prepared&&!day.preparedAt){addCandidates(day,prepared.candidates,"盘前候选",basis,stamp,date<=calendar.today);day.preparedAt=stamp;}
    if(live){addCandidates(day,live.candidates,"盘中新增",date,stamp);day.lastScanAt=stamp;}
    day.warnings=warnings;
  });
  // When the workbench stays open after close, prepare the next session without a tab switch.
  if(view==="today"&&now.time>="15:10"){
    try{const nextResult=await syncSelection(db,owner,"next");if(nextResult.day.warnings.length)result.day.warnings=[...result.day.warnings,...nextResult.day.warnings.map(w=>`下个交易日计划：${w}`)];}
    catch(e){result.day.warnings.push(`下个交易日计划待生成：${e instanceof Error?e.message:"数据不可用"}`);}
  }
  return {...result,...calendar};
}

export async function verifySelection(item:SelectionItem,date:string):Promise<SelectionEvidence>{
  const now=chinaNow();if(date!==now.date)throw new Error("只核验今日候选；历史记录不可回填为当时的盘中判断");
  const stage=selectionStage(now.time),stamp=new Date().toISOString(),checks:SelectionCheck[]=[],links:SelectionEvidence["links"]=[];
  checks.push({label:"交易时段",pass:discoverySession(now.time)?true:null,detail:discoverySession(now.time)?"当前处于连续交易时段":"当前为盘前、午间或收盘后，只保留核查结果，不产生有效买入条件"});
  const source=item.sources.find(s=>s.kind==="盘中新增")??item.sources[0];
  const basis=source.kind==="盘前候选"?source.basisDate:(await marketDates(date,2)).dates.filter(d=>d<date).at(-1);
  if(!basis)throw new Error("缺少前一交易日，无法核对隔夜消息");
  // Query only information available now, from the previous close including holidays.
  const end=`${date} ${now.time}:59`,newsStart=`${basis} 15:00:00`;
  const sources=await Promise.allSettled([
    tushare("anns_d",{ts_code:item.code,start_date:basis.replaceAll("-",""),end_date:date.replaceAll("-","")},"ann_date,ts_code,title,url,rec_time",2000,60000),
    tushare("news",{src:"cls",start_date:newsStart,end_date:end},"datetime,title,content,channels",1500,60000)
  ]);
  const failures:string[]=[],riskReasons:string[]=[];let matched=0;
  for(let i=0;i<sources.length;i++){
    const r=sources[i];if(r.status==="rejected"){failures.push(i===0?"公司公告不可用":"财联社快讯不可用");continue;}
    for(const row of r.value.rows){
      const title=String(row.title??""),content=String(row.content??""),time=String(i===0?row.rec_time??row.ann_date:row.datetime??"");
      if(i===0?row.ts_code!==item.code:!`${title} ${content}`.includes(item.name)&&!`${title} ${content}`.includes(item.code.slice(0,6)))continue;
      if(i===1&&(time<newsStart||time>end))continue;
      matched++;
      const reasons=newsRiskReasons(title,content,item.name,item.code);
      if(reasons.length){riskReasons.push(...reasons);links.push({title:title||content.slice(0,180),time,source:i===0?"公司公告（Tushare）":"财联社快讯（Tushare）",reason:reasons.join("；"),url:typeof row.url==="string"&&/^https?:\/\//.test(row.url)?row.url:null});}
    }
  }
  checks.push(newsRiskCheck(riskReasons,failures,matched));
  let price:number|null=null,quoteTime:string|null=null,invalidated=false,minuteReady=false;
  if(now.time>="09:26"){
    try{
      const p=await tushare("stk_auction",{ts_code:item.code,trade_date:date.replaceAll("-","")},"ts_code,trade_date,price,pre_close,amount,volume_ratio",8000,60000);
      const row=p.rows.find(r=>r.ts_code===item.code&&r.trade_date===date.replaceAll("-",""));
      const pct=row&&Number(row.pre_close)>0?(Number(row.price)/Number(row.pre_close)-1)*100:null;
      checks.push({label:"竞价结果",pass:pct===null||!Number.isFinite(pct)?null:pct>-3&&pct<7,detail:pct===null?"未取得当日竞价结果":`竞价较昨收 ${pct.toFixed(2)}%；低于等于 -3% 或高于等于 7% 保持观察（规则阈值，非收益结论）`});
    }catch{checks.push({label:"竞价结果",pass:null,detail:"当日竞价接口不可用或权限不足"});}
  }else checks.push({label:"竞价结果",pass:null,detail:"等待竞价结束后的数据"});
  if(now.time>="09:30"&&now.time<="15:00"){
    try{
      const b=await decisionMinutes(item.code,date,"live",source.candidate.theme?.code??"");
      const times=b.bars.map(v=>v.time),industry=sectorMinuteEngine(b.peers,times),theme=sectorMinuteEngine(b.themePeers,times);
      const frame=minuteEngine(b.bars,{preClose:b.preClose??undefined,floatShares:b.floatShares??undefined,upLimit:b.upLimit??undefined,mainlineCore:b.mainlineCore,themeAllowed:b.themeAllowed,marketAllowed:b.marketAllowed,sector:industry.frames,theme:theme.frames}).current;
      price=b.bars.at(-1)?.close??null;quoteTime=frame?`${date} ${frame.time}`:null;
      const usable=!!frame&&!b.stale&&!b.blocked;
      invalidated=usable&&(frame!.invalidated||frame!.phase==="转弱");
      minuteReady=usable&&frame!.quality&&/^第[一二三]笔条件出现/.test(frame!.signal);
      checks.push({label:"行情时效",pass:usable?true:null,detail:usable?`截至 ${quoteTime}`:"分钟行情缺失、延迟或覆盖不足"},
        {label:"市场环境",pass:usable?b.marketAllowed:null,detail:"当前市场环境是否允许观察新风险"},
        {label:"行业延续",pass:usable?industry.current?.strong??null:null,detail:industry.current?.reason??"缺少同分钟行业独立样本"},
        {label:"题材延续",pass:usable?theme.current?.strong??null:null,detail:theme.current?.reason??"缺少同分钟题材独立样本"},
        {label:"个股条件",pass:usable&&frame!.quality?minuteReady:null,detail:usable?frame!.signal:"待分钟结构核验"});
      // Opening risks do not wait for the 20-bar positive-confirmation window.
      if(usable&&b.preClose&&price){const change=(price/b.preClose-1)*100;checks.push({label:"开盘价格风险",pass:change>-3&&change<8,detail:`当前较昨收 ${change.toFixed(2)}%；早盘风险检查独立运行，正向确认仍需足够分钟样本`});}
    }catch(e){checks.push({label:"盘中条件",pass:null,detail:e instanceof Error?e.message:"分钟数据不可用"});}
  }else checks.push({label:"盘中条件",pass:null,detail:now.time<"09:30"?"尚未开盘":"已经收盘，盘中提示不再有效"});
  const plan=item.plan;
  checks.push({label:"计划价格",pass:price!==null&&plan?price>=plan.low&&price<=plan.high:null,detail:plan?`计划 ${plan.low}–${plan.high} 元；现价 ${price??"未知"}`:"尚未填写计划价格范围；可先加入计划继续等待确认"});
  const outcome=summarizeChecks(checks,invalidated,minuteReady);
  return {at:stamp,expiresAt:new Date(Date.parse(stamp)+120000).toISOString(),stage,...outcome,checks,price,quoteTime,links:links.slice(0,30)};
}
