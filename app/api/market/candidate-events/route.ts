import {candidateEvents} from "@/lib/candidate-events";
import {validDate} from "@/lib/market-data";
export const dynamic="force-dynamic";
export async function GET(request:Request){
  const q=new URL(request.url).searchParams,code=q.get("code")??"",date=q.get("date")??"";
  if(!/^\d{6}\.(SH|SZ|BJ)$/.test(code)||!validDate(date))return Response.json({error:"公告查询参数无效"},{status:400});
  return Response.json(await candidateEvents(code,date),{headers:{"Cache-Control":"private, no-store"}});
}
