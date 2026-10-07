import {getChatGPTUser} from "@/app/chatgpt-auth";
import {validDate} from "@/lib/market-data";
import {tushare} from "@/lib/tushare";
import {candidateEvents} from "@/lib/candidate-events";
import {compactDate,daysBefore,displayDate,profileRows,safeLink,textValue} from "@/lib/research-data";
export const dynamic="force-dynamic";
const status=<T>(result:PromiseSettledResult<T>)=>result.status==="fulfilled"?{ok:true as const,data:result.value}:{ok:false as const,error:result.reason instanceof Error?result.reason.message:"数据暂不可用"};
export async function GET(request:Request){
  if(!await getChatGPTUser())return Response.json({error:"请登录后查看个股资料"},{status:401});
  const q=new URL(request.url).searchParams,code=q.get("code")??"",date=q.get("date")??"",section=q.get("section")??"";
  if(!/^\d{6}\.(SH|SZ|BJ)$/.test(code)||!validDate(date)||!["profile","events","reports"].includes(section))return Response.json({error:"查询参数无效"},{status:400});
  const d=compactDate(date),start=compactDate(daysBefore(date,90));
  if(section==="profile"){
    const [company,business]=await Promise.allSettled([
      tushare("stock_company",{ts_code:code},"ts_code,com_name,introduction,main_business,business_scope,website",1000,30*86400000),
      tushare("fina_mainbz",{ts_code:code,type:"P"},"ts_code,end_date,bz_item,bz_sales,bz_profit",100,30*86400000)
    ]);
    const info=profileRows(company.status==="fulfilled"?company.value.rows:[],business.status==="fulfilled"?business.value.rows:[],code,date);
    return Response.json({...info,companyStatus:status(company),businessStatus:status(business),asOf:date,blocked:company.status==="rejected"||business.status==="rejected",note:"公司简介为当前资料，主营构成只有报告期、没有可验证披露时间；历史回放中仅作背景参考，不参与当时评分。"},{headers:{"Cache-Control":"private, no-store"}});
  }
  if(section==="events"){
    const [announcements,forecasts,suspensions]=await Promise.allSettled([
      candidateEvents(code,date,90),
      tushare("forecast",{ts_code:code,start_date:start,end_date:d},"ts_code,ann_date,first_ann_date,type,p_change_min,p_change_max,summary,change_reason",2000,7*86400000),
      tushare("suspend_d",{ts_code:code,start_date:start,end_date:d},"ts_code,trade_date,suspend_timing,suspend_type",2000,7*86400000)
    ]);
    const ann=announcements.status==="fulfilled"?announcements.value:null;
    const forecast=forecasts.status==="fulfilled"?forecasts.value.rows.filter(r=>r.ts_code===code&&String(r.ann_date)<=d).map(r=>({date:displayDate(r.ann_date),title:`业绩预告 · ${textValue(r.type)||"类型待核验"}`,category:"业绩",detail:[textValue(r.summary),textValue(r.change_reason)].filter(Boolean).join("；"),url:null,source:"Tushare forecast",time:null})):[];
    const suspension=suspensions.status==="fulfilled"?suspensions.value.rows.filter(r=>r.ts_code===code&&String(r.trade_date)<=d).map(r=>({date:displayDate(r.trade_date),title: r.suspend_type==="S"?"停牌记录":"复牌记录",category:"停复牌",detail:textValue(r.suspend_timing)||"具体时点未提供",url:null,source:"Tushare suspend_d",time:null})):[];
    const events=[...(ann?.events??[]).map(e=>({...e,detail:e.beforeClose===null?"所选日收盘前后待核验":"",source:"Tushare anns_d"})),...forecast,...suspension].sort((a,b)=>b.date.localeCompare(a.date)||(b.time??"").localeCompare(a.time??""));
    return Response.json({events:events.slice(0,35),status:{announcements:ann?.status??"未核验",forecasts:status(forecasts).ok?"已读取":"未核验",suspensions:status(suspensions).ok?"已读取":"未核验"},blocked:ann?.status!=="已核验"||forecasts.status==="rejected"||suspensions.status==="rejected",errors:[ann?.status==="未核验"?ann.message:null,forecasts.status==="rejected"?status(forecasts).error:null,suspensions.status==="rejected"?status(suspensions).error:null].filter(Boolean),note:"公告仅核对标题与发布时间；同日未提供精确时间的事件，不判定开盘前已知。停复牌不等于盘口可成交性。"},{headers:{"Cache-Control":"private, no-store"}});
  }
  const reports=await Promise.allSettled([tushare("research_report",{ts_code:code,start_date:start,end_date:d},"",1000,7*86400000)]);
  const result=reports[0];
  return Response.json({status:status(result).ok?"已读取":"未核验",blocked:result.status==="rejected",error:result.status==="rejected"?status(result).error:null,reports:result.status==="fulfilled"?result.value.rows.filter(r=>r.ts_code===code&&String(r.trade_date)<=d).map(r=>({date:displayDate(r.trade_date),title:textValue(r.title)||textValue(r.file_name)||"研报",institution:textValue(r.inst_csname),author:textValue(r.author),abstract:textValue(r.abstr),url:safeLink(r.url)})).sort((a,b)=>b.date.localeCompare(a.date)).slice(0,12):[],note:"研报观点与假设仅供人工阅读，不直接参与买卖评分；历史回放只显示所选日期之前发布的条目。"},{headers:{"Cache-Control":"private, no-store"}});
}
