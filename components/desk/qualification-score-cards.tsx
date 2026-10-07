import type {Factor} from "@/lib/decision-engine";

type Check={name:string;result:"通过"|"未通过"|"待核验";detail:string};

/** Keep the independent qualification gate and weighted strength score in one row per metric. */
export function QualificationScoreCards({checks,factors,aliases={}}:{checks:Check[];factors:Factor[];aliases?:Record<string,string>}){
  const byName=new Map(factors.map(f=>[f.name,f]));
  const attached=new Set(checks.map(c=>aliases[c.name]??c.name));
  const cards=[...checks.map(check=>({name:check.name,check,factor:byName.get(aliases[check.name]??check.name)})),...factors.filter(f=>!attached.has(f.name)).map(factor=>({name:factor.name,check:null,factor}))];
  return <div className="qualification-score-grid">{cards.map(({name,check,factor})=><article className="qualification-score-card" key={name}>
    <div className="qualification-score-top"><span className="qualification-score-name">{check&&<strong className={check.result==="通过"?"up":check.result==="未通过"?"down":"muted"}>{check.result}</strong>}<b>{name}</b></span>{factor?<span className="qualification-score-value" title={`强度评分依据：${factor.detail}`}><b>{factor.score===null?"—":factor.score.toFixed(0)}</b><small>/100 · 权重 {factor.weight}%</small></span>:<small className="qualification-score-unweighted">仅资格条件</small>}</div>
    {check&&<p>{check.detail}</p>}
    {factor&&!check&&<p className="qualification-score-basis">仅参与强度评分：{factor.detail}</p>}
  </article>)}</div>;
}
