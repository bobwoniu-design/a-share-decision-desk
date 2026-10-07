import {tushare} from "@/lib/tushare";
import {resolveListedStock} from "@/lib/stock-lookup";

export const dynamic="force-dynamic";

export async function GET(request:Request){
  const input=(new URL(request.url).searchParams.get("code")??"").trim().toUpperCase();
  if(!/^\d{6}(?:\.(?:SH|SZ|BJ))?$/.test(input))return Response.json({error:"请输入六位股票代码，可附加 .SH、.SZ 或 .BJ"},{status:400});
  try{
    const {rows}=await tushare("stock_basic",{list_status:"L"},"ts_code,name");
    const {code,name}=resolveListedStock(input,rows);
    return Response.json({code,name},{headers:{"Cache-Control":"private, no-store"}});
  }catch(error){
    const message=error instanceof Error?error.message:"股票代码查询失败，请稍后重试";
    const status=message.startsWith("未找到")?404:message.startsWith("该代码")?409:message.startsWith("股票名称")?502:502;
    return Response.json({error:message},{status});
  }
}
