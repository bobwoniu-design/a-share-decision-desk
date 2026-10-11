"use client";
import {useState} from "react";
import {money, type BrokerStatement} from "@/lib/ledger";

export function BrokerStatements({statements}:{statements:BrokerStatement[]}) {
  const [selected, setSelected] = useState("");
  const sorted = [...statements].sort((a,b)=>b.date.localeCompare(a.date));
  const statement = sorted.find(s=>s.id===selected) ?? sorted[0];
  if (!statement) return null;
  const buys = statement.fills.filter(f=>f.side==="buy");
  const sells = statement.fills.filter(f=>f.side==="sell");
  const amount = (rows:typeof buys)=>rows.reduce((sum,f)=>sum+Math.round(f.price*f.qty*100)/100,0);
  const value = statement.positions.reduce((sum,p)=>sum+Math.round(p.marketPrice*p.qty*100)/100,0);
  return <section className="panel">
    <div className="panel-head"><h2>券商成交与收盘持仓</h2><select aria-label="券商记录日期" value={statement.id} onChange={e=>setSelected(e.target.value)}>{sorted.map(s=><option key={s.id} value={s.id}>{s.date}</option>)}</select></div>
    <div className="page-pad">
      <p><b>已登记 · 待对账</b>　{statement.date}　持仓截图截至 {statement.capturedTime} 北京时间</p>
      <p>{statement.fills.length} 笔已成交委托：买入 {buys.length} 笔，金额约 ¥{money(amount(buys))}；卖出 {sells.length} 笔，金额约 ¥{money(amount(sells))}。</p>
      <p className="amber-text">以下为券商截图原始记录，费用和期初成本尚未补齐，不计入账本盈亏、胜率或已核算持仓。成交时间未知，逐笔保留截图中的委托时间。</p>
      <h3 style={{marginTop:16}}>已显示的收盘持仓 · {statement.positions.length} 只</h3>
      <p>可见持仓市值合计 ¥{money(value)}；{statement.holdingsComplete?"已确认完整":"截图范围尚未确认完整，不代表账户总资产"}。</p>
      <div className="funnel-table-wrap"><table className="history-table"><thead><tr><th>证券</th><th>持仓数量</th><th>可用数量</th><th>券商显示成本</th><th>截图市价</th><th>市值</th></tr></thead><tbody>{statement.positions.map(p=><tr key={p.code}><td><b>{p.name}</b><small>{p.code}</small></td><td>{p.qty.toLocaleString()}</td><td>{p.available.toLocaleString()}</td><td>{p.brokerCost.toFixed(4)}</td><td>{p.marketPrice.toFixed(4)}</td><td>¥{money(p.qty*p.marketPrice)}</td></tr>)}</tbody></table></div>
      <details className="history-details"><summary>查看 {statement.fills.length} 笔已成交委托（重复截图已去重）</summary><p>按委托汇总的成交均价与成交数量；不还原未知的逐笔撮合。金额按截图均价乘数量计算，最终以正式交割单为准。</p><div className="funnel-table-wrap"><table className="history-table"><thead><tr><th>委托时间</th><th>证券</th><th>方向</th><th>成交均价</th><th>成交数量</th><th>金额约</th><th>费用</th></tr></thead><tbody>{[...statement.fills].sort((a,b)=>a.orderTime.localeCompare(b.orderTime)).map(f=><tr key={f.id}><td>{f.orderTime}</td><td>{f.name}<small>{f.code}</small></td><td>{f.side==="buy"?"买入":"卖出"}</td><td>{f.price.toFixed(4)}</td><td>{f.qty.toLocaleString()}</td><td>¥{money(f.price*f.qty)}</td><td>{f.fee===null?"待补":money(f.fee)}</td></tr>)}</tbody></table></div></details>
      <details className="history-details"><summary>来源与待核对事项 · {statement.excludedOrders.length} 笔撤单未计入成交</summary>{statement.notes.map(n=><p key={n}>{n}</p>)}{statement.excludedOrders.map(o=><p key={`${o.code}:${o.orderTime}`}>{o.orderTime} {o.name}　委托 {o.qty.toLocaleString()} @ {o.price.toFixed(4)}；{o.reason}。</p>)}<small>来源：{statement.sourceImages.length} 张用户截图。券商成本仅保存原值，不倒推历史买入或手续费。</small></details>
    </div>
  </section>;
}
