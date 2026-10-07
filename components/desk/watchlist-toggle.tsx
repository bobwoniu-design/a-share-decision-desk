"use client";

import {useDesk} from "./provider";

export function WatchlistToggle({code,name}:{code:string;name:string}){
  const {ledger,loading,error,busy,save}=useDesk();
  const watched=ledger.watchlist.some(stock=>stock.code===code);
  const unavailable=loading||!!error;
  const label=unavailable?"自选待核验":watched?"已自选 · 移出":"加入自选";
  return <button type="button" className={`watchlist-toggle ${watched&&!unavailable?"active":""}`} aria-label={`${name}：${label}`} aria-pressed={!unavailable&&watched} title={unavailable?"个人账本尚未就绪":watched?"从个人自选名单移出":"加入个人自选名单；交易候选不会自动加入"} disabled={busy||unavailable} onClick={()=>{void save("watch",{code,name,remove:watched});}}>{label}</button>;
}
