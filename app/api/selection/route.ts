import {z} from "zod";
import {context,failure} from "@/lib/server";
import {validDate} from "@/lib/market-data";
import {selectionCalendar,syncSelection,verifySelection} from "@/lib/selection-data";
import {readSelection,updateSelection} from "@/lib/selection-store";
import {recordEvidence,applyIntent} from "@/lib/selection";
import {chinaNow} from "@/lib/minute-engine";
export const dynamic="force-dynamic";
const headers={"Cache-Control":"private, no-store"};
const planSchema=z.object({low:z.number().positive(),high:z.number().positive(),qty:z.number().int().positive().max(100000000),invalidation:z.string().trim().min(2).max(500),note:z.string().max(1000)}).refine(p=>p.low<=p.high,{message:"计划价格下限不能高于上限"});
const inputSchema=z.discriminatedUnion("action",[
  z.object({action:z.literal("sync"),view:z.enum(["today","next"])}),
  z.object({action:z.literal("verify"),date:z.string().refine(validDate),code:z.string().regex(/^\d{6}\.(SH|SZ|BJ)$/)}),
  z.object({action:z.literal("intent"),date:z.string().refine(validDate),code:z.string().regex(/^\d{6}\.(SH|SZ|BJ)$/),intent:z.enum(["观察","计划","跳过"]),plan:planSchema.nullable()})
]);
export async function GET(request:Request){try{
  const {db,owner}=await context(request),q=new URL(request.url).searchParams;
  let calendar;
  try{calendar=await selectionCalendar();}catch{
    const today=chinaNow().date,requested=q.get("date");
    const savedNext=q.get("view")==="next"?await db.prepare("SELECT date FROM selection_days WHERE owner=? AND date>? ORDER BY date LIMIT 1").bind(owner,today).first<{date:string}>():null;
    const fallbackDate=requested??savedNext?.date??today;
    if(!validDate(fallbackDate))return Response.json({error:"日期无效"},{status:400,headers});
    return Response.json({...await readSelection(db,owner,fallbackDate),today,previous:"",next:savedNext?.date??"",isTradingDay:false,calendarError:"交易日历暂不可用；仅展示已保存记录，暂停自动生成和确认"},{headers});
  }
  const date=q.get("date")??(q.get("view")==="next"?calendar.next:calendar.today);
  if(!validDate(date))return Response.json({error:"日期无效"},{status:400,headers});
  return Response.json({...await readSelection(db,owner,date),...calendar},{headers});
}catch(e){return failure(e);}}
export async function POST(request:Request){try{
  const {db,owner}=await context(request,true),raw=await request.text();
  if(raw.length>10000)return Response.json({error:"请求过大"},{status:413,headers});
  const input=inputSchema.parse(JSON.parse(raw));
  if(input.action==="sync")return Response.json(await syncSelection(db,owner,input.view),{headers});
  const calendar=await selectionCalendar();
  if(input.date!==calendar.today||!calendar.isTradingDay)return Response.json({error:"只能操作今天交易日的候选；未来计划等待所属交易日确认"},{status:400,headers});
  const {day}=await readSelection(db,owner,input.date),item=day.items.find(i=>i.code===input.code);
  if(!item)return Response.json({error:"候选不存在，请先同步名单"},{status:404,headers});
  if(input.action==="intent"&&input.intent==="计划"&&!input.plan)return Response.json({error:"请填写计划价格、数量和失效条件"},{status:400,headers});
  if(input.action==="intent"&&input.intent==="计划")item.plan=input.plan;
  // A plan action refreshes evidence on the server; the user cannot mark checks passed.
  const evidence=input.action==="verify"||input.intent==="计划"?await verifySelection(item,input.date):null;
  const result=await updateSelection(db,owner,input.date,saved=>{
    const target=saved.items.find(i=>i.code===input.code);if(!target)throw new Error("候选已不存在");
    if(evidence)recordEvidence(target,evidence);
    if(input.action==="intent")applyIntent(target,input.intent,input.plan,new Date().toISOString());
  });
  return Response.json({...result,...calendar},{headers});
}catch(e){if(e instanceof z.ZodError||e instanceof SyntaxError)return Response.json({error:e instanceof z.ZodError?e.issues[0].message:"请求格式无效"},{status:400,headers});return failure(e);}}
