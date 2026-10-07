import type {Factor} from "@/lib/decision-engine";

type Check={name:string;result:"通过"|"未通过"|"待核验";detail:string};

/** Show weighted strength factors once; gate-only checks sit in a separate section. */
export function QualificationScoreCards({checks,factors,aliases={}}:{checks:Check[];factors:Factor[];aliases?:Record<string,string>}){
  const byName=new Map(factors.map(f=>[f.name,f]));
  const attached=new Set(checks.map(c=>aliases[c.name]??c.name));
  const cards=[...checks.filter(check=>byName.has(aliases[check.name]??check.name)).map(check=>({name:check.name,check,factor:byName.get(aliases[check.name]??check.name)!})),...factors.filter(f=>!attached.has(f.name)).map(factor=>({name:factor.name,check:null,factor}))];
  const gates=checks.filter(check=>!byName.has(aliases[check.name]??check.name));
  return <><h4 className="qualification-section-title">强度评分因子 <small>分数与权重；标有通过状态的项目也参与资格判断</small></h4><div className="qualification-score-grid">{cards.map(({name,check,factor})=><article className="qualification-score-card" key={name}>
    <div className="qualification-score-top"><span className="qualification-score-name">{check&&<strong className={check.result==="通过"?"up":check.result==="未通过"?"down":"muted"}>{check.result}</strong>}<b>{name}</b></span><span className="qualification-score-value" title={`强度评分依据：${factor.detail}`}><b>{factor.score===null?"—":factor.score.toFixed(0)}</b><small>/100 · 权重 {factor.weight}%</small></span></div>
    {check&&<p>{check.detail}</p>}
    {factor&&!check&&<p className="qualification-score-basis">仅参与强度评分：{factor.detail}</p>}
  </article>)}</div>{gates.length>0&&<section className="qualification-extra"><h4>额外主线资格门槛 <small>不计入强度分</small></h4><div>{gates.map(check=><p key={check.name}><strong className={check.result==="通过"?"up":check.result==="未通过"?"down":"muted"}>{check.result}</strong><b>{check.name}</b><span>{check.detail}</span></p>)}</div></section>}</>;
}
