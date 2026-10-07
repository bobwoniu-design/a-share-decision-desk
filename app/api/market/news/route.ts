import {getChatGPTUser} from "@/app/chatgpt-auth";
import {validDate} from "@/lib/market-data";
import {tushare} from "@/lib/tushare";
import {daysBefore,normalizeNews} from "@/lib/research-data";
export const dynamic="force-dynamic";
export async function GET(request:Request){
  if(!await getChatGPTUser())return Response.json({error:"请登录后查看新闻"},{status:401});
  const q=new URL(request.url).searchParams,date=q.get("date")??"",source=q.get("source")??"",period=q.get("period")??"",keyword=(q.get("keyword")??"").trim();
  if(!validDate(date)||!["cls","eastmoney","sina"].includes(source)||!["premarket","day","recent"].includes(period)||keyword.length>30)return Response.json({error:"新闻查询参数无效"},{status:400});
  const start=period==="premarket"?`${daysBefore(date,1)} 18:00:00`:period==="recent"?`${daysBefore(date,3)} 00:00:00`:`${date} 00:00:00`,end=period==="premarket"?`${date} 09:30:00`:`${date} 23:59:59`;
  try{const packet=await tushare("news",{src:source,start_date:start,end_date:end},"datetime,title,content,channels",1500,5*60000);const all=normalizeNews(packet.rows,source),matches=keyword?all.filter(a=>`${a.title} ${a.content}`.includes(keyword)):all;return Response.json({status:"已读取",source,period,start,end,scanned:all.length,articles:matches.slice(0,200),fetchedAt:packet.fetchedAt,note:keyword?"仅按公司名称进行文本匹配，可能漏报或误匹配；新闻事件与股价反应需人工核对。":"财经快讯标题与正文来自所选来源；系统未验证事件真伪、影响或交易价值。"},{headers:{"Cache-Control":"private, no-store"}});}
  catch(e){return Response.json({status:"未核验",blocked:true,source,period,start,end,articles:[],error:e instanceof Error?e.message:"新闻源暂不可用",note:"新闻接口可能需要单独权限；请勿把空列表理解为当日没有新闻。"},{headers:{"Cache-Control":"private, no-store"}});}
}
