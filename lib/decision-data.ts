import {tushare,marketDates,marketMinutes,MarketError} from "./tushare";
import {dailyRows,minuteRows,numeric,type Row,type Bar} from "./market-data";
import {sectorGroups} from "./sectors";
import {buildDecision,type DecisionDay,type DecisionOverview} from "./decision-engine";
import {chinaNow,minuteFresh,type PeerSeries} from "./minute-engine";

const limitFields="ts_code,trade_date,name,industry,limit,limit_times,close,pct_chg";
const jobs=new Map<string,Promise<{overview:DecisionOverview;days:DecisionDay[]}>>();
const memory=new Map<string,{until:number;value:{overview:DecisionOverview;days:DecisionDay[]}}>();
async function basicRows(warnings:string[]){
  const fields="ts_code,name,industry,list_date,delist_date",rows=[...(await tushare("stock_basic",{list_status:"L"},fields)).rows];
  for(const s of ["D","P"]){try{rows.push(...(await tushare("stock_basic",{list_status:s},fields)).rows);}catch(e){warnings.push(e instanceof Error?e.message:"历史股票列表缺失");}}
  return rows;
}
async function closeDay(date:string,basic:Row[],warnings:string[]):Promise<DecisionDay>{
  const d=date.replaceAll("-",""),packet=await tushare("daily",{trade_date:d},"ts_code,trade_date,close,pre_close,pct_chg,amount");
  if(!packet.rows.length)throw new MarketError(`${date} 日线缺失，不能跨过缺失日计算持续性`);
  const prices=dailyRows(packet.rows,date);let limits:Row[]|null=null;
  try{limits=(await tushare("limit_list_d",{trade_date:d},limitFields,2500)).rows;if(limits.some(r=>r.trade_date!==d))throw new Error("涨跌停日期不一致");}catch(e){limits=null;warnings.push(`${date}：${e instanceof Error?e.message:"涨跌停数据缺失"}`);}
  return {date,prices,limits,groups:sectorGroups(prices,basic,limits,date)};
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
export async function decisionData(date:string,mode:"close"|"live"="close"){
  const key=`${date}:${mode}`,cached=memory.get(key);if(cached&&cached.until>Date.now())return cached.value;
  if(jobs.has(key))return jobs.get(key)!;
  const job=(async()=>{
    const warnings:string[]=[],{dates}=await marketDates(date,20);
    if(dates.at(-1)!==date)throw new MarketError(`${date} 不是交易日，未替换为其他日期`);
    const basic=await basicRows(warnings),wanted=mode==="live"?dates.slice(0,-1):dates,days:DecisionDay[]=[];
    for(let i=0;i<wanted.length;i+=2){days.push(...await Promise.all(wanted.slice(i,i+2).map(d=>closeDay(d,basic,warnings))));}
    if(mode==="live")days.push(await realtimeDay(date,basic,days.at(-1)!,warnings));
    warnings.push("当前使用股票行业分类识别主线代理，未覆盖概念题材；历史行业变更未还原。分数为可解释规则分，不是概率或已验证收益。");
    const overview=buildDecision(days,[...new Set(warnings)]),value={overview,days};
    memory.clear();
    memory.set(key,{until:Date.now()+(mode==="live"?45000:300000),value});return value;
  })();jobs.set(key,job);try{return await job;}finally{jobs.delete(key);}
}
export async function realtimeMinutes(code:string,date:string){
  const now=chinaNow();if(date!==now.date)throw new MarketError("实时分钟日期必须是今天");
  const p=await tushare("rt_min_daily",{ts_code:code,freq:"1MIN"},"",8000,45000);
  const rows=p.rows.map(r=>({...r,ts_code:r.ts_code??r.code,trade_time:r.time}));
  const bars=minuteRows(rows,code,date).filter(b=>b.time<now.time);
  return {code,date,bars,fetchedAt:p.fetchedAt,source:"Tushare rt_min_daily"};
}
export type MinuteBundle={
  code:string;name:string;date:string;mode:"close"|"live";basisDate:string;sector:string;
  bars:Bar[];peers:PeerSeries[];preClose:number|null;floatShares:number|null;upLimit:number|null;
  mainlineCore:boolean|null;marketAllowed:boolean|null;basisCore:ReturnType<typeof buildDecision>["cores"][number]|null;
  basisSector:{score:number|null;label:string;phase:string}|null;marketBasis:{score:number|null;risk:string};
  warnings:string[];fetchedAt:string;stale:boolean;blocked:boolean;
};
export async function decisionMinutes(code:string,date:string,mode:"close"|"live"):Promise<MinuteBundle>{
  const warnings:string[]=[],references=new Map<string,number>();let prior:DecisionOverview,liveAllowed:boolean|null=null;
  try{
    const {days,overview}=await decisionData(date,mode);prior=buildDecision(days.slice(0,-1));
    days.at(-1)!.prices.forEach(p=>references.set(p.code,p.preClose));
    if(mode==="live")liveAllowed=overview.market.score===null||overview.market.risk==="待数据"?null:overview.market.score>=45&&overview.market.risk!=="高";
  }catch(e){
    if(mode!=="live")throw e;
    const {dates}=await marketDates(date,20);if(dates.at(-1)!==date)throw new MarketError(`${date} 不是交易日`);
    prior=(await decisionData(dates.at(-2)!,"close")).overview;
    warnings.push(`盘中全市场条件未知，暂停三笔提示：${e instanceof Error?e.message:"读取失败"}`);
    // Minute permissions are independent of realtime daily permissions. Keep the price state usable.
    try{const p=await tushare("stk_limit",{trade_date:date.replaceAll("-","")},"ts_code,trade_date,pre_close,up_limit,down_limit",5800);
      p.rows.filter(r=>r.trade_date===date.replaceAll("-","")).forEach(r=>{const n=numeric(r.pre_close);if(n&&n>0)references.set(String(r.ts_code),n);});
    }catch(e){warnings.push(e instanceof Error?e.message:"盘前参考价未获取");}
  }
  const group=prior.sectors.find(s=>s.cores.some(c=>c.code===code)),core=group?.cores.find(c=>c.code===code)??null;
  const preClose=references.get(code)??null;
  // Freeze constituents and roles before the session; exclude the selected stock from confirmation.
  const peersWanted=group?group.cores.filter(c=>c.code!==code).sort((a,b)=>(a.roles[0]==="观察成员"?1:0)-(b.roles[0]==="观察成员"?1:0)||(b.score??-1)-(a.score??-1)).slice(0,6):[];
  const fetchMinutes=(c:string)=>mode==="live"?realtimeMinutes(c,date):marketMinutes(c,date);
  let main:{bars:Bar[];fetchedAt:string}|null=null;
  try{main=await fetchMinutes(code);}catch(e){warnings.push(e instanceof Error?e.message:"个股分钟读取失败");}
  const peers:PeerSeries[]=[];
  for(let i=0;i<peersWanted.length;i+=2){const batch=peersWanted.slice(i,i+2);const results=await Promise.allSettled(batch.map(p=>fetchMinutes(p.code)));results.forEach((r,j)=>{const p=batch[j],base=references.get(p.code);const error=r.status==="rejected"?(r.reason instanceof Error?r.reason.message:"分钟读取失败"):!base?"缺少当日前收盘价":undefined;peers.push({code:p.code,name:p.name,preClose:base??0,bars:r.status==="fulfilled"&&base?r.value.bars:[],error});if(error)warnings.push(`${p.name}：${error}`);});}
  let floatShares:number|null=null,upLimit:number|null=null;
  await Promise.all([
    (async()=>{try{const p=await tushare("daily_basic",{ts_code:code,trade_date:prior.date.replaceAll("-","")},"ts_code,trade_date,float_share");const r=p.rows.find(r=>r.ts_code===code&&r.trade_date===prior.date.replaceAll("-","")),n=numeric(r?.float_share);if(n&&n>0)floatShares=n*10000;else warnings.push("前一交易日流通股本缺失，换手指标留空");}catch(e){warnings.push(e instanceof Error?e.message:"流通股本读取失败");}})(),
    (async()=>{try{const p=await tushare("stk_limit",{ts_code:code,trade_date:date.replaceAll("-","")},"ts_code,trade_date,up_limit,down_limit",5800);const r=p.rows.find(r=>r.ts_code===code&&r.trade_date===date.replaceAll("-",""));upLimit=numeric(r?.up_limit);}catch(e){warnings.push(e instanceof Error?e.message:"涨停价格读取失败");}})()
  ]);
  if(!group)warnings.push("前一日未找到该股所属行业与核心评分，主线条件保持未知");
  const stale=mode==="live"&&!minuteFresh(date,main?.bars.at(-1)?.time);
  if(stale)warnings.push("分钟行情延迟或缺失，暂停当前辅助信号");
  return {code,name:core?.name??code,date,mode,basisDate:prior.date,sector:group?.name??"未分类",bars:main?.bars??[],peers,preClose,floatShares,upLimit,
    mainlineCore:group?.score!=null&&core?.score!=null?group.score>=65&&core.score>=65:null,
    marketAllowed:prior.market.score===null||prior.market.risk==="待数据"||mode==="live"&&liveAllowed===null?null:prior.market.score>=45&&prior.market.risk!=="高"&&(mode!=="live"||liveAllowed===true),basisCore:core,
    basisSector:group?{score:group.score,label:group.label,phase:group.phase}:null,marketBasis:{score:prior.market.score,risk:prior.market.risk},
    warnings:[...new Set(warnings)],fetchedAt:main?.fetchedAt??new Date().toISOString(),stale,blocked:warnings.some(w=>/40204|IP数量|权限|访问频次/.test(w))};
}
