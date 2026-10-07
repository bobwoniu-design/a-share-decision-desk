import type {Row} from "./market-data";

export type BoardListItem={code:string;name:string;industry:string;status:"涨停"|"炸板"|"今日未触板";today:boolean;height:number|null;touches7:number;sealed7:number;pct:number|null;amountYi:number|null;openTimes:number|null;firstTime:string|null};
export type BoardList={date:string;dates:string[];items:BoardListItem[];sealed:number;broken:number;fetchedAt:string;source:"Tushare limit_list_d"};

const number=(value:unknown)=>value===null||value===undefined||value===""?null:Number.isFinite(Number(value))?Number(value):null;
export function buildBoardList(date:string,dates:string[],rowsByDate:Row[][]):Omit<BoardList,"fetchedAt"|"source">{
  if(dates.length!==7||rowsByDate.length!==7||dates.at(-1)!==date||new Set(dates).size!==7||dates.some((d,i)=>i>0&&d<=dates[i-1]))throw new Error("近7个交易日日期不完整");
  const counts=new Map<string,{touches:number;sealed:number;last:Row}>();
  rowsByDate.forEach((rows,i)=>{
    const expected=dates[i].replaceAll("-", ""),seen=new Set<string>();
    for(const row of rows){
      const code=String(row.ts_code??""),status=String(row.limit??"");
      if(String(row.trade_date)!==expected||!/^\d{6}\.(SH|SZ|BJ)$/.test(code)||seen.has(code)||!["U","Z","D"].includes(status))throw new Error(`${dates[i]} 涨跌停名单日期、代码或状态校验失败`);
      seen.add(code);
      if(status!=="U"&&status!=="Z")continue;
      const previous=counts.get(code)??{touches:0,sealed:0,last:row};previous.touches++;if(status==="U")previous.sealed++;previous.last=row;counts.set(code,previous);
    }
  });
  const current=new Map(rowsByDate.at(-1)!.filter(r=>r.limit==="U"||r.limit==="Z").map(r=>[String(r.ts_code),r]));
  const items=[...counts].map(([code,count])=>{
    const today=current.has(code),r=current.get(code)??count.last,sealed=today&&r.limit==="U",height=sealed?number(r.limit_times):null,pct=today?number(r.pct_chg):null,amount=today?number(r.amount):null,openTimes=today?number(r.open_times):null;
    if(sealed&&(height===null||!Number.isInteger(height)||height<1)||amount!==null&&amount<0||openTimes!==null&&openTimes<0)throw new Error("涨停榜单数值校验失败");
    return {code,name:String(r.name??code),industry:String(r.industry??"未分类"),status:sealed?"涨停" as const:today?"炸板" as const:"今日未触板" as const,today,height,touches7:count.touches,sealed7:count.sealed,pct,amountYi:amount===null?null:amount/100000,openTimes,firstTime:today&&r.first_time?String(r.first_time):null};
  }).sort((a,b)=>(b.height??0)-(a.height??0)||b.touches7-a.touches7||(b.amountYi??0)-(a.amountYi??0)||a.code.localeCompare(b.code));
  return {date,dates,items,sealed:items.filter(i=>i.status==="涨停").length,broken:items.filter(i=>i.status==="炸板").length};
}
