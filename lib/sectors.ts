import type { Row, Candidate } from "./market-data";
export type SectorMember={code:string;name:string;industry:string;quote:Pick<Candidate,"close"|"pct"|"amount"|"preClose">|null;limit:string|null;height:number|null;leaderRank:number|null};
export type SectorGroup={name:string;total:number;traded:number;up:number;down:number;flat:number;averagePct:number|null;amountYi:number;limitUp:number|null;limitDown:number|null;broken:number|null;members:SectorMember[]};
export type SectorOverview={date:string;groups:SectorGroup[];warnings:string[];fetchedAt:string;classification:"stock_basic"};
export function sectorGroups(prices:(Pick<Candidate,"code"|"close"|"pct"|"amount"|"preClose">)[],basic:Row[],limitRows:Row[]|null,date:string):SectorGroup[]{
  const compact=date.replaceAll("-",""),priceMap=new Map(prices.map(p=>[p.code,p])),limitMap=new Map((limitRows??[]).map(r=>[String(r.ts_code),r])),members=new Map<string,SectorMember>();
  for(const b of basic){
    const code=String(b.ts_code);if(!/^\d{6}\.(SH|SZ|BJ)$/.test(code))continue;
    if(b.list_date&&String(b.list_date)>compact)continue;if(b.delist_date&&String(b.delist_date)<=compact&&!priceMap.has(code))continue;
    if(members.has(code))throw new Error("行业成员重复，停止汇总");
    members.set(code,{code,name:String(b.name||code),industry:String(b.industry||"未分类"),quote:priceMap.get(code)??null,limit:null,height:null,leaderRank:null});
  }
  for(const p of prices)if(!members.has(p.code))members.set(p.code,{code:p.code,name:String(limitMap.get(p.code)?.name||p.code),industry:"未分类",quote:p,limit:null,height:null,leaderRank:null});
  const grouped=new Map<string,SectorMember[]>();
  for(const m of members.values()){
    const l=limitMap.get(m.code),height=Number(l?.limit_times);if(l?.limit==="U"&&(!Number.isInteger(height)||height<1))throw new Error("连板高度校验失败");m.limit=limitRows===null?null:String(l?.limit??"");m.height=limitRows===null?null:(l?.limit==="U"?height:0);
    if(l?.name)m.name=String(l.name);
    grouped.set(m.industry,[...(grouped.get(m.industry)??[]),m]);
  }
  return [...grouped].map(([name,all])=>{
    const quoted=all.filter(m=>m.quote!==null);
    const ranked=quoted.filter(m=>m.quote!.pct>0&&!/^(\*?ST|S\*?ST|退)/i.test(m.name)).sort((a,b)=>(b.height??0)-(a.height??0)||b.quote!.pct-a.quote!.pct||b.quote!.amount-a.quote!.amount||a.code.localeCompare(b.code));
    // Only label an algorithmic leadership candidate when the limit-list input is available.
    if(limitRows!==null)ranked.slice(0,3).forEach((m,i)=>m.leaderRank=i+1);
    all.sort((a,b)=>(a.leaderRank??999)-(b.leaderRank??999)||(b.quote?.pct??-Infinity)-(a.quote?.pct??-Infinity)||a.code.localeCompare(b.code));
    return {name,total:all.length,traded:quoted.length,up:quoted.filter(m=>m.quote!.pct>0).length,down:quoted.filter(m=>m.quote!.pct<0).length,flat:quoted.filter(m=>m.quote!.pct===0).length,averagePct:quoted.length?quoted.reduce((s,m)=>s+m.quote!.pct,0)/quoted.length:null,amountYi:quoted.reduce((s,m)=>s+m.quote!.amount,0)/1e8,limitUp:limitRows===null?null:all.filter(m=>m.limit==="U").length,limitDown:limitRows===null?null:all.filter(m=>m.limit==="D").length,broken:limitRows===null?null:all.filter(m=>m.limit==="Z").length,members:all};
  }).sort((a,b)=>(b.limitUp??0)-(a.limitUp??0)||(b.averagePct??-Infinity)-(a.averagePct??-Infinity)||b.amountYi-a.amountYi||a.name.localeCompare(b.name));
}
