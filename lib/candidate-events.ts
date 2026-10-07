import {tushare} from "./tushare";

export type CandidateEvent={date:string;time:string|null;title:string;url:string|null;category:string;beforeClose:boolean|null};
export type CandidateEvents={status:"已核验"|"未核验";events:CandidateEvent[];message:string;asOf:string};
const compact=(d:string)=>d.replaceAll("-","");
const category=(title:string)=>/减持|诉讼|立案|处罚|风险|退市|停牌/.test(title)?"风险提示":/业绩|年报|季报|利润/.test(title)?"业绩":/收购|投资|合同|订单|重组/.test(title)?"经营事件":"公告";
export async function candidateEvents(code:string,date:string):Promise<CandidateEvents>{
  const start=new Date(`${date}T00:00:00Z`);start.setUTCDate(start.getUTCDate()-7);
  const startDate=start.toISOString().slice(0,10);
  try{
    const packet=await tushare("anns_d",{ts_code:code,start_date:compact(startDate),end_date:compact(date)},"ann_date,ts_code,title,url,rec_time",2000,7*86400000);
    const events=packet.rows.filter(r=>r.ts_code===code&&String(r.ann_date)>=compact(startDate)&&String(r.ann_date)<=compact(date)).map(r=>{
      const ann=String(r.ann_date),eventDate=`${ann.slice(0,4)}-${ann.slice(4,6)}-${ann.slice(6,8)}`,raw=String(r.rec_time??""),time=/\d{2}:\d{2}/.exec(raw)?.[0]??null,title=String(r.title??"");
      return {date:eventDate,time,title,url:typeof r.url==="string"&&/^https?:\/\//.test(r.url)?r.url:null,category:category(title),beforeClose:eventDate<date?true:eventDate>date?false:time?time<="15:00":null} satisfies CandidateEvent;
    }).filter(e=>e.title).sort((a,b)=>b.date.localeCompare(a.date)||(b.time??"").localeCompare(a.time??""));
    return {status:"已核验",events,message:events.length?"仅列公告标题与时间；影响及是否已被市场交易需人工判断。":"近7个自然日未检索到公告；不代表不存在新闻或其他事件。",asOf:`${date} 15:00`};
  }catch(e){return {status:"未核验",events:[],message:`公告未核验：${e instanceof Error?e.message:"数据不可用"}。请人工检查公司公告和新闻。`,asOf:`${date} 15:00`};}
}
