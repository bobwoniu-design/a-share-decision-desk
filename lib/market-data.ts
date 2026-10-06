export const DEFAULT_MARKET_DATE = "2026-09-30";
export type Row = Record<string, unknown>;
export type Bar = { time: string; open: number; high: number; low: number; close: number; vol: number; amount: number };
export function numeric(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value); return Number.isFinite(n) ? n : null;
}
export function validDate(date: string) {
  return /^20\d{2}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(date)) && new Date(date).toISOString().slice(0, 10) === date;
}
export function dailyRows(rows: Row[], date: string) {
  const seen = new Set<string>();
  return rows.map(r => {
    const code = String(r.ts_code);
    if (r.trade_date !== date.replaceAll("-", "") || seen.has(code) || !/^\d{6}\.(SH|SZ|BJ)$/.test(code)) throw new Error("日线日期或唯一性校验失败");
    seen.add(code);
    const close = numeric(r.close), pct = numeric(r.pct_chg), amount = numeric(r.amount), preClose = numeric(r.pre_close);
    if (close === null || close <= 0 || pct === null || amount === null || amount < 0 || preClose === null || preClose <= 0) throw new Error("日线价格或成交额字段不完整");
    return { code, close, pct, amount: amount * 1000, preClose };
  });
}
export function minuteRows(rows: Row[], code: string, date: string): Bar[] {
  const seen = new Set<string>();
  return rows.map(r => {
    const timestamp = String(r.trade_time), time = timestamp.slice(11, 16);
    if (r.ts_code !== code || timestamp.slice(0,10) !== date || !/^\d{2}:\d{2}$/.test(time) || seen.has(time)) throw new Error("分钟行情日期、股票或唯一性校验失败");
    seen.add(time);
    const values = [r.open,r.high,r.low,r.close,r.vol,r.amount].map(numeric);
    if (values.some(v => v === null || v < 0)) throw new Error("分钟行情字段不完整");
    const [open,high,low,close,vol,amount] = values as number[];
    if (low > Math.min(open,close) || high < Math.max(open,close) || low <= 0) throw new Error("分钟行情价格关系异常");
    return {time,open,high,low,close,vol,amount};
  }).sort((a,b)=>a.time.localeCompare(b.time));
}
export function breadth(rows: ReturnType<typeof dailyRows>) {
  return { total:rows.length, up:rows.filter(r=>r.pct>0).length, down:rows.filter(r=>r.pct<0).length, flat:rows.filter(r=>r.pct===0).length,
    amountYi:rows.filter(r=>/\.(SH|SZ)$/.test(r.code)).reduce((s,r)=>s+r.amount,0)/1e8 };
}
export function limits(rows: Row[] | null) {
  if (rows === null) return null;
  const up=rows.filter(r=>r.limit==="U"), down=rows.filter(r=>r.limit==="D"), broken=rows.filter(r=>r.limit==="Z");
  const touched = new Set([...up,...broken].map(r=>String(r.ts_code)));
  return { up:up.length, down:down.length, broken:broken.length, height:up.length?Math.max(...up.map(r=>numeric(r.limit_times)??0)):0, brokenRate:touched.size?broken.length/touched.size*100:null };
}
export type Candidate = { code:string; name:string; industry:string; close:number; pct:number; amount:number; preClose:number; label:string };
export type MarketSnapshot = {
  date:string; fetchedAt:string; source:"Tushare"; coverage:ReturnType<typeof breadth>; limits:ReturnType<typeof limits>;
  premium:{value:number|null;matched:number;total:number;date:string}|null;
  sectors:{name:string;count:number}[]; candidates:Candidate[];
  warnings:string[]; sources:{api:string;rows:number;fetchedAt:string}[];
};

export type DailyPoint = {
  date:string; open:number; high:number; low:number; close:number; preClose:number; volShou:number; adjustedOpen:number|null; adjustedHigh:number|null; adjustedLow:number|null; adjustedClose:number|null; ma5:number|null; ma20:number|null; pct:number; amountYi:number; amountMa5:number|null; amountRatio5:number|null;
};
export type DailyHistory = {
  code:string; date:string; requestedDays:number; dates:string[]; points:DailyPoint[]; missingDates:string[];
  suspendedDates:string[]; adjusted:boolean; return5:number|null; return20:number|null; warnings:string[]; fetchedAt:string;
};
export function tradingDates(rows:Row[],end:string,count:number){
  return [...new Set(rows.filter(r=>Number(r.is_open)===1).map(r=>String(r.cal_date)))].filter(d=>/^\d{8}$/.test(d)&&d<=end.replaceAll("-","")).sort().slice(-count).map(d=>`${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6)}`);
}
export function dailyHistory(rows:Row[],factors:Row[],code:string,dates:string[]):Omit<DailyHistory,"fetchedAt"|"warnings">{
  const wanted=new Set(dates.map(d=>d.replaceAll("-",""))),seen=new Set<string>();
  const data=rows.map(r=>{
    const date=String(r.trade_date),close=numeric(r.close),preClose=numeric(r.pre_close),pct=numeric(r.pct_chg),amount=numeric(r.amount);
    if(r.ts_code!==code||!wanted.has(date)||seen.has(date)||close===null||close<=0||preClose===null||preClose<=0||pct===null||amount===null||amount<0)throw new Error("日线时间序列校验失败");
    const open=numeric(r.open),high=numeric(r.high),low=numeric(r.low),vol=numeric(r.vol);
    if(open===null||high===null||low===null||vol===null||vol<0||low<=0||low>Math.min(open,close)||high<Math.max(open,close))throw new Error("日线开高低收或成交量校验失败");
    seen.add(date);return {open,high,low,volShou:vol,date:`${date.slice(0,4)}-${date.slice(4,6)}-${date.slice(6)}`,close,preClose,pct,amountYi:amount/100000};
  }).sort((a,b)=>a.date.localeCompare(b.date));
  const factorMap=new Map<string,number>();
  for(const r of factors){const f=numeric(r.adj_factor),d=String(r.trade_date);if(r.ts_code!==code||f===null||f<=0||factorMap.has(d))throw new Error("复权因子校验失败");factorMap.set(d,f);}
  const adjusted=data.length>0&&data.every(r=>factorMap.has(r.date.replaceAll("-","")));
  const base=adjusted?factorMap.get(data.at(-1)!.date.replaceAll("-",""))!:null;
  const values=data.map(r=>base?r.close*factorMap.get(r.date.replaceAll("-",""))!/base:null);
  const points=data.map((r,i)=>{
    const factor=base?factorMap.get(r.date.replaceAll("-",""))!/base:null;
    const previous=i>=5?data.slice(i-5,i).reduce((s,p)=>s+p.amountYi,0)/5:null;
    return {...r,adjustedOpen:factor===null?null:r.open*factor,adjustedHigh:factor===null?null:r.high*factor,adjustedLow:factor===null?null:r.low*factor,adjustedClose:values[i],ma5:adjusted&&i>=4?values.slice(i-4,i+1).reduce<number>((a,v)=>a+v!,0)/5:null,ma20:adjusted&&i>=19?values.slice(i-19,i+1).reduce<number>((a,v)=>a+v!,0)/20:null,amountMa5:i>=4?data.slice(i-4,i+1).reduce((s,p)=>s+p.amountYi,0)/5:null,amountRatio5:previous&&previous>0?r.amountYi/previous:null};
  });
  const byDate=new Map(points.map(p=>[p.date,p]));
  const change=(n:number)=>{const last=byDate.get(dates.at(-1)!),previous=byDate.get(dates.at(-n-1)!);return last?.adjustedClose&&previous?.adjustedClose?(last.adjustedClose/previous.adjustedClose-1)*100:null;};
  return {code,suspendedDates:[],date:dates.at(-1)??"",requestedDays:dates.length,dates,points,missingDates:dates.filter(d=>!byDate.has(d)),adjusted,return5:change(5),return20:change(20)};
}
export type TimelinePoint = Pick<MarketSnapshot,"date"|"coverage"|"limits"|"premium"|"sectors"|"warnings">;
export type MarketTimeline = {date:string;dates:string[];points:TimelinePoint[];failures:{date:string;error:string}[];fetchedAt:string};
