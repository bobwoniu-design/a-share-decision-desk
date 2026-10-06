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
