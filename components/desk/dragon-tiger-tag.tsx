import type {DragonTigerDay} from "@/lib/dragon-tiger";

export type DragonTigerStatus={data:DragonTigerDay|null;busy:boolean;error:string;retry:()=>void};

export function DragonTigerTag({code,date,mode,status}:{code:string;date:string;mode:"close"|"live";status:DragonTigerStatus}){
  if(mode==="live")return <span className="dragon-tiger-muted" title="盘中龙虎榜名单尚未按所选日公布">待公布</span>;
  const data=status.data?.date===date?status.data:null;
  const item=data?.byCode[code];
  if(item)return <span className="dragon-tiger-badge" title={`${date} 龙虎榜${item.reasons.length?`：${item.reasons.join("；")}`:""}`}>龙虎榜</span>;
  if(data)return <span className="dragon-tiger-muted">—</span>;
  if(status.busy)return <span className="dragon-tiger-muted" role="status">核对中…</span>;
  return <button type="button" className="dragon-tiger-retry" title={status.error??"龙虎榜名单暂不可用"} onClick={status.retry}>待核验</button>;
}
