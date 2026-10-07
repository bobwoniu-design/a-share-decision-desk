import {numeric, type Row} from "./market-data.ts";

export const compactDate=(date:string)=>date.replaceAll("-","");
export function daysBefore(date:string,days:number){const d=new Date(`${date}T00:00:00Z`);d.setUTCDate(d.getUTCDate()-days);return d.toISOString().slice(0,10);}
export function displayDate(value:unknown){const s=String(value??"");return /^\d{8}$/.test(s)?`${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}`:s.slice(0,10);}
export function textValue(value:unknown){return typeof value==="string"?value.trim():"";}
export function safeLink(value:unknown){const s=textValue(value);return /^https:\/\//i.test(s)?s:null;}
export function disclosureCategory(title:string){return /停牌|复牌/.test(title)?"停复牌":/减持|立案|处罚|退市|诉讼|风险/.test(title)?"风险":/业绩|预告|年报|季报|利润/.test(title)?"业绩":/订单|合同|收购|投资|重组/.test(title)?"经营":"公告";}
export function normalizeNews(rows:Row[],source:string){
  const seen=new Set<string>();
  return rows.map(r=>({time:textValue(r.datetime),title:textValue(r.title),content:textValue(r.content),channels:textValue(r.channels),source}))
    .filter(r=>r.time&&r.title)
    .sort((a,b)=>b.time.localeCompare(a.time))
    .filter(r=>{const key=r.title.replace(/[\s，。！？、:：]/g,"").toLowerCase();if(seen.has(key))return false;seen.add(key);return true;});
}
export function profileRows(company:Row[],business:Row[],code:string,date:string){
  const c=company.find(r=>r.ts_code===code),periods=business.filter(r=>r.ts_code===code&&String(r.end_date)<=compactDate(date)&&textValue(r.bz_item));
  const latest=periods.map(r=>String(r.end_date)).sort().at(-1)??null;
  const segments=periods.filter(r=>String(r.end_date)===latest&&!/^(合计|总计|营业收入合计)$/.test(textValue(r.bz_item))).map(r=>({name:textValue(r.bz_item),sales:numeric(r.bz_sales),profit:numeric(r.bz_profit)})).sort((a,b)=>(b.sales??0)-(a.sales??0));
  return {company:c?{name:textValue(c.com_name),introduction:textValue(c.introduction),mainBusiness:textValue(c.main_business),businessScope:textValue(c.business_scope),website:safeLink(c.website)}:null,period:latest?displayDate(latest):null,segments:segments.slice(0,12)};
}
