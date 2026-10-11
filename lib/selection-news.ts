// Risk leads require review; a keyword is not a verified adverse event.
const rules: [string, RegExp][] = [
  ["监管、经营或交易风险线索", /立案|处罚|退市|减持|诉讼|违约|亏损|下修|终止|召回|事故|澄清|否认|风险提示/],
  ["股票交易异常波动", /(?:股票|交易|价格|股价).{0,8}(?:严重)?异常波动/],
  ["合作或事项尚未确定", /(?:合作|协议|项目|事项|交易).{0,60}(?:未确定|尚未确定|不确定性)/],
  ["尚未签署正式或有约束力的协议", /未签署.{0,30}(?:正式|约束力).{0,10}协议/],
  ["价格急跌线索", /跌停|跳水|大幅下挫|暴跌/],
];

export function newsRiskReasons(title:string,content:string,name:string,code:string):string[]{
  const related=(text:string)=>text.includes(name)||text.includes(code.slice(0,6));
  // A multi-company news digest must not assign another company's risk to this stock.
  const text=related(title)?`${title} ${content}`:content.split(/[\n①②③④⑤⑥⑦⑧⑨⑩]/).filter(related).join(" ");
  return rules.filter(([,pattern])=>pattern.test(text)).map(([reason])=>reason);
}

export function newsRiskCheck(reasons:string[],failures:string[],matched:number){
  return {label:"消息风险",pass:reasons.length?false:null,detail:reasons.length
    ?`发现待核实线索：${[...new Set(reasons)].join("；")}。请核对原文及影响，不等于已证实利空${failures.length?`；另有来源缺失：${failures.join("；")}`:""}`
    :failures.length?`${failures.join("；")}；消息风险未完成核验`
    :`已匹配 ${matched} 条相关公告/快讯，未识别到风险词；仅做文本筛查，未确认无风险，需人工核对原文`};
}
