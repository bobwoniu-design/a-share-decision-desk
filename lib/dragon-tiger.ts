import type {Row} from "./market-data";

export type DragonTigerDay={
  date:string;
  byCode:Record<string,{name:string;reasons:string[]}>;
  rows:number;
  fetchedAt:string;
  source:"Tushare top_list";
};

export function buildDragonTigerDay(date:string,rows:Row[],fetchedAt:string):DragonTigerDay{
  if(!rows.length)throw new Error("所选日期未返回龙虎榜名单，暂不能确认未上榜");
  const day=date.replaceAll("-","");
  const byCode:DragonTigerDay["byCode"]={};
  for(const row of rows){
    const code=String(row.ts_code??"");
    if(row.trade_date!==day||!/^\d{6}\.(SH|SZ|BJ)$/.test(code))throw new Error("龙虎榜名单日期或证券代码校验失败");
    const item=byCode[code]??={name:String(row.name??code),reasons:[]};
    const reason=String(row.reason??"").trim();
    if(reason&&!item.reasons.includes(reason))item.reasons.push(reason);
  }
  return {date,byCode,rows:rows.length,fetchedAt,source:"Tushare top_list"};
}
