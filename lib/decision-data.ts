import {tushare,marketDates,marketMinutes,MarketError} from "./tushare";
import {dailyRows,minuteRows,numeric,type Row,type Bar} from "./market-data";
import {sectorGroups} from "./sectors";
import {buildDecision,type CoreStock,type DecisionDay,type DecisionOverview,type ScoredSector} from "./decision-engine";
import {chinaNow,minuteFresh,type PeerSeries} from "./minute-engine";
import {themeOverview} from "./theme-data";
import {auditThemeRows} from "./theme-quality";
import {boardEvidence} from "./board-evidence";
import {derivedCache} from "./derived-cache";

const limitFields="ts_code,trade_date,name,industry,limit,limit_times,close,pct_chg,amount,fd_amount,first_time,last_time,open_times";
const jobs=new Map<string,Promise<{overview:DecisionOverview;days:DecisionDay[]}>>();
const memory=new Map<string,{until:number;value:{overview:DecisionOverview;days:DecisionDay[]}}>();
async function basicRows(warnings:string[]){
  const fields="ts_code,name,industry,list_date,delist_date",statuses=["L","D","P"] as const;
  const result=await Promise.allSettled(statuses.map(s=>tushare("stock_basic",{list_status:s},fields)));
  if(result[0].status==="rejected")throw result[0].reason;
  const rows=[...result[0].value.rows];
  result.slice(1).forEach((r,i)=>{if(r.status==="fulfilled")rows.push(...r.value.rows);else warnings.push(`${statuses[i+1]} 股票列表：${r.reason instanceof Error?r.reason.message:"缺失"}`);});
  return rows;
}
async function closeDay(date:string,basic:Row[],warnings:string[],boardCheck=false):Promise<DecisionDay>{
  const d=date.replaceAll("-",""),[dailyResult,limitResult]=await Promise.allSettled([
    tushare("daily",{trade_date:d},"ts_code,trade_date,close,pre_close,pct_chg,amount"),
    tushare("limit_list_d",{trade_date:d},limitFields,2500)
  ]);
  if(dailyResult.status==="rejected")throw dailyResult.reason;
  const packet=dailyResult.value;
  if(!packet.rows.length)throw new MarketError(`${date} 日线缺失，不能跨过缺失日计算持续性`);
  const prices=dailyRows(packet.rows,date);let limits:Row[]|null=null;
  try{if(limitResult.status==="rejected")throw limitResult.reason;limits=limitResult.value.rows;if(limits.some(r=>r.trade_date!==d))throw new Error("涨跌停日期不一致");}catch(e){limits=null;warnings.push(`${date}：${e instanceof Error?e.message:"涨跌停数据缺失"}`);}
  let board:ReturnType<typeof boardEvidence>|null=null;
  if(limits&&boardCheck){
    const optional=async(api:string,fields:string)=>{try{return (await tushare(api,{trade_date:d},fields,2000)).rows;}catch(e){warnings.push(`${date} ${api}：${e instanceof Error?e.message:"不可用"}`);return null;}};
    const [steps,sectors]=await Promise.all([optional("limit_step","ts_code,trade_date,name,nums"),optional("limit_cpt_list","ts_code,trade_date,name,rank,days,up_stat,cons_nums,up_nums,pct_chg")]);
    try{board=boardEvidence(date,limits,steps,sectors);warnings.push(...board.warnings.map(w=>`${date}：${w}`));}catch(e){warnings.push(`${date} 打板核验：${e instanceof Error?e.message:"异常"}`);}
  }
  return {date,prices,limits,board,groups:sectorGroups(prices,basic,limits,date)};
}
export async function realtimeDay(date:string,basic:Row[],previous:DecisionDay,warnings:string[]):Promise<DecisionDay>{
  const now=chinaNow();if(date!==now.date)throw new MarketError("实时模式只能读取北京时间今天，历史日期请使用回放");
  const result=await tushare("rt_k",{ts_code:"3*.SZ,6*.SH,0*.SZ,9*.BJ"},"ts_code,name,pre_close,high,open,low,close,vol,amount,trade_time",6000,45000);
  const fresh=result.rows.filter(r=>String(r.trade_time).slice(0,10)===date&&minuteFresh(date,String(r.trade_time).slice(11,16))&&Number(r.close)>0&&Number(r.pre_close)>0);
  if(!fresh.length)throw new MarketError("实时行情没有返回今天的有效时间戳，未使用旧行情替代");
  if(fresh.length!==result.rows.length)warnings.push(`已排除 ${result.rows.length-fresh.length} 条过期或无有效报价的实时行`);
  const prices=dailyRows(fresh.map(r=>({...r,trade_date:date.replaceAll("-",""),pct_chg:(Number(r.close)/Number(r.pre_close)-1)*100,amount:Number(r.amount)/1000})),date);
  // A partial exchange response must not look like full-market breadth.
  if(prices.length<previous.prices.length*.9)throw new MarketError("实时行情覆盖不足前一交易日的90%，暂停全市场评分");
  const times=fresh.map(r=>String(r.trade_time).slice(11,16)).sort(),asOf=times[0];
  if(!minuteFresh(date,asOf))throw new MarketError(`实时行情延迟或过期（${asOf}），暂停当前评分`);
  let limits:Row[]|null=null;
  try{
    const caps=(await tushare("stk_limit",{trade_date:date.replaceAll("-","")},"ts_code,trade_date,up_limit,down_limit",5800)).rows;
    if(caps.some(r=>r.trade_date!==date.replaceAll("-","")))throw new Error("涨跌停价格日期不一致");
    const map=new Map(caps.map(r=>[String(r.ts_code),r])),prev=new Map((previous.limits??[]).filter(r=>r.limit==="U").map(r=>[String(r.ts_code),Number(r.limit_times)]));
    const included=fresh.filter(r=>!/(^ST|^\*ST|^退)/i.test(String(r.name)));
    if(included.filter(r=>map.has(String(r.ts_code))).length<included.length*.95)throw new Error("实时涨跌停价格覆盖不足95%");
    if(previous.limits===null)throw new Error("昨日连板名单缺失");
    limits=included.flatMap(r=>{const cap=map.get(String(r.ts_code));if(!cap)return [];const close=Number(r.close),up=numeric(cap.up_limit),down=numeric(cap.down_limit);const limit=up&&close>=up-.005?"U":down&&close<=down+.005?"D":up&&Number(r.high)>=up-.005?"Z":"";return limit?[{ts_code:r.ts_code,name:r.name,trade_date:date.replaceAll("-",""),limit,limit_times:limit==="U"?(prev.get(String(r.ts_code))??0)+1:0}]:[];});
  }catch(e){warnings.push(e instanceof Error?e.message:"实时封板状态不可用");}
  warnings.push("实时封板/炸板由最新价、日内高点和当日涨跌停价估算；不是盘后官方名单。行业归属为当前分类。");
  return {date,prices,limits,groups:sectorGroups(prices,basic,limits,date),partial:true,asOf:`${date} ${asOf}`};
}
export async function decisionData(date:string,mode:"close"|"live"="close",count=20){
  if(!Number.isInteger(count)||count<20||count>90)throw new MarketError("市场历史窗口超出允许范围");
  const key=`${date}:${mode}:${count}`,cached=memory.get(key);if(cached&&cached.until>Date.now())return cached.value;
  if(jobs.has(key))return jobs.get(key)!;
  const job=(async()=>{
    const warnings:string[]=[],{dates}=await marketDates(date,count);
    if(dates.at(-1)!==date)throw new MarketError(`${date} 不是交易日，未替换为其他日期`);
    const basic=await basicRows(warnings),wanted=mode==="live"?dates.slice(0,-1):dates,days:DecisionDay[]=[];
    const batchSize=count>20?6:5;
    for(let i=0;i<wanted.length;i+=batchSize){days.push(...await Promise.all(wanted.slice(i,i+batchSize).map((d,j)=>closeDay(d,basic,warnings,count===20&&i+j>=wanted.length-5))));}
    if(mode==="live")days.push(await realtimeDay(date,basic,days.at(-1)!,warnings));
    warnings.push("当前使用股票行业分类识别主线代理，未覆盖概念题材；历史行业变更未还原。分数为可解释规则分，不是概率或已验证收益。");
    const overview=buildDecision(days,[...new Set(warnings)]),value={overview,days};
    for(const [old,entry] of memory)if(entry.until<=Date.now())memory.delete(old);
    memory.set(key,{until:Date.now()+(mode==="live"?45000:300000),value});
    while(memory.size>3)memory.delete(memory.keys().next().value!);
    return value;
  })();jobs.set(key,job);try{return await job;}finally{jobs.delete(key);}
}
export async function realtimeMinutes(code:string,date:string){
  const now=chinaNow();if(date!==now.date)throw new MarketError("实时分钟日期必须是今天");
  const p=await tushare("rt_min_daily",{ts_code:code,freq:"1MIN"},"",8000,45000);
  const rows=p.rows.map(r=>({...r,ts_code:r.ts_code??r.code,trade_time:r.time}));
  const bars=minuteRows(rows,code,date).filter(b=>b.time<now.time);
  return {code,date,bars,fetchedAt:p.fetchedAt,source:"Tushare rt_min_daily"};
}
type MinuteCore=Pick<CoreStock,"code"|"name"|"score"|"roles"|"height"|"amountYi">;
type MinuteSector=Pick<ScoredSector,"name"|"score"|"label"|"phase">&{qualification:{status:ScoredSector["qualification"]["status"]};cores:MinuteCore[]};
type MinutePrior={date:string;market:{score:number|null;risk:string;playbook:{allowNewRisk:boolean|null}};sectors:MinuteSector[]};
type MinuteBasis={prior:MinutePrior;references:[string,number][]};
const minuteBasisKey=(date:string)=>`minute-basis:v1:${date}`;
function compactPrior(overview:DecisionOverview):MinutePrior{
  return {date:overview.date,market:{score:overview.market.score,risk:overview.market.risk,playbook:{allowNewRisk:overview.market.playbook.allowNewRisk}},
    sectors:overview.sectors.map(s=>({name:s.name,score:s.score,label:s.label,phase:s.phase,qualification:{status:s.qualification.status},cores:s.cores.map(c=>({code:c.code,name:c.name,score:c.score,roles:c.roles,height:c.height,amountYi:c.amountYi}))}))};
}
function makeMinuteBasis(days:DecisionDay[]):MinuteBasis{
  const prior=compactPrior(buildDecision(days.slice(0,-1)));
  return {prior,references:days.at(-1)!.prices.map(p=>[p.code,p.preClose])};
}
/** Reuse the date's causal market/industry basis across stock clicks and worker restarts. */
export async function minuteBasis(date:string,days?:DecisionDay[]):Promise<MinuteBasis>{
  return derivedCache(minuteBasisKey(date),date===chinaNow().date?60000:7*86400000,async()=>makeMinuteBasis(days??(await decisionData(date,"close")).days),false,b=>b.prior.date<date&&b.references.length>0&&b.prior.sectors.length>0);
}
export type MinuteBundle={
  code:string;name:string;date:string;mode:"close"|"live";basisDate:string;sector:string;
  bars:Bar[];peers:PeerSeries[];themePeers:PeerSeries[];themeBasis:{code:string;name:string;label:string;phase:string;date:string}|null;preClose:number|null;floatShares:number|null;upLimit:number|null;
  mainlineCore:boolean|null;themeAllowed:boolean|null;marketAllowed:boolean|null;basisCore:MinuteCore|null;
  basisSector:{score:number|null;label:string;phase:string}|null;marketBasis:{score:number|null;risk:string};
  warnings:string[];fetchedAt:string;stale:boolean;blocked:boolean;
};
export async function decisionMinutes(code:string,date:string,mode:"close"|"live",themeCode=""):Promise<MinuteBundle>{
  const warnings:string[]=[],references=new Map<string,number>();let prior:MinutePrior,liveAllowed:boolean|null=null;
  try{
    if(mode==="close"){
      const basis=await minuteBasis(date);prior=basis.prior;
      basis.references.forEach(([stock,price])=>references.set(stock,price));
    }else{
      const {days,overview}=await decisionData(date,mode);prior=compactPrior(buildDecision(days.slice(0,-1)));
      days.at(-1)!.prices.forEach(p=>references.set(p.code,p.preClose));
      liveAllowed=overview.market.playbook.allowNewRisk;
    }
  }catch(e){
    if(mode!=="live")throw e;
    const {dates}=await marketDates(date,20);if(dates.at(-1)!==date)throw new MarketError(`${date} 不是交易日`);
    prior=compactPrior((await decisionData(dates.at(-2)!,"close")).overview);
    warnings.push(`盘中全市场条件未知，暂停三笔提示：${e instanceof Error?e.message:"读取失败"}`);
    // Minute permissions are independent of realtime daily permissions. Keep the price state usable.
    try{const p=await tushare("stk_limit",{trade_date:date.replaceAll("-","")},"ts_code,trade_date,pre_close,up_limit,down_limit",5800);
      p.rows.filter(r=>r.trade_date===date.replaceAll("-","")).forEach(r=>{const n=numeric(r.pre_close);if(n&&n>0)references.set(String(r.ts_code),n);});
    }catch(e){warnings.push(e instanceof Error?e.message:"盘前参考价未获取");}
  }
  const group=prior.sectors.find(s=>s.cores.some(c=>c.code===code)),core=group?.cores.find(c=>c.code===code)??null;
  const preClose=references.get(code)??null;
  const barJobs=new Map<string,Promise<{bars:Bar[];fetchedAt:string}>>();
  const fetchMinutes=(c:string)=>{if(!barJobs.has(c))barJobs.set(c,mode==="live"?realtimeMinutes(c,date):marketMinutes(c,date));return barJobs.get(c)!;};
  const mainPromise=fetchMinutes(code).catch(e=>{warnings.push(e instanceof Error?e.message:"个股分钟读取失败");return null;});
  let floatShares:number|null=null,upLimit:number|null=null;
  const metadata=Promise.all([
    (async()=>{try{const p=await tushare("daily_basic",{ts_code:code,trade_date:prior.date.replaceAll("-","")},"ts_code,trade_date,float_share");const r=p.rows.find(r=>r.ts_code===code&&r.trade_date===prior.date.replaceAll("-","")),n=numeric(r?.float_share);if(n&&n>0)floatShares=n*10000;else warnings.push("前一交易日流通股本缺失，换手指标留空");}catch(e){warnings.push(e instanceof Error?e.message:"流通股本读取失败");}})(),
    (async()=>{try{const p=await tushare("stk_limit",{ts_code:code,trade_date:date.replaceAll("-","")},"ts_code,trade_date,up_limit,down_limit",5800);const r=p.rows.find(r=>r.ts_code===code&&r.trade_date===date.replaceAll("-", ""));upLimit=numeric(r?.up_limit);}catch(e){warnings.push(e instanceof Error?e.message:"涨停价格读取失败");}})()
  ]);
  // Freeze constituents and roles before the session; exclude the selected stock from confirmation.
  const peersWanted=group?group.cores.filter(c=>c.code!==code).sort((a,b)=>(a.roles[0]==="观察成员"?1:0)-(b.roles[0]==="观察成员"?1:0)||(b.score??-1)-(a.score??-1)).slice(0,6):[];
  peersWanted.forEach(p=>{void fetchMinutes(p.code).catch(()=>undefined);});
  let themeAllowed:boolean|null=null,themeBasis:MinuteBundle["themeBasis"]=null,themePeersWanted:MinuteCore[]=[];
  if(themeCode){
    try{
      const overview=await themeOverview(prior.date,"close"),theme=overview.themes.find(t=>t.code===themeCode&&t.kind==="题材");
      if(!theme)warnings.push("所选题材未出现在前一交易日目录，题材条件保持未知");
      else{
        themeBasis={code:theme.code,name:theme.name,label:theme.label,phase:theme.phase,date:prior.date};
        const members=await tushare("dc_member",{ts_code:themeCode,trade_date:prior.date.replaceAll("-","")},"trade_date,ts_code,con_code,name",5000);
        if(!auditThemeRows(members.rows,prior.date,"member",themeCode).usable)warnings.push("前一交易日题材成分不可核验，题材条件保持未知");
        else{
          const codes=new Set(members.rows.map(r=>String(r.con_code)));
          themeAllowed=theme.qualification.status==="通过"&&codes.has(code);
          if(!codes.has(code))warnings.push("该股不在前一交易日所选题材成分内，不能回填题材归属");
          if(theme.qualification.status!=="通过")warnings.push(`前一交易日${theme.name}主线资格未通过，题材条件保持不满足`);
          const all=prior.sectors.flatMap(s=>s.cores).filter(c=>c.code!==code&&codes.has(c.code));
          themePeersWanted=all.sort((a,b)=>(b.height??0)-(a.height??0)||(b.score??-1)-(a.score??-1)||b.amountYi-a.amountYi).slice(0,5);
        }
      }
    }catch(e){warnings.push(`题材历史归属无法核对：${e instanceof Error?e.message:"数据缺失"}`);}
  }else warnings.push("尚未选择题材；价格状态可查看，三笔条件提示等待题材确认");
  const wanted=[...new Map([...peersWanted,...themePeersWanted].map(p=>[p.code,p])).keys()];
  const outcomes=new Map<string,PromiseSettledResult<{bars:Bar[];fetchedAt:string}>>();
  for(let i=0;i<wanted.length;i+=6){const batch=wanted.slice(i,i+6),results=await Promise.allSettled(batch.map(fetchMinutes));results.forEach((r,j)=>outcomes.set(batch[j],r));}
  const asPeer=(p:MinuteCore,source:string):PeerSeries=>{const result=outcomes.get(p.code),base=references.get(p.code),error=result?.status==="rejected"?(result.reason instanceof Error?result.reason.message:`${source}分钟读取失败`):!base?"缺少当日前收盘价":undefined;if(error)warnings.push(`${p.name}：${error}`);return {code:p.code,name:p.name,preClose:base??0,bars:result?.status==="fulfilled"&&base?result.value.bars:[],error};};
  const peers=peersWanted.map(p=>asPeer(p,"行业")),themePeers=themePeersWanted.map(p=>asPeer(p,"题材"));
  const [main]=await Promise.all([mainPromise,metadata]);
  if(!group)warnings.push("前一日未找到该股所属行业与核心评分，主线条件保持未知");
  const stale=mode==="live"&&!minuteFresh(date,main?.bars.at(-1)?.time);
  if(stale)warnings.push("分钟行情延迟或缺失，暂停当前辅助信号");
  return {code,name:core?.name??code,date,mode,basisDate:prior.date,sector:group?.name??"未分类",bars:main?.bars??[],peers,themePeers,themeBasis,preClose,floatShares,upLimit,
    mainlineCore:group?.score!=null&&core?.score!=null?group.qualification.status==="通过"&&core.score>=65:null,
    themeAllowed,
    marketAllowed:prior.market.playbook.allowNewRisk===null||mode==="live"&&liveAllowed===null?null:prior.market.playbook.allowNewRisk===true&&(mode!=="live"||liveAllowed===true),basisCore:core,
    basisSector:group?{score:group.score,label:group.label,phase:group.phase}:null,marketBasis:{score:prior.market.score,risk:prior.market.risk},
    warnings:[...new Set(warnings)],fetchedAt:main?.fetchedAt??new Date().toISOString(),stale,blocked:warnings.some(w=>/40204|IP数量|权限|访问频次/.test(w))};
}
