import {equalWeightBasket,seriesForCode,type Candle} from "@/lib/candle-data";
import {derivedCache} from "@/lib/derived-cache";
import {validDate,type Row} from "@/lib/market-data";
import {chinaNow} from "@/lib/minute-engine";
import {MarketError,marketDates,tushare} from "@/lib/tushare";

export const dynamic="force-dynamic";
type Result={kind:"theme"|"industry";label:string;source:string;dates:string[];points:Candle[];missingDates:string[];note:string};
const fields="ts_code,trade_date,open,high,low,close,pre_close,amount";

async function themeChart(code:string,dates:string[]):Promise<Result>{
  const packet=await tushare("dc_daily",{ts_code:code,start_date:dates[0].replaceAll("-",""),end_date:dates.at(-1)!.replaceAll("-","")},"ts_code,trade_date,open,high,low,close,amount",2000);
  const points=seriesForCode(packet.rows,code,dates,"yuan");
  if(!points.length)throw new MarketError("该题材没有返回东财概念指数日线");
  const found=new Set(points.map(p=>p.date));
  return {kind:"theme",label:"东财概念指数 · 日K",source:"Tushare dc_daily",dates,points,missingDates:dates.filter(d=>!found.has(d)),note:"指数点位与成交额反映题材整体交易，不代表任一成分股；缺失交易日保留空位。"};
}

async function industryChart(name:string,dates:string[]):Promise<Result>{
  const compact=dates.at(-1)!.replaceAll("-",""),basic:Row[]=[],errors:string[]=[];
  for(const status of ["L","D","P"]){
    try{basic.push(...(await tushare("stock_basic",{list_status:status},"ts_code,industry,list_date,delist_date")).rows);}
    catch(e){if(status==="L")throw e;errors.push(status);}
  }
  if(errors.length)throw new MarketError("历史股票分类列表未完整返回，无法计算行业篮子");
  const members=new Set(basic.filter(row=>String(row.industry||"未分类")===name&&(!row.list_date||String(row.list_date)<=compact)&&(!row.delist_date||String(row.delist_date)>compact)).map(row=>String(row.ts_code)));
  if(!members.size)throw new MarketError("该行业没有可计算的成员");
  const dailyByDate:Row[][]=[];
  // A bounded batch keeps the first open responsive while reusing Tushare's raw cache.
  for(let i=0;i<dates.length;i+=4){
    const packets=await Promise.all(dates.slice(i,i+4).map(d=>tushare("daily",{trade_date:d.replaceAll("-","")},fields)));
    dailyByDate.push(...packets.map(p=>p.rows));
  }
  const {points,coverage}=equalWeightBasket(dates,members,dailyByDate);
  if(!points.length)throw new MarketError("行业成员日线覆盖不足，无法画出可信的等权走势");
  const found=new Set(points.map(p=>p.date));
  return {kind:"industry",label:"当前成员等权走势 · 日K",source:"Tushare stock_basic + daily",dates,points,missingDates:dates.filter(d=>!found.has(d)),note:`按所选日行业成员固定名单回看，基准100；不是官方行业指数。每日需至少65%成员有行情，最低覆盖 ${Math.min(...coverage)}/${members.size}。成交额为有行情成员之和。`};
}

export async function GET(request:Request){
  const q=new URL(request.url).searchParams,date=q.get("date")??"",kind=q.get("kind")??"",code=q.get("code")??"",name=q.get("name")??"",mode=q.get("mode")??"close";
  if(!validDate(date)||date>chinaNow().date||!["theme","industry"].includes(kind)||!["close","live"].includes(mode)||kind==="theme"&&!/^BK\d+\.DC$/.test(code)||kind==="industry"&&(!name||name.length>40))return Response.json({error:"板块K线参数无效"},{status:400});
  try{
    const result=await derivedCache(`block-chart:v1:${kind}:${kind==="theme"?code:name}:${date}:${mode}`,date===chinaNow().date?60000:7*86400000,async()=>{
      const {dates:all}=await marketDates(date,mode==="live"?21:20),dates=mode==="live"?all.slice(0,-1):all;
      if(dates.length!==20||mode==="close"&&dates.at(-1)!==date)throw new MarketError("近20个完整交易日不足");
      return kind==="theme"?themeChart(code,dates):industryChart(name,dates);
    },false,(v:Result)=>v.points.length>0);
    return Response.json(result,{headers:{"Cache-Control":"private, no-store"}});
  }catch(e){return Response.json({error:e instanceof Error?e.message:"板块K线读取失败"},{status:502});}
}
