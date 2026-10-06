import test from "node:test";
import assert from "node:assert/strict";
import {dailyRows,minuteRows,breadth,limits,validDate} from "../lib/market-data.ts";
test("daily totals preserve BJ breadth but exclude BJ from Shanghai/Shenzhen turnover",()=>{
 const data=dailyRows([{ts_code:"600000.SH",trade_date:"20260930",close:10,pre_close:9,pct_chg:11.11,amount:100000},{ts_code:"920001.BJ",trade_date:"20260930",close:8,pre_close:9,pct_chg:-11.11,amount:200000}],"2026-09-30");
 assert.deepEqual(breadth(data),{total:2,up:1,down:1,flat:0,amountYi:1});
 assert.throws(()=>dailyRows([{...data[0],ts_code:"600000.SH",trade_date:"20260929"}],"2026-09-30"));
});
test("missing amount and duplicate codes cannot produce complete market totals",()=>{
 const r={ts_code:"600000.SH",trade_date:"20260930",close:10,pre_close:9,pct_chg:11.11,amount:null};
 assert.throws(()=>dailyRows([r],"2026-09-30"));assert.throws(()=>dailyRows([{...r,amount:1},{...r,amount:1}],"2026-09-30"));
});
test("limit permission gaps stay null and broken-board denominator counts touched symbols",()=>{
 assert.equal(limits(null),null);assert.equal(limits([]).brokenRate,null);
 const s=limits([{ts_code:"a",limit:"U",limit_times:3},{ts_code:"b",limit:"Z"}]);assert.equal(s.brokenRate,50);assert.equal(s.height,3);
});
test("minutes use yuan/share without conversion and reject wrong date or symbol",()=>{
 const r={ts_code:"600000.SH",trade_time:"2026-09-30 09:31:00",open:10,high:11,low:9,close:10,vol:100,amount:1000};
 const b=minuteRows([r],"600000.SH","2026-09-30")[0];assert.equal(b.amount/b.vol,10);
 assert.throws(()=>minuteRows([r],"000001.SZ","2026-09-30"));assert.throws(()=>minuteRows([r],"600000.SH","2025-09-30"));assert.throws(()=>minuteRows([r,r],"600000.SH","2026-09-30"));
 assert.equal(validDate("2026-02-30"),false);assert.equal(validDate("2026-09-30"),true);
});

import {tradingDates,dailyHistory} from "../lib/market-data.ts";
test("history calendar excludes closures and future rows and counts trading days",()=>{
 const rows=[{cal_date:"20260925",is_open:1},{cal_date:"20260926",is_open:0},{cal_date:"20260928",is_open:1},{cal_date:"20260929",is_open:1},{cal_date:"20260930",is_open:1},{cal_date:"20261008",is_open:1}];
 assert.deepEqual(tradingDates(rows,"2026-09-30",3),["2026-09-28","2026-09-29","2026-09-30"]);
});
const code="600000.SH",dates=Array.from({length:25},(_,i)=>`2026-09-${String(i+1).padStart(2,"0")}`);
const daily=dates.map((d,i)=>({ts_code:code,trade_date:d.replaceAll("-",""),open:i<10?20:10,high:i<10?22:11,low:i<10?18:9,vol:10000,close:i<10?20:10,pre_close:i<10?20:10,pct_chg:0,amount:100000}));
const factors=daily.map((r,i)=>({ts_code:code,trade_date:r.trade_date,adj_factor:i<10?1:2}));
test("adjustment prevents a split from creating a false return or moving-average discontinuity",()=>{
 const h=dailyHistory(daily,factors,code,dates);
 assert.equal(h.return20,0);assert.equal(h.return5,0);assert.ok(h.points.every(p=>p.adjustedClose===10));assert.equal(h.points.at(-1).ma20,10);assert.equal(h.points[0].close,20);assert.equal(h.points[0].preClose,20);assert.equal(h.points[0].amountYi,1);
});
test("missing adjustment or interval endpoint does not produce a fabricated interval return",()=>{
 const raw=dailyHistory(daily,factors.slice(1),code,dates);assert.equal(raw.adjusted,false);assert.equal(raw.return20,null);assert.equal(raw.points.at(-1).ma20,null);
 const missing=dailyHistory(daily.slice(0,-1),factors,code,dates);assert.equal(missing.return5,null);assert.deepEqual(missing.missingDates,[dates.at(-1)]);
});
test("daily history rejects wrong symbols, extra dates, and duplicate rows",()=>{
 assert.throws(()=>dailyHistory([...daily,daily[0]],factors,code,dates));
 assert.throws(()=>dailyHistory(daily,factors,"000001.SZ",dates));
 assert.throws(()=>dailyHistory(daily,factors,code,dates.slice(1)));
});
test("OHLC is adjusted consistently while money and volume stay unadjusted",()=>{
 const h=dailyHistory(daily,factors,code,dates),p=h.points[0];assert.equal(p.adjustedOpen,10);assert.equal(p.adjustedHigh,11);assert.equal(p.adjustedLow,9);assert.equal(p.amountYi,1);assert.equal(p.volShou,10000);
 assert.throws(()=>dailyHistory([{...daily[0],high:5}],factors,code,[dates[0]]));
 const varying=daily.map((r,i)=>({...r,amount:i===5?200000:100000}));
 const v=dailyHistory(varying,factors,code,dates);assert.equal(v.points[4].amountRatio5,null);assert.equal(v.points[5].amountRatio5,2);assert.equal(v.points[5].amountMa5,1.2);
});
import {sectorGroups} from "../lib/sectors.ts";
test("sector coverage includes non-candidates, declining and missing stocks, excludes future listings",()=>{
 const basic=[1,2,3,4].map(n=>({ts_code:`60000${n}.SH`,name:`股票${n}`,industry:"行业甲",list_date:n===4?"20261010":"20200101"}));
 const prices=[{code:"600001.SH",close:11,pct:10,amount:1e8,preClose:10},{code:"600002.SH",close:9,pct:-10,amount:2e8,preClose:10}];
 const g=sectorGroups(prices,basic,[{ts_code:"600001.SH",limit:"U",limit_times:2}],"2026-09-30")[0];
 assert.equal(g.total,3);assert.equal(g.traded,2);assert.equal(g.up,1);assert.equal(g.down,1);assert.equal(g.flat,0);assert.equal(g.averagePct,0);assert.equal(g.amountYi,3);assert.equal(g.members.find(m=>m.code==="600003.SH").quote,null);assert.equal(g.members[0].leaderRank,1);
});
test("leadership sorts height before percentage; ST and missing-source cases are not auto-leaders",()=>{
 const basic=[1,2,3].map(n=>({ts_code:`60000${n}.SH`,name:n===3?"ST例子":`股票${n}`,industry:"行业甲",list_date:"20200101"}));
 const prices=[{code:"600001.SH",close:11,pct:10,amount:1e8,preClose:10},{code:"600002.SH",close:12,pct:20,amount:3e8,preClose:10},{code:"600003.SH",close:12,pct:20,amount:4e8,preClose:10}];
 const ranked=sectorGroups(prices,basic,[{ts_code:"600001.SH",limit:"U",limit_times:4},{ts_code:"600002.SH",limit:"U",limit_times:1}],"2026-09-30")[0];
 assert.equal(ranked.members[0].code,"600001.SH");assert.equal(ranked.members[1].leaderRank,2);assert.equal(ranked.members[2].leaderRank,null);
 const missing=sectorGroups(prices,basic,null,"2026-09-30")[0];assert.equal(missing.limitUp,null);assert.ok(missing.members.every(m=>m.leaderRank===null));
 assert.throws(()=>sectorGroups(prices,[...basic,basic[0]],[],"2026-09-30"));
});

test("flat candles preserve exact OHLC equality when adjustment factors cancel",()=>{
 const r={ts_code:code,trade_date:"20260930",open:6.42,high:6.42,low:6.42,close:6.42,pre_close:5.84,pct_chg:9.93,vol:1000,amount:100000};
 const h=dailyHistory([r],[{ts_code:code,trade_date:"20260930",adj_factor:2.317}],code,["2026-09-30"]);
 assert.equal(h.points[0].adjustedClose,h.points[0].adjustedOpen);assert.equal(h.points[0].adjustedClose,h.points[0].adjustedHigh);
});


test("minute VWAP rejects inconsistent zeros and incompatible units",()=>{
 const r={ts_code:"600000.SH",trade_time:"2026-09-30 09:31:00",open:10,high:11,low:9,close:10,vol:100,amount:1000};
 assert.throws(()=>minuteRows([{...r,amount:0}],r.ts_code,"2026-09-30"));
 assert.throws(()=>minuteRows([{...r,amount:100000}],r.ts_code,"2026-09-30"));
 assert.equal(minuteRows([{...r,amount:0,vol:0}],r.ts_code,"2026-09-30").length,1);
});
