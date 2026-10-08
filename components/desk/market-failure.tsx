"use client";
import {isIpLimit} from "@/lib/market-recovery";

export function MarketFailure({error,retry,recoveryDate,onDate,label="行情暂不可用"}:{error:string;retry:()=>void;recoveryDate?:string|null;onDate?:(date:string)=>void;label?:string}){
  const limited=isIpLimit(error);
  return <div className="history-small-empty" role="alert">
    <p>{label}：{error}</p>
    {limited&&<p>行情请求由站点服务器发出，更换浏览器或本机网络无法处理服务器的 IP 限制。请联系 Tushare 支持核对账号限制，并为行情请求配置固定出口 IP。受限行情未用于评分。</p>}
    {limited&&recoveryDate&&onDate&&<p><button type="button" className="text-link" onClick={()=>onDate(recoveryDate)}>查看 {recoveryDate} 收盘复盘</button> · 切换后按该日收盘数据查看，不代表今日盘中候选。</p>}
    <button type="button" className="text-link" onClick={retry}>{limited?"处理限制后重新检测":"重试"}</button>
  </div>;
}
