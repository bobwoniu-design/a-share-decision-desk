"use client";
import {useEffect,useMemo,useRef,useState} from "react";
import {Panel} from "./workspace";
import {Plot} from "./market";
import {Slider} from "@/components/ui/slider";
import {PHASES,chinaNow,liveSession,minuteFresh,minuteEngine,sectorMinuteEngine,type Transition} from "@/lib/minute-engine";
import type {DecisionOverview,Factor,ScoredSector,CoreStock} from "@/lib/decision-engine";
import type {MinuteBundle} from "@/lib/decision-data";
import type {HistoryStock} from "./history-charts";

const localDecisionCache=new Map<string,{until:number;value:unknown}>();
export function useDecision<T>(url:string|null,live=false){
  const [data,setData]=useState<T|null>(null),[error,setError]=useState(""),[busy,setBusy]=useState(false),[attempt,setAttempt]=useState(0);
  const lastUrl=useRef<string|null>(null);
  useEffect(()=>{const controller=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined;
    const force=lastUrl.current===url&&attempt>0;lastUrl.current=url;
    const cached=url&&!force?localDecisionCache.get(url):undefined;
    const ready=cached&&cached.until>Date.now();
    setData(ready?cached.value as T:null);setError("");setBusy(!!url&&!ready);
    if(!url)return()=>controller.abort();
    const read=async(refresh=false)=>{
      let blocked=false;
      try{const endpoint=refresh?`${url}${url.includes("?")?"&":"?"}refresh=1`:url;const response=await fetch(endpoint,{signal:controller.signal,cache:"no-store"});const d=await response.json() as T & {error?:string;blocked?:boolean};if(!response.ok)throw new Error(d.error||"决策数据暂时不可用");if(!controller.signal.aborted){const requestDate=new URL(url,location.origin).searchParams.get("date"),ttl=live?15000:requestDate===chinaNow().date?60000:7*86400000,minutes=url.includes("view=minutes")?d as unknown as MinuteBundle:null,save=!d.blocked&&(!minutes||minutes.bars.length>0&&minutes.peers.every(p=>!p.error)&&minutes.themePeers.every(p=>!p.error));setData(d);setError("");if(save){localDecisionCache.set(url,{until:Date.now()+ttl,value:d});while(localDecisionCache.size>80)localDecisionCache.delete(localDecisionCache.keys().next().value!);}}blocked=!!d.blocked;}
      catch(e){if(!controller.signal.aborted){const message=e instanceof Error?e.message:"读取失败";setData(null);setError(message);blocked=/40204|IP数量|权限|访问频次/.test(message);}}
      finally{if(!controller.signal.aborted){setBusy(false);if(live&&!blocked)timer=setTimeout(tick,60000);}}
    };
    const tick=()=>{if(controller.signal.aborted)return;if(document.visibilityState==="visible"&&liveSession(chinaNow().time))void read();else timer=setTimeout(tick,60000);};
    if(!ready||live)void read(force);return()=>{controller.abort();if(timer)clearTimeout(timer);};
  },[url,live,attempt]);
  return {data,error,busy,retry:()=>setAttempt(a=>a+1)};
}
const sign=(v:number|null|undefined)=>v==null?"—":`${v>=0?"+":""}${v.toFixed(0)}`;
const number=(v:number|null|undefined,n=0)=>v==null?"—":v.toFixed(n);
export function PhaseTag({phase}:{phase:string}){return <span className={`phase-tag phase-${["转弱","退潮","逻辑失效"].includes(phase)?"risk":["承接","转强","加速","一致"].includes(phase)?"positive":"neutral"}`}>{phase}</span>;}
export function Factors({factors}:{factors:Factor[]}){return <div className="factor-list">{factors.map(f=><div key={f.name}><label>{f.name}<small>权重 {f.weight}%</small></label><div className="factor-bar"><i style={{width:`${f.score??0}%`}}/></div><b>{number(f.score)}</b><span>{f.detail}</span></div>)}</div>;}
function Timeline({items}:{items:Transition[]}){return items.length?<ol className="decision-timeline">{items.slice().reverse().map((e,i)=><li key={`${e.time}-${i}`}><time>{e.time}</time><b>{e.from} → {e.to}</b><span>{e.reason}</span></li>)}</ol>:<p className="history-caption">当前时点之前尚无状态变化。</p>;}
export function DecisionHeader({data,error,busy,retry,onSelect,onSector,showIndustry=true}:{data:DecisionOverview|null;error:string;busy:boolean;retry:()=>void;onSelect:(s:HistoryStock)=>void;onSector:(name:string)=>void;showIndustry?:boolean}){
  const m=data?.market;
  return <section className="decision-header" aria-label="短线决策链">
    <div className="decision-flow"><b>决策引擎</b><span>市场情绪 → 题材 / 行业 → 核心股 → 分钟状态 → 条件核对 → 人工决策</span><small>P0.3 · 规则分</small></div>
    {busy?<p className="history-small-empty" role="status">正在计算近20个交易日的市场、板块与核心度…</p>:error?<p className="error-banner" role="alert">{error} <button className="text-link" onClick={retry}>重试评分</button></p>:data&&m&&<>
      <div className="market-decision"><div className="emotion-score"><small>市场情绪</small><strong>{number(m.score)}<em>/100</em></strong><span className={(m.delta??0)<0?"down":"up"}>{(m.delta??0)<0?"↓":"↑"} {sign(m.delta)} 较前交易日</span></div><div className="market-verdict"><div><b>{m.previousCycle&&m.previousCycle!==m.cycle?`${m.previousCycle} → `:""}{m.cycle}</b><PhaseTag phase={m.phase}/><span>赚钱效应：{m.earning}</span><span>高位风险：<strong className={m.risk==="高"?"down":"amber-text"}>{m.risk}</strong></span></div><p>{m.posture}</p>{data.mode==="live"&&<p className="market-caution">警惕：{m.playbook.avoid}</p>}<small>{data.asOf} · {data.mode==="live"?"盘中快照评分":"收盘阶段"} · 晋级 {number(m.promotion.value,1)}%（{m.promotion.advanced}/{m.promotion.total}） · 昨高位溢价 {number(m.highPremium.value,2)}%</small></div></div>
      {data.mode==="live"&&<details className="engine-method"><summary>盘中实际采集时间线 · {data.intraday?.observations??0} 次</summary><p>{data.intraday?.status??"盘中快照尚未采集"}；当前阶段：<PhaseTag phase={data.intraday?.phase??"待数据"}/></p><ol className="decision-timeline">{data.intraday?.timeline.map(t=><li key={t.time}><time>{t.time}</time><b>{t.phase} · {number(t.score)}</b><span>{t.reason}</span></li>)}</ol></details>}
      {showIndustry&&<><div className="mainline-three">{data.sectors.filter(s=>s.score!==null).slice(0,3).map((s,i)=><button key={s.name} onClick={()=>onSector(s.name)}><small>行业强度 {String(i+1).padStart(2,"0")} · {s.label}</small><div><b>{s.name}</b><strong>{number(s.score)} <em className={(s.delta??0)<0?"down":"up"}>{sign(s.delta)}</em></strong></div><span><PhaseTag phase={s.phase}/> 前5日涨幅前十 {s.topDays}/5</span></button>)}</div>
      <div className="core-strip"><div><b>核心 TOP10</b><small>{data.mode==="live"?"当前盘中排名":"收盘排名"} · 点击联动个股</small></div>{data.cores.map(c=><button key={c.code} onClick={()=>onSelect(c)}><b>{c.name}<em>{number(c.score)}</em></b><small>{c.sector} · {c.roles.filter(r=>r!=="观察成员").join(" / ")||"高分核心候选"}</small></button>)}{!data.cores.length&&<span className="muted">暂无同时满足板块≥65、核心度≥65的候选。</span>}</div></>}
    </>}
  </section>;
}

export function MarketEvidence({data}:{data:DecisionOverview|null}){
  if(!data)return <p className="history-small-empty">市场决策数据尚未载入。</p>;
  return <div className="research-body">{data.board?<><p>官方涨跌停 {data.board.limitRows} 条 · 天梯 {data.board.ladderRows} 只 · 同花顺最强板块 {data.board.sectorRows} 条。天梯差异：缺失 {data.board.discrepancies.missingInLadder}、多出 {data.board.discrepancies.extraInLadder}、板数不符 {data.board.discrepancies.heightMismatch}。开板次数覆盖 {data.board.seal.known} 只，其中未开板 {data.board.seal.neverOpened} 只；封单金额覆盖 {data.board.seal.orderAmountKnown} 只。</p><div className="board-evidence-grid"><div><b>连板梯队</b>{data.board.ladder.slice(0,12).map(s=><span key={s.code}>{s.name} · {s.height} 板</span>)}</div><div><b>最强板块独立参照</b>{data.board.sectors.slice(0,10).map(s=><span key={s.code}>{s.rank}. {s.name} · 涨停{s.limitUp} / 连板{s.connected}</span>)}</div></div><p>最强板块是同花顺口径，题材主线使用东财当日成分；两者不按名称强行归并。收盘榜单仅用于复盘。</p>{data.board.warnings.map(w=><p className="amber-text" key={w}>{w}</p>)}</>:<p>当前日期未获得完整的天梯和最强板块交叉证据；题材与行业排名仍按各自来源显示。</p>}</div>;
}
export function MarketScoreMethod({data}:{data:DecisionOverview|null}){
  const m=data?.market;
  if(!data||!m)return <p className="history-small-empty">市场评分尚未载入。</p>;
  return <div className="research-body"><p>四维新分 {number(m.score)}；旧版七项规则分 {number(m.legacyScore)}。两套分值不可直接视为收益改进，需历史样本验证。新分至少要求四组中三组有证据。</p><h3>观察要点</h3><p><b>当前姿态：</b>{m.playbook.stance} · {m.playbook.reason}</p><p><b>重点核对：</b>{m.playbook.focus}</p><p><b>警惕：</b>{m.playbook.avoid}</p><p>{data.mode==="live"?"盘中快照随数据更新，仅作人工观察参考。":"按所选日期收盘数据生成，不回填盘中判断。"}</p><h3>现行四维评分</h3><Factors factors={m.axes}/><h3>旧版七项因子</h3><Factors factors={m.factors}/><p>高位风险样本：昨日≥3板的 {m.highPremium.total} 只，今天匹配 {m.highPremium.matched} 只；平均涨幅 {number(m.highPremium.value,2)}%。无高位样本、匹配不足90%或炸板率缺失时保持未知，不显示低风险。</p><div className="market-cycle-history">{m.history.slice(-10).map(h=><span key={h.date}><small>{h.date.slice(5)}</small><b>{number(h.score)}</b><span>{h.cycle}</span></span>)}</div><p>分数衡量规则满足程度，不代表胜率。周期阈值：＜30冰点、≥80高潮；较前日下降≥10为退潮；由低于55上升≥8为修复；≥60为发酵。行业聚集只作题材主线代理，不替代东财题材成分。</p>{data.warnings.map(w=><p key={w}>{w}</p>)}</div>;
}
export function SectorDecision({sector}:{sector:ScoredSector|undefined}){
  if(!sector)return <p className="history-caption">板块评分正在加载，未用涨幅代替综合分。</p>;
  return <div className="sector-decision"><div className="sector-score-head"><span><b>{sector.name}</b> · {sector.label}</span><strong>{number(sector.score)} <em className={(sector.delta??0)<0?"down":"up"}>{sign(sector.delta)}</em></strong><PhaseTag phase={sector.phase}/></div>
    <div className="industry-qualification"><b>主线资格：{sector.qualification.status}</b><span>强度分与资格分开，以下条件逐项核对</span><div>{sector.qualification.checks.map(c=><p key={c.name}><strong className={c.result==="通过"?"up":c.result==="未通过"?"down":"muted"}>{c.result}</strong><b>{c.name}</b><span>{c.detail}</span></p>)}</div></div>
    <div className="sector-dimensions">{sector.factors.map(f=><span key={f.name} title={f.detail}><small>{f.name}</small><b>{number(f.score)}</b><i><em style={{width:`${f.score??0}%`}}/></i></span>)}</div>
    <details className="engine-method" open><summary>板块分解与近7日变化</summary><Factors factors={sector.factors}/><p>这里是收盘/快照阶段；分钟状态在右侧随个股同步回放。行业代理不等同于概念题材。日级阶段：分数＜35或较昨日下降≥15为转弱；下降≥7为分歧；分歧/转弱后回升≥3为承接；承接后分≥65且上升≥3为转强；强势阶段分≥80且上升≥4为加速；其余≥65为一致。</p><div className="market-cycle-history">{sector.history.slice(-7).map(h=><span key={h.date}><small>{h.date.slice(5)}</small><b>{number(h.score)}</b><span>{h.phase}</span></span>)}</div></details>
  </div>;
}
export function CoreProfile({stock,date,mode}:{stock:HistoryStock|undefined;date:string;mode:"close"|"live"}){
  const [open,setOpen]=useState(false);
  const {data,error,busy,retry}=useDecision<{core:CoreStock|null;sector:ScoredSector|null}>(open&&stock?`/api/market/decision?view=stock&date=${date}&code=${stock.code}&mode=${mode}`:null,open&&mode==="live");
  if(!stock)return null;
  return <details className="core-profile" onToggle={e=>setOpen(e.currentTarget.open)}><summary><b>{stock.name}</b><span>{data?.core?.sector??"板块地位"}</span><strong>{data?.core?`核心度 ${number(data.core.score)}`:"展开核心度评分"}</strong>{data?.core&&<span>{data.core.roles.join(" / ")}</span>}</summary>{open&&(busy?<p>正在读取核心度依据…</p>:error?<p className="error-banner">{error} <button className="text-link" onClick={retry}>重试</button></p>:data?.core?<><Factors factors={data.core.factors}/><p>{date} {mode==="close"?"收盘评分，仅用于事后复盘":"盘中快照评分"}；分钟辅助条件使用前一交易日固定的核心身份，避免事后排名污染回放。</p></>:<p>该股票没有可核验的行业核心度评分。</p>)}</details>;
}
export function MinuteDecision({stock,date,showChart=true,mode="close",themeCode}:{stock:HistoryStock|undefined;date:string;showChart?:boolean;mode?:"close"|"live";themeCode?:string}){
  const {data,error,busy,retry}=useDecision<MinuteBundle>(stock?`/api/market/decision?view=minutes&code=${stock.code}&date=${date}&mode=${mode}${themeCode?`&theme=${encodeURIComponent(themeCode)}`:""}`:null,mode==="live");
  const [cursor,setCursor]=useState<number|null>(null),[clock,setClock]=useState(Date.now());
  useEffect(()=>{if(mode!=="live")return;const t=setInterval(()=>setClock(Date.now()),15000);return()=>clearInterval(t);},[mode]);
  const count=mode==="live"?data?.bars.length??0:Math.min(cursor??data?.bars.length??0,data?.bars.length??0);
  const result=useMemo(()=>{
    if(!data)return null;const bars=data.bars.slice(0,count),time=bars.at(-1)?.time;
    const peers=data.peers.map(p=>({...p,bars:p.bars.filter(b=>time&&b.time<=time)}));
    const sector=sectorMinuteEngine(peers,bars.map(b=>b.time));
    const themePeers=data.themePeers.map(p=>({...p,bars:p.bars.filter(b=>time&&b.time<=time)}));
    const theme=sectorMinuteEngine(themePeers,bars.map(b=>b.time));
    const engine=minuteEngine(bars,{preClose:data.preClose??undefined,floatShares:data.floatShares??undefined,upLimit:data.upLimit??undefined,mainlineCore:data.mainlineCore,marketAllowed:data.marketAllowed,themeAllowed:data.themeAllowed,sector:sector.frames,theme:theme.frames});
    return {bars,sector,theme,engine};
  },[data,count]);
  const f=result?.engine.current,s=result?.sector.current,t=result?.theme.current,stale=mode==="live"&&(data?.stale||!minuteFresh(date,f?.time,new Date(clock)));
  const pct=f&&data?.preClose?(result!.bars.at(-1)!.close/data.preClose-1)*100:null;
  return <Panel title="个股 × 板块 · 分钟决策" extra={<span className="muted">{mode==="live"?"交易时段每60秒刷新":"历史因果回放"}</span>} className="minute-decision">
    {busy?<p className="history-small-empty" role="status">正在读取个股和板块独立样本的分钟行情…</p>:error?<p className="error-banner" role="alert">{error}<button className="text-link" onClick={retry}>重试</button></p>:!data||!f?<div className="history-small-empty"><b>分钟数据未就绪，状态保持未知</b>{data?.warnings.map(w=><p key={w}>{w}</p>)}<button className="text-link" onClick={retry}>重新读取</button></div>:<>
      <div className="minute-state-heading"><div><small>{stock?.name??data.name} · {date} {f.time}</small><div><PhaseTag phase={stale?"待数据":f.phase}/><b>{stale?"行情延迟":`${f.since} 进入`}</b><span className={(pct??0)<0?"down":"up"}>{result!.bars.at(-1)!.close.toFixed(2)} · {number(pct,2)}%</span></div></div><div><small>{data.sector} · 行业独立样本</small><div><PhaseTag phase={stale?"待数据":s?.phase??"待数据"}/><span>{s?.coverage??0}/{s?.total??0} 只有效</span></div></div><div><small>{data.themeBasis?.name??"题材待选"} · 题材独立样本</small><div><PhaseTag phase={stale?"待数据":t?.phase??"待数据"}/><span>{t?.coverage??0}/{t?.total??0} 只有效</span></div></div></div>
      <div className="state-path">{PHASES.map(p=><span className={!stale&&f.phase===p?"active":""} key={p}>{p}</span>)}</div>
      <div className="decision-signal"><b>{stale?"行情延迟 · 暂停辅助信号":f.signal}</b><span>{f.invalidated?`承接低点 ${number(f.supportLow,3)} 已失守`:f.confirmed?"价格确认已满足；仍需核对题材、环境、行业与突破条件":"条件随回放时点变化，最终结合事件人工判断"}</span></div>
      <div className="minute-scores">{PHASES.map(p=><div key={p}><small>{p}</small><b>{f.quality&&!stale?f.scores[p]:"—"}</b><i><em style={{width:`${f.quality&&!stale?f.scores[p]:0}%`}}/></i></div>)}</div>
      <div className="condition-grid">{f.checks.map(c=><div key={c.label} className={stale||c.pass===null?"unknown":c.pass?"met":"unmet"} title={c.detail}><b>{stale||c.pass===null?"?":c.pass?"✓":"×"} {c.label}</b><small>{c.detail}</small></div>)}</div>
      <div className="evidence"><div><small>VWAP / 连续站上</small><b>{number(f.vwap,3)} / {f.above}根</b></div><div><small>累计换手估算</small><b>{number(f.turnover,2)}%</b></div><div><small>近5分钟量速比</small><b>{number(f.turnoverAcceleration,2)}倍</b></div></div>
      {showChart&&<><Plot bars={result!.bars}/>{mode==="close"&&<div className="replay-control"><span>{data.bars[0].time}</span><Slider aria-label="决策引擎回放时点" min={1} max={Math.max(data.bars.length,2)} value={[count]} onValueChange={v=>setCursor(v[0])}/><span>{f.time}</span><button className="text-link" onClick={()=>setCursor(null)}>收盘</button></div>}</>}
      <div className="decision-timelines"><details open><summary>个股状态时间线 · {result!.engine.transitions.length}</summary><Timeline items={result!.engine.transitions}/><details><summary>辅助条件出现 / 撤回</summary><ol className="decision-timeline">{result!.engine.frames.filter((p,i,a)=>i>0&&p.signal!==a[i-1].signal).slice().reverse().map(p=><li key={p.time}><time>{p.time}</time><b>{p.signal}</b></li>)}</ol></details></details><details><summary>行业状态时间线 · {result!.sector.transitions.length}</summary><Timeline items={result!.sector.transitions}/></details><details><summary>题材状态时间线 · {result!.theme.transitions.length}</summary><Timeline items={result!.theme.transitions}/></details></div>
      <details className="engine-method"><summary>数据覆盖、核心身份与触发规则{data.warnings.length?` · ${data.warnings.length}项提示`:""}</summary><p>核心身份固定于 {data.basisDate}：{data.basisCore?.roles.join(" / ")??"未知"}，核心度 {number(data.basisCore?.score)}；行业 {number(data.basisSector?.score)} · {data.basisSector?.label??"未知"}；市场 {number(data.marketBasis.score)} · 高位风险{data.marketBasis.risk}。题材资格按 {data.themeBasis?.date??"待核验"} 的历史成分与主线资格确定：{data.themeBasis?`${data.themeBasis.name} · ${data.themeBasis.label}`:"尚未选择经核验题材"}。</p><p>行业与题材各使用前一日选出的独立样本，排除当前个股；至少3只且80%样本在同分钟数据完整，才能确认同步。样本代表核心群体，不能替代板块全体或概念指数。</p><div className="peer-status">{data.peers.map(p=><span key={p.code}>{p.name} · {p.error?"不可用":`${p.bars.filter(b=>b.time<=f.time).length}根`}</span>)}</div><div className="peer-status">{data.themePeers.map(p=><span key={p.code}>{p.name} · {p.error?"不可用":`${p.bars.filter(b=>b.time<=f.time).length}根`}</span>)}</div><p>VWAP=累计成交额（元）/成交量（股）；换手使用前一交易日流通股本估算。至少20根、从开盘无缺口、当前有成交才允许提示。近5分钟均量比前15分钟≥1.3为放量；近5分钟低点高于前5分钟为抬高；连续3根站上VWAP；突破此前10分钟高点；行业与题材同步才允许转强。正向阶段连续2次满足才转换。跌破承接低点0.2%使本轮逻辑失效。</p><p>辅助信号还要求前一交易日市场策略允许、行业主线资格与核心身份通过、题材归属及资格通过。第一笔需行业与题材不弱，第二笔需VWAP确认并同步，第三笔再需放量突破。分数和阈值为首版可检验规则，尚未回测验证有效性；分钟线不包含真实买卖盘或资金净流入。</p>{data.warnings.map(w=><p className="amber-text" key={w}>{w}</p>)}<button className="text-link" onClick={retry}>重新读取行情</button></details>
    </>}
  </Panel>;
}
