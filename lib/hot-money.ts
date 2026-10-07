import type {Row} from "./market-data";

export type HotMoneyPerson={name:string;description:string;organizations:string};
export type HotMoneyTrade={date:string;code:string;stockName:string;hotMoneyName:string;organizations:string;buyAmount:number|null;sellAmount:number|null;netAmount:number|null;tag:string};

const amount=(value:unknown)=>value===null||value===undefined||value===""?null:Number.isFinite(Number(value))?Number(value):null;
const clean=(value:unknown)=>typeof value==="string"?value.trim():"";

export function normalizeHotMoneyRoster(rows:Row[]):HotMoneyPerson[]{
  const seen=new Set<string>();
  return rows.flatMap(row=>{
    const name=clean(row.name);
    if(!name||seen.has(name))return [];
    seen.add(name);
    return [{name,description:clean(row.desc),organizations:clean(row.orgs)}];
  }).sort((a,b)=>a.name.localeCompare(b.name,"zh-CN"));
}

export function normalizeHotMoneyTrades(rows:Row[],date:string):HotMoneyTrade[]{
  const expected=date.replaceAll("-","");
  return rows.map(row=>{
    const code=clean(row.ts_code),rawDate=clean(row.trade_date);
    if(rawDate!==expected||!/^\d{6}\.(SH|SZ|BJ)$/.test(code))throw new Error("游资明细日期或证券代码校验失败");
    const buyAmount=amount(row.buy_amount),sellAmount=amount(row.sell_amount),netAmount=amount(row.net_amount);
    if([buyAmount,sellAmount].some(n=>n!==null&&n<0)||!clean(row.hm_name))throw new Error("游资明细名称或金额校验失败");
    return {date,code,stockName:clean(row.ts_name)||code,hotMoneyName:clean(row.hm_name),organizations:clean(row.hm_orgs),buyAmount,sellAmount,netAmount,tag:clean(row.tag)};
  }).sort((a,b)=>Math.abs(b.netAmount??0)-Math.abs(a.netAmount??0)||a.code.localeCompare(b.code));
}
