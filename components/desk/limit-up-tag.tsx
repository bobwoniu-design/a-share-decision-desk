import type {LimitUpDay} from "@/lib/limit-up";

export type LimitUpStatus={data:LimitUpDay|null;busy:boolean;error:string;retry:()=>void};

export function LimitUpTag({code,date,mode,status}:{code:string;date:string;mode:"close"|"live";status:LimitUpStatus}){
  if(mode==="live")return <span className="limit-up-muted" title="盘中涨停状态尚未按所选日收盘名单核对">待收盘</span>;
  const data=status.data?.date===date?status.data:null;
  const item=data?.byCode[code];
  if(item)return <span className="limit-up-badge" title={`${date} 收盘涨停 · ${item.height} 板`}>涨停</span>;
  if(data)return <span className="limit-up-muted">—</span>;
  if(status.busy)return <span className="limit-up-muted" role="status">核对中…</span>;
  return <button type="button" className="limit-up-retry" title={status.error||"涨停榜名单暂不可用"} onClick={status.retry}>待核验</button>;
}
