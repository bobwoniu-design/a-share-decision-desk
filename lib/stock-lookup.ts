import type {Row} from "./market-data";

export function resolveListedStock(input:string,rows:Row[]){
  const codeInput=input.trim().toUpperCase();
  if(!/^\d{6}(?:\.(?:SH|SZ|BJ))?$/.test(codeInput))throw new Error("请输入六位股票代码，可附加 .SH、.SZ 或 .BJ");
  const matches=rows.filter(row=>{
    const code=String(row.ts_code??"");
    return code===codeInput||codeInput.length===6&&code.startsWith(`${codeInput}.`);
  });
  if(matches.length===0)throw new Error("未找到该代码的在市 A 股，请核对后重试");
  if(matches.length!==1)throw new Error("该代码对应多只股票，请补充交易所后缀");
  const code=String(matches[0].ts_code),name=String(matches[0].name??"").trim();
  if(!/^\d{6}\.(SH|SZ|BJ)$/.test(code)||!name)throw new Error("股票名称暂无法核验，请稍后重试");
  return {code,name};
}
