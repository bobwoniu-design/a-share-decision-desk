"use client";

import {createContext,useContext,useMemo,type ReactNode} from "react";
import type {FunnelOverview} from "@/lib/funnel";
import {useDecision} from "./decision";
import {useDesk} from "./provider";

type SelectionContext={autoCodes:Set<string>;ready:boolean;failed:boolean};
const Context=createContext<SelectionContext>({autoCodes:new Set(),ready:false,failed:false});

export function SelectionStatusProvider({date,mode,active,children}:{date:string;mode:"close"|"live";active:boolean;children:ReactNode}){
  const {data,error}=useDecision<FunnelOverview>(active?`/api/market/decision?view=funnel&date=${date}&mode=${mode}`:null,active&&mode==="live");
  const value=useMemo(()=>({autoCodes:new Set(data?.date===date&&data.mode===mode?data.candidates.map(stock=>stock.code):[]),ready:data?.date===date&&data.mode===mode,failed:!!error}),[data,date,mode,error]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function SelectionStatus({code,name}:{code:string;name:string}){
  const {autoCodes,ready,failed}=useContext(Context);
  const {ledger,loading,error,busy,save}=useDesk();
  const auto=autoCodes.has(code),manual=ledger.watchlist.some(stock=>stock.code===code);
  const canAdd=!auto&&!manual;
  return <div className="selection-source-cell">
    {auto&&<span className="selection-source-badge auto" title="所选日期由行业／题材／个股评分策略自动入池">自动入池</span>}
    {manual&&<span className="selection-source-badge manual" title="已加入个人自选">手工自选</span>}
    {!auto&&!manual&&<span className="selection-source-badge" title={ready?"未进入所选日期的自动候选池，也未加入个人自选":"自动候选池仍在读取或暂时不可用"}>{ready?"未选":"自动待核验"}</span>}
    {!auto&&manual&&!ready&&<span className="selection-source-badge">自动待核验</span>}
    {canAdd&&<button type="button" className="selection-source-add" disabled={loading||!!error||busy} onClick={event=>{event.stopPropagation();void save("watch",{code,name});}}>{loading||!!error?"账本待核验":busy?"保存中…":"加入自选"}</button>}
    {failed&&!auto&&!ready&&<small>候选池读取失败</small>}
  </div>;
}
