import {validateFunnel} from "@/lib/funnel-validation";
import {derivedCache} from "@/lib/derived-cache";
import {validDate} from "@/lib/market-data";
export const dynamic="force-dynamic";
export async function GET(request:Request){
  const q=new URL(request.url).searchParams,date=q.get("date")??"",count=Number(q.get("count")??2);
  if(!validDate(date)||![2,5].includes(count))return Response.json({error:"检验参数无效"},{status:400});
  try{return Response.json(await derivedCache(`funnel-validation:v1:${date}:${count}`,7*86400000,()=>validateFunnel(date,count as 2|5)),{headers:{"Cache-Control":"private, no-store"}});}
  catch(e){return Response.json({error:e instanceof Error?e.message:"历史候选检验暂不可用"},{status:502});}
}
