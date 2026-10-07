import type {Row} from "./market-data";

export type LimitUpDay={
  date:string;
  byCode:Record<string,{name:string;height:number}>;
  sealed:number;
  fetchedAt:string;
  source:"Tushare limit_list_d";
};

export function buildLimitUpDay(date:string,rows:Row[],fetchedAt:string):LimitUpDay{
  if(!rows.length)throw new Error("所选日期未返回涨跌停名单，暂不能确认未涨停");
  const day=date.replaceAll("-",""),byCode:LimitUpDay["byCode"]={},seen=new Set<string>();
  for(const row of rows){
    const code=String(row.ts_code??""),status=String(row.limit??"");
    if(row.trade_date!==day||!/^[0-9]{6}\.(SH|SZ|BJ)$/.test(code)||seen.has(code)||!["U","Z","D"].includes(status))throw new Error("涨跌停名单日期、证券代码或状态校验失败");
    seen.add(code);
    if(status!=="U")continue;
    const height=Number(row.limit_times);
    if(!Number.isInteger(height)||height<1)throw new Error("涨停榜连板天数校验失败");
    byCode[code]={name:String(row.name??code),height};
  }
  return {date,byCode,sealed:Object.keys(byCode).length,fetchedAt,source:"Tushare limit_list_d"};
}
