import {candleFromRow,type Candle} from "@/lib/candle-data";
import {derivedCache} from "@/lib/derived-cache";
import {validDate,type Row} from "@/lib/market-data";
import {chinaNow} from "@/lib/minute-engine";
import {MarketError,marketDates,tushare} from "@/lib/tushare";

export const dynamic="force-dynamic";
type Related={names:string[];error:string|null};
type Extra={date:string;dates:string[];byCode:Record<string,{candles:Candle[];themes:Related}>};
const codePattern=/^\d{6}\.(SH|SZ|BJ)$/;

export async function GET(request:Request){
  const q=new URL(request.url).searchParams,date=q.get("date")??"",codes=(q.get("codes")??"").split(",").filter(Boolean);
  if(!validDate(date)||date>chinaNow().date||!codes.length||codes.length>15||new Set(codes).size!==codes.length||codes.some(code=>!codePattern.test(code)))return Response.json({error:"榜单附加数据参数无效"},{status:400});
  try{
    const result=await derivedCache(`board-extras:v1:${date}:${codes.slice().sort().join(",")}`,date===chinaNow().date?60000:7*86400000,async():Promise<Extra>=>{
      const {dates}=await marketDates(date,7);
      if(dates.length!==7||dates.at(-1)!==date)throw new MarketError("近7个交易日不完整");
      const daily:Row[][]=[];
      for(let i=0;i<dates.length;i+=4){
        const packets=await Promise.all(dates.slice(i,i+4).map(d=>tushare("daily",{trade_date:d.replaceAll("-","")},"ts_code,trade_date,open,high,low,close,amount")));
        daily.push(...packets.map(p=>p.rows));
      }
      const wanted=new Set(codes),candles=new Map(codes.map(code=>[code,[] as Candle[]]));
      daily.forEach((rows,i)=>{const seen=new Set<string>();for(const row of rows){const code=String(row.ts_code);if(!wanted.has(code))continue;const point=candleFromRow(row,"thousand");if(!point||point.date!==dates[i]||seen.has(code))throw new MarketError("个股小K线日期或价格校验失败");seen.add(code);candles.get(code)!.push(point);}});
      let names=new Map<string,string>(),catalogError:string|null=null;
      try{const catalog=await tushare("dc_index",{trade_date:date.replaceAll("-",""),idx_type:"概念板块"},"ts_code,trade_date,name,idx_type",5000);names=new Map(catalog.rows.filter(row=>row.trade_date===date.replaceAll("-","")&&row.idx_type==="概念板块").map(row=>[String(row.ts_code),String(row.name)]));if(!names.size)catalogError="题材目录缺失";}
      catch(e){catalogError=e instanceof Error?e.message:"题材目录读取失败";}
      const related=new Map<string,Related>();
      if(catalogError){for(const code of codes)related.set(code,{names:[],error:catalogError});}
      else for(let i=0;i<codes.length;i+=5){
        const batch=codes.slice(i,i+5),packets=await Promise.allSettled(batch.map(code=>tushare("dc_member",{con_code:code,trade_date:date.replaceAll("-","")},"trade_date,ts_code,con_code,name",5000)));
        packets.forEach((packet,j)=>{const code=batch[j];if(packet.status==="rejected"){related.set(code,{names:[],error:packet.reason instanceof Error?packet.reason.message:"题材成分读取失败"});return;}
          const codes=new Set<string>();for(const row of packet.value.rows){if(row.con_code!==code||row.trade_date!==date.replaceAll("-",""))throw new MarketError("个股题材成分日期或代码校验失败");codes.add(String(row.ts_code));}
          const unknown=[...codes].filter(c=>!names.has(c));related.set(code,{names:[...codes].map(c=>names.get(c)).filter((n):n is string=>!!n).sort((a,b)=>a.localeCompare(b,"zh-CN")),error:unknown.length?`${unknown.length} 个题材代码未在当日目录找到名称`:null});
        });
      }
      return {date,dates,byCode:Object.fromEntries(codes.map(code=>[code,{candles:candles.get(code)??[],themes:related.get(code)??{names:[],error:"题材成分未返回"}}]))};
    },false,(v:Extra)=>Object.keys(v.byCode).length===codes.length);
    return Response.json(result,{headers:{"Cache-Control":"private, no-store"}});
  }catch(e){return Response.json({error:e instanceof Error?e.message:"榜单附加数据读取失败"},{status:502});}
}
