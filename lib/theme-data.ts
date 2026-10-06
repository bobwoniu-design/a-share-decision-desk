import { auditThemeRows, compareThemeMembers } from "./theme-quality";
import { dailyRows, type Row } from "./market-data";
import { sectorGroups, type SectorGroup } from "./sectors";
import { marketDates, MarketError, tushare } from "./tushare";
import { scoreThemeDays, withThemeLadder, type ThemeOverview } from "./themes";

const indexFields="ts_code,trade_date,name,leading,leading_code,pct_change,leading_pct,total_mv,turnover_rate,up_num,down_num,idx_type";
const memberFields="trade_date,ts_code,con_code,name";
const limitFields="ts_code,trade_date,name,industry,limit,limit_times,close,pct_chg";
type ThemeMode="close"|"live";
export type ThemeDetail={date:string;asOfDate:string;mode:ThemeMode;code:string;name:string;group:SectorGroup;leaderFromSource:{name:string;code:string};memberChange:ReturnType<typeof compareThemeMembers>|null;memberCount:number;warnings:string[];fetchedAt:string};

const jobs=new Map<string,Promise<ThemeOverview>>();
const memory=new Map<string,{until:number;value:ThemeOverview}>();
export async function themeOverview(date:string,mode:ThemeMode):Promise<ThemeOverview>{
  const key=`${date}:${mode}`,cached=memory.get(key);
  if(cached&&cached.until>Date.now())return cached.value;
  if(jobs.has(key))return jobs.get(key)!;
  const job=(async()=>{
    const calendar=await marketDates(date,mode==="live"?8:7);
    if(calendar.dates.at(-1)!==date)throw new MarketError(`${date} 不是已确认交易日`);
    const asOfDate=mode==="live"?calendar.dates.at(-2)!:date;
    const dates=mode==="live"?calendar.dates.slice(-8,-1):calendar.dates.slice(-7);
    if(dates.length<7)throw new MarketError("题材初筛需要至少7个交易日的历史概念快照");
    const days:{date:string;rows:Row[]}[]=[];
    for(let i=0;i<dates.length;i+=2){
      const batch=await Promise.all(dates.slice(i,i+2).map(async day=>{
        const packet=await tushare("dc_index",{trade_date:day.replaceAll("-",""),idx_type:"概念板块"},indexFields,5000);
        const quality=auditThemeRows(packet.rows,day,"index");
        if(!quality.usable||packet.rows.some(r=>r.idx_type!=="概念板块"))throw new MarketError(`${day} 题材目录缺失或日期、代码、分类不一致`);
        return {date:day,rows:packet.rows};
      }));
      days.push(...batch);
    }
    let themes=scoreThemeDays(days);
    const pending=themes.filter(t=>t.qualification.status==="待核验"&&t.score!==null);
    const warnings=["题材强度分只衡量相对表现；主线资格另查当日强度、五日持续、五日累计、上涨广度与成员涨停梯队。阈值是待回测的初版规则，缺项保持待核验，主线初筛不等于交易确认。","明显的昨日涨停、连板、打板和反转股等交易表现分组单独标识，不参加题材主线雷达。",...(mode==="live"?["概念数据没有可核实的盘中发布时间；盘中仅展示前一交易日收盘快照，不产生实时题材信号。"]:[])];
    if(pending.length>20)warnings.push(`日线资格符合 ${pending.length} 个题材；本次按强度先核对前20个，余下保持待梯队核验。`);
    if(pending.length){
      const key=asOfDate.replaceAll("-","");
      let limits:Row[]|null=null,daily:Row[]|null=null;
      try{
        const [l,d]=await Promise.all([tushare("limit_list_d",{trade_date:key},limitFields,2500),tushare("daily",{trade_date:key},"ts_code,trade_date,close,pre_close,pct_chg,amount")]);
        if(!d.rows.length||l.rows.some(r=>r.trade_date!==key)||d.rows.some(r=>r.trade_date!==key))throw new Error("日期或行情不完整");
        limits=l.rows;daily=d.rows;
      }catch{warnings.push("所选日涨停名单或日线不可用；符合日线条件的题材暂列待梯队核验。");}
      if(limits&&daily){
        const quoted=new Set(daily.map(r=>String(r.ts_code))),limitMap=new Map(limits.filter(r=>r.limit==="U").map(r=>[String(r.ts_code),r]));
        const checked=new Map<string,ReturnType<typeof withThemeLadder>>();
        for(let i=0;i<Math.min(20,pending.length);i+=2){
          const batch=pending.slice(i,i+2);
          const results=await Promise.allSettled(batch.map(t=>tushare("dc_member",{ts_code:t.code,trade_date:key},memberFields,5000)));
          results.forEach((result,j)=>{
            const t=batch[j];
            if(result.status!=="fulfilled"||!auditThemeRows(result.value.rows,asOfDate,"member",t.code).usable){checked.set(t.code,withThemeLadder(t,null));return;}
            const members=new Set(result.value.rows.map(r=>String(r.con_code)));
            const hits=[...members].flatMap(code=>{const l=limitMap.get(code);return l?[l]:[];});
            const heights=hits.map(r=>Number(r.limit_times));
            if(heights.some(n=>!Number.isInteger(n)||n<1)){checked.set(t.code,withThemeLadder(t,null));return;}
            checked.set(t.code,withThemeLadder(t,{limitUp:hits.length,maxHeight:Math.max(0,...heights),traded:[...members].filter(code=>quoted.has(code)).length,members:members.size}));
          });
        }
        themes=themes.map(t=>checked.get(t.code)??t);
        if([...checked.values()].some(t=>t.qualification.status==="待核验"))warnings.push("部分题材的历史成分或梯队证据不足，资格保持待核验。");
      }
    }
    const overview:ThemeOverview={date,asOfDate,mode,source:"Tushare dc_index · 东财概念",version:"THEME-0.2",themes,warnings,fetchedAt:new Date().toISOString()};
    memory.set(key,{until:Date.now()+300000,value:overview});
    return overview;
  })();
  jobs.set(key,job);try{return await job;}finally{jobs.delete(key);}
}

export async function themeDetail(date:string,mode:ThemeMode,code:string):Promise<ThemeDetail>{
  const overview=await themeOverview(date,mode),theme=overview.themes.find(t=>t.code===code);
  if(!theme)throw new MarketError("所选日期的题材目录中没有该代码");
  const asOfDate=overview.asOfDate,key=asOfDate.replaceAll("-",""),previous=(await marketDates(asOfDate,2)).dates.at(-2);
  const current=await tushare("dc_member",{ts_code:code,trade_date:key},memberFields,5000);
  if(!auditThemeRows(current.rows,asOfDate,"member",code).usable)throw new MarketError("题材历史成分缺失或存在重复、错日期、错代码，详情已暂停");
  const warnings:string[]=[];
  let change:ThemeDetail["memberChange"]=null;
  if(previous){try{
    const old=await tushare("dc_member",{ts_code:code,trade_date:previous.replaceAll("-","")},memberFields,5000);
    if(auditThemeRows(old.rows,previous,"member",code).usable)change=compareThemeMembers(old.rows,current.rows);
    else warnings.push("前一交易日成分缺失，成员增减保持未知");
  }catch{warnings.push("前一交易日成分不可用，成员增减保持未知");}}
  const daily=await tushare("daily",{trade_date:key},"ts_code,trade_date,close,pre_close,pct_chg,amount");
  if(!daily.rows.length)throw new MarketError("所选日期日线缺失，不能展示题材成员行情");
  let limits:Row[]|null=null;
  try{const packet=await tushare("limit_list_d",{trade_date:key},limitFields,2500);if(packet.rows.some(r=>r.trade_date!==key))throw new Error("涨跌停日期不一致");limits=packet.rows;}
  catch{warnings.push("涨跌停名单缺失，龙头梯队候选和封板统计保持未知");}
  const codes=new Set(current.rows.map(r=>String(r.con_code)));
  const basic=current.rows.map(r=>({ts_code:r.con_code,name:r.name,industry:theme.name}));
  const group=sectorGroups(dailyRows(daily.rows,asOfDate).filter(p=>codes.has(p.code)),basic,limits,asOfDate)[0];
  if(!group)throw new MarketError("题材成分未形成有效分组");
  if(group.traded/group.total<.8)warnings.push(`成员行情覆盖 ${group.traded}/${group.total}，需谨慎解释板块广度与排名`);
  warnings.push("东财概念成分按所选收盘日期读取；无法证明盘中哪个时点已可用。成员角色仅为当日量价排序候选，非人工确认的交易地位。");
  return {date,asOfDate,mode,code,name:theme.name,group,leaderFromSource:{name:theme.leading,code:theme.leadingCode},memberChange:change,memberCount:current.rows.length,warnings,fetchedAt:current.fetchedAt};
}
