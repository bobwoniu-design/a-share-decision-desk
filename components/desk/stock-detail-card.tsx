"use client";
import {useState,type ReactNode} from "react";

export function StockDetailCard({title,subtitle,defaultOpen=false,onVisibilityChange,children}:{title:string;subtitle?:string;defaultOpen?:boolean;onVisibilityChange?:(open:boolean)=>void;children:ReactNode}){
  const [visible,setVisible]=useState(defaultOpen);
  return <details className="stock-detail-card" open={defaultOpen} onToggle={event=>{const open=event.currentTarget.open;setVisible(open);onVisibilityChange?.(open);}}>
    <summary><span className="stock-detail-card-title">{title}</span>{subtitle&&<span className="stock-detail-card-subtitle">{subtitle}</span>}</summary>
    {visible&&<div className="stock-detail-card-body">{children}</div>}
  </details>;
}
