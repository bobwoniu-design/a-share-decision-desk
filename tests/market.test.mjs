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
const daily=dates.map((d,i)=>({ts_code:code,trade_date:d.replaceAll("-",""),close:i<10?20:10,pre_close:i<10?20:10,pct_chg:0,amount:100000}));
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
