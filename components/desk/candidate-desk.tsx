"use client";
import {useEffect,useRef,useState} from "react";
import {chinaNow} from "@/lib/minute-engine";
import {selectionStatus,type SelectionResponse,type SelectionItem,type SelectionPlan} from "@/lib/selection";
import {StockChartTabs} from "./stock-chart-tabs";

type View="today"|"next"|"archive";
const localTime=(value:string|null)=>value?new Date(value).toLocaleString("zh-CN",{timeZone:"Asia/Shanghai",hour12:false}):"尚未运行";
export function CandidateDesk({view,date,personalCodes=[]}:{view:View;date?:string;personalCodes?:string[]}){
  const [data,setData]=useState<SelectionResponse|null>(null),[error,setError]=useState(""),[busy,setBusy]=useState(false),[selected,setSelected]=useState<string|null>(null),[filter,setFilter]=useState("全部"),[clock,setClock]=useState(new Date().toISOString()),[message,setMessage]=useState(""),[showChart,setShowChart]=useState(false);
  const [plan,setPlan]=useState({low:"",high:"",qty:"",invalidation:"",note:""});
  const [selectedDate,setSelectedDate]=useState<string|null>(null);
  const selectedRef=useRef(selected),locked=useRef(false),cursor=useRef(0),controller=useRef<AbortController|null>(null);
  const detailRef=useRef<HTMLDivElement|null>(null);
  useEffect(()=>{selectedRef.current=selectedDate===data?.day.date?selected:null;if(selected&&window.innerWidth<=1000)detailRef.current?.scrollIntoView({block:"start",behavior:"smooth"});},[selected,selectedDate,data?.day.date]);
  async function request(payload?:unknown,signal?:AbortSignal){
    const response=await fetch(payload?"/api/selection":`/api/selection?view=${view}${date?`&date=${date}`:""}`,{method:payload?"POST":"GET",headers:payload?{"Content-Type":"application/json"}:undefined,body:payload?JSON.stringify(payload):undefined,cache:"no-store",signal});
    const result=await response.json() as SelectionResponse & {error?:string};if(!response.ok)throw new Error(result.error??"候选读取失败");
    if(!signal?.aborted)setData(result);return result as SelectionResponse;
  }
  function exportDay(){if(!data)return;const url=URL.createObjectURL(new Blob([JSON.stringify(data.day,null,2)],{type:"application/json"}));const a=document.createElement("a");a.href=url;a.download=`候选记录-${data.day.date}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  async function action(payload:unknown,success=""){
    if(locked.current)return;locked.current=true;setBusy(true);setError("");setMessage("");
    try{await request(payload,controller.current?.signal);setMessage(success);}catch(e){if(!controller.current?.signal.aborted)setError(e instanceof Error?e.message:"操作失败");}finally{locked.current=false;setBusy(false);}
  }
  useEffect(()=>{
    const abort=new AbortController();controller.current=abort;let timer:ReturnType<typeof setTimeout>;let stopped=false;
    const run=async(initial=false)=>{
      if(stopped)return;
      if(locked.current||(!initial&&document.visibilityState!=="visible")){timer=setTimeout(()=>void run(),60000);return;}
      locked.current=true;setBusy(true);
      try{
        if(initial)await request(undefined,abort.signal);
        const now=chinaNow();
        if(view!=="archive"&&(initial||view==="next"&&now.time>="15:10"||view==="today"&&now.time>="08:30")){
          const refreshed=await request({action:"sync",view},abort.signal);
          if(view==="today"&&refreshed.isTradingDay&&now.time>="09:00"&&now.time<="15:00"){
            const rows=refreshed.day.items;
            const chosen=[selectedRef.current,...Array.from({length:Math.min(2,rows.length)},()=>rows[cursor.current++%rows.length]?.code)].filter((code):code is string=>!!code);
            for(const code of new Set(chosen)){if(stopped)break;await request({action:"verify",date:refreshed.day.date,code},abort.signal);}
          }
        }
        setError("");
      }catch(e){if(!stopped)setError(e instanceof Error?e.message:"候选同步失败");}
      finally{locked.current=false;if(!stopped){setBusy(false);if(view!=="archive")timer=setTimeout(()=>void run(),60000);}}
    };
    queueMicrotask(()=>void run(true));const clockTimer=setInterval(()=>setClock(new Date().toISOString()),15000);
    return()=>{stopped=true;abort.abort();clearTimeout(timer);clearInterval(clockTimer);};
    // A view/date change cancels the prior polling loop and all its UI updates.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[view,date]);
  const day=data?.day,items=day?.items??[],item=selectedDate===day?.date?items.find(i=>i.code===selected):undefined,editable=view==="today"&&data?.isTradingDay&&day?.date===chinaNow().date;
  const filtered=items.filter(i=>filter==="全部"||filter==="我的计划"&&i.intent==="计划"||filter==="自选／持仓"&&personalCodes.includes(i.code)||filter==="风险与失效"&&["风险待核实","逻辑失效"].includes(i.latest?.status??"")||i.sources.some(s=>s.kind===filter));
  const changes=items.flatMap(i=>i.events.filter(e=>e.kind==="复核").map(e=>({...e,code:i.code,name:i.name}))).sort((a,b)=>b.at.localeCompare(a.at)).slice(0,4);
  function choose(i:SelectionItem){setSelected(i.code);setSelectedDate(day!.date);setShowChart(false);setMessage("");setPlan({low:i.plan?String(i.plan.low):"",high:i.plan?String(i.plan.high):"",qty:i.plan?String(i.plan.qty):"",invalidation:i.plan?.invalidation??"",note:i.plan?.note??""});}
  const sourceLabel=(i:SelectionItem)=>i.sources.map(s=>`${s.kind}${s.backfilled?"·补建":""}`).join(" ＋ ");
  return <section className="candidate-desk" aria-label="候选跟踪工作台">
    <div className="panel candidate-intro"><div className="panel-head"><h2>{view==="today"?"今日候选":view==="next"?"下个交易日计划":"已保存候选回顾"}</h2><span>{day?.date??"交易日历读取中"}</span></div><div className="page-pad">
      <p>{view==="today"?"盘前候选持续保留，盘中随时发现新候选。点击股票查看确认卡，再决定加入计划、继续观察或今日跳过。":view==="next"?"收盘数据完整后生成并保存，按交易日历关联下一交易日；到了当天再进行消息、竞价与盘中确认。":"这里只展示真实保存过的名单及核验记录；没有记录的时段不会用收盘结果补写。"}</p>
      <div className="candidate-toolbar">{view!=="archive"&&<button className="button primary" disabled={busy} onClick={()=>void action({action:"sync",view},"名单已同步；原入选依据保持不变。")}>{busy?"正在同步／核验…":"同步候选名单"}</button>}<button className="button" disabled={!data} onClick={exportDay}>导出当日记录</button><span role="status">{items.length} 只 · 最近盘中发现扫描：{localTime(day?.lastScanAt??null)}</span></div>
      {view!=="archive"&&<small>页面打开且可见时，交易时段每轮完成后约60秒继续扫描；收盘数据就绪后自动准备下一交易日。每轮轮询2只并优先核验当前选中股票；可随时手动核验。关闭页面后此工作台不运行后台扫描。每只股票的核验有效期为2分钟。</small>}
      {data&&!data.calendarError&&!data.isTradingDay&&view==="today"&&<p className="amber-text">今天不是交易日。请查看下个交易日计划或历史复盘。</p>}
      {data?.calendarError&&<p className="amber-text">{data.calendarError}</p>}
      {day?.preparedAt&&<small>盘前名单保存于 {localTime(day.preparedAt)} · 依据交易日 {day.basisDate}</small>}
      {day?.warnings.map(w=><p className="amber-text" key={w}>{w}</p>)}
      {error&&<p role="alert" className="amber-text">{error}。已保存名单仍保留，不能将旧核验结果视为当前有效。</p>}
      {message&&<p role="status">{message}</p>}
    </div></div>
    {changes.length>0&&<details className="panel candidate-changes"><summary>最近状态变化 · {changes.length} 条</summary>{changes.map((c,i)=><p key={`${c.code}:${c.at}:${i}`}><button className="text-link" onClick={()=>choose(items.find(row=>row.code===c.code)!)}>{c.name}</button> · {localTime(c.at)} · {c.detail}</p>)}</details>}
    <div className="board-filter-tabs candidate-filters">{["全部","盘前候选","盘中新增","我的计划","风险与失效","自选／持仓"].map(label=><button key={label} aria-pressed={filter===label} className={filter===label?"active":""} onClick={()=>setFilter(label)}>{label}</button>)}</div>
    <div className={`candidate-layout ${item?"has-selection":""}`}><div className="candidate-list" aria-label="保存的候选列表">
      {filtered.map(i=><button key={i.code} className={`candidate-row ${selected===i.code?"selected":""}`} onClick={()=>choose(i)} aria-label={`查看${i.name}确认卡`} aria-pressed={selected===i.code}>
        <span><b>{i.name}</b><small>{i.code} · {sourceLabel(i)}</small></span><span className="candidate-state">{selectionStatus(i,clock)}<small>{i.intent==="计划"?"已加入计划 · 未登记成交":i.intent==="跳过"?"今日已跳过":"继续跟踪"}</small></span>
        <small>首次入选 {localTime(i.firstSeenAt)}</small><small>最新核验 {localTime(i.latest?.at??null)}</small><p>{i.latest?.reason??"等待所属交易日的消息、竞价和盘中确认"}</p>
      </button>)}
      {!filtered.length&&<div className="panel page-pad">{busy?"正在读取候选…":filter==="全部"?"尚无已保存候选。数据就绪后同步名单；历史记录不会自动伪造。":"当前筛选没有候选；其他来源的股票仍保留在全部列表。"}</div>}
    </div><div className="candidate-detail" ref={detailRef}>
      {!item?<div className="panel page-pad"><h3>选择股票，查看当前确认条件</h3><p>入选时间与确认时间分别记录。10:00、10:30或下午新增的股票都按同一流程核验。</p></div>:<div className="panel"><div className="panel-head"><h2>{item.name} · 确认卡</h2><span>{item.code}</span></div><div className="page-pad">
        <p><b>{selectionStatus(item,clock)}</b> · {item.latest?.stage??"尚未核验"}</p><p>{item.latest?.reason??"候选入围不代表交易条件通过。"}</p>
        {item.latest&&<small>核验 {localTime(item.latest.at)} · 有效至 {localTime(item.latest.expiresAt)} · 行情 {item.latest.quoteTime??"未知"}</small>}
        <div className="candidate-toolbar"><button className="button primary" disabled={busy||!editable} onClick={()=>void action({action:"verify",date:day!.date,code:item.code},"已重新核验当前条件。")}>{busy?"核验中…":"立即核验"}</button><button className="button" onClick={()=>setShowChart(v=>!v)}>{showChart?"收起行情":"查看行情"}</button><button className="text-link" onClick={()=>setSelected(null)}>收起确认卡</button></div>
        <div className="candidate-checks">{(item.latest?.checks??[{label:"确认条件",pass:null,detail:"等待核验"}]).map(c=><div key={c.label}><b>{c.label}<span className={c.pass===false?"amber-text":""}>{c.pass===true?"通过":c.pass===false?"未通过":"待核验"}</span></b><small>{c.detail}</small></div>)}</div>
        {!!item.latest?.links.length&&<details open><summary>风险线索原文 · 需人工核对</summary>{item.latest.links.map((l,n)=><p key={n}>{l.time}　{l.source??""}　{l.url?<a href={l.url} target="_blank" rel="noreferrer">{l.title}</a>:l.title}{l.reason&&<><br/>识别原因：{l.reason}</>}</p>)}</details>}
        {showChart&&<StockChartTabs stock={{code:item.code,name:item.name}} date={view==="next"?day!.basisDate:day!.date} marketMode={view==="today"?"live":"close"} themeCode={item.sources[0]?.candidate.theme?.code} showZoom={false}/>}
        {editable&&<form className="candidate-plan" onSubmit={e=>{e.preventDefault();const values:SelectionPlan={low:Number(plan.low),high:Number(plan.high),qty:Number(plan.qty),invalidation:plan.invalidation,note:plan.note};void action({action:"intent",date:day!.date,code:item.code,intent:"计划",plan:values},"计划已保存并重新核验。加入计划不代表条件通过或实际成交。");}}>
          <h3>交易计划</h3><div className="candidate-plan-fields"><label>价格下限（元）<input aria-label="计划价格下限" type="number" step="0.001" min="0.001" required value={plan.low} onChange={e=>setPlan({...plan,low:e.target.value})}/></label><label>价格上限（元）<input aria-label="计划价格上限" type="number" step="0.001" min={plan.low||"0.001"} required value={plan.high} onChange={e=>setPlan({...plan,high:e.target.value})}/></label><label>计划数量（股）<input aria-label="计划数量" type="number" min="1" step="1" required value={plan.qty} onChange={e=>setPlan({...plan,qty:e.target.value})}/></label></div>
          <label>逻辑失效条件<input aria-label="逻辑失效条件" required minLength={2} maxLength={500} placeholder="填写触发后需要重新考虑计划的条件" value={plan.invalidation} onChange={e=>setPlan({...plan,invalidation:e.target.value})}/></label><label>备注<input aria-label="计划备注" maxLength={1000} value={plan.note} onChange={e=>setPlan({...plan,note:e.target.value})}/></label>
          <small>文字失效条件供人工执行；系统核验预设量价规则和计划价格范围，不自动理解或执行文字条件。</small>
          <div className="candidate-toolbar"><button type="submit" className="button primary" disabled={busy}>保存计划并重新核验</button><button type="button" className="button" disabled={busy} onClick={()=>void action({action:"intent",date:day!.date,code:item.code,intent:"观察",plan:null},"已恢复观察。")}>继续观察</button><button type="button" className="button" disabled={busy} onClick={()=>void action({action:"intent",date:day!.date,code:item.code,intent:"跳过",plan:null},"已标记今日跳过，历史与风险记录继续保留。")}>今日跳过</button></div>
        </form>}
        {!editable&&<p className="muted">{view==="next"?"计划交易日到来后，可在今日候选里核验并制定交易计划。":"历史记录只读，不使用当前信息修改过去的确认结果。"}</p>}
        <details><summary>原始入选依据与来源</summary>{item.sources.map(s=><div key={s.kind}><p><b>{s.kind}</b> · {localTime(s.foundAt)} · 依据 {s.basisDate}</p>{s.backfilled&&<p className="amber-text">本条在今天按历史收盘依据补建，不代表上个交易日已实际保存或当时已知。</p>}{s.candidate.reasons.map(r=><p key={r}>{r}</p>)}</div>)}</details>
        <details className="candidate-timeline" open><summary>状态与操作记录 · {item.events.length}</summary>{[...item.events].reverse().map((e,n)=><div key={n}><p><small>{localTime(e.at)} · {e.kind}</small>{e.detail}</p>{e.evidence&&<details><summary>查看当时核验依据</summary>{e.evidence.checks.map(c=><p key={c.label}>{c.label} · {c.pass===true?"通过":c.pass===false?"未通过":"待核验"}：{c.detail}</p>)}</details>}</div>)}</details>
      </div></div>}
    </div></div>
  </section>;
}
